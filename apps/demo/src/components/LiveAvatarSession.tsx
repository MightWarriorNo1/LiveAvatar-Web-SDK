"use client";

import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useTextChat,
  useVoiceChat,
  useLiveAvatarContext,
} from "../liveavatar";
import { SessionState, AgentEventsEnum } from "@heygen/liveavatar-web-sdk";
import { useAvatarActions } from "../liveavatar/useAvatarActions";

const Button: React.FC<{
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
}> = ({ onClick, disabled, children }) => {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="bg-white text-black px-4 py-2 rounded-md"
    >
      {children}
    </button>
  );
};

const LiveAvatarSessionComponent: React.FC<{
  mode: "FULL" | "CUSTOM";
  onSessionStopped: () => void;
}> = ({ mode, onSessionStopped }) => {
  const [message, setMessage] = useState("");
  const {
    sessionState,
    isStreamReady,
    startSession,
    stopSession,
    connectionQuality,
    keepAlive,
    attachElement,
  } = useSession();
  const { microphoneWarning } = useLiveAvatarContext();
  const {
    isAvatarTalking,
    isUserTalking,
    isMuted,
    isActive,
    isLoading,
    start,
    stop,
    mute,
    unmute,
  } = useVoiceChat();

  const { interrupt, repeat, startListening, stopListening } =
    useAvatarActions(mode);

  const { sendMessage } = useTextChat(mode);
  const { sessionRef } = useLiveAvatarContext();
  const videoRef = useRef<HTMLVideoElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraPreviewRef = useRef<HTMLVideoElement>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [cameraStream, setCameraStream] = useState<MediaStream | null>(null);
  const [imageAnalysis, setImageAnalysis] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isAnalyzingCamera, setIsAnalyzingCamera] = useState(false);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
    }
  }, [attachElement, isStreamReady]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
    };
  }, [cameraStream]);

  // Set camera stream to video element when both are available
  useEffect(() => {
    if (cameraStream && cameraPreviewRef.current && isCameraActive) {
      cameraPreviewRef.current.srcObject = cameraStream;
    } else if (!cameraStream && cameraPreviewRef.current) {
      // Clean up when stream is removed
      cameraPreviewRef.current.srcObject = null;
    }
  }, [cameraStream, isCameraActive]);

  // Function to capture frame from camera and analyze it
  const analyzeCameraFeed = useCallback(async () => {
    if (!cameraPreviewRef.current || !isCameraActive) {
      return;
    }

    setIsAnalyzingCamera(true);
    try {
      // Capture frame from video element
      const canvas = document.createElement("canvas");
      canvas.width = cameraPreviewRef.current.videoWidth || 160;
      canvas.height = cameraPreviewRef.current.videoHeight || 120;
      const ctx = canvas.getContext("2d");
      
      if (!ctx) {
        throw new Error("Could not get canvas context");
      }

      ctx.drawImage(cameraPreviewRef.current, 0, 0, canvas.width, canvas.height);
      
      // Convert canvas to blob
      canvas.toBlob(async (blob) => {
        if (!blob) {
          throw new Error("Failed to capture frame");
        }

        try {
          // Create FormData and send to analyze-image API
          const formData = new FormData();
          formData.append("image", blob, "camera-frame.jpg");

          const response = await fetch("/api/analyze-image", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to analyze camera feed");
          }

          const data = await response.json();
          const analysis = data.analysis;

          // Have the avatar speak the analysis
          if (sessionRef.current && mode === "FULL") {
            sessionRef.current.message(analysis);
          }
        } catch (error) {
          console.error("Error analyzing camera feed:", error);
          if (sessionRef.current && mode === "FULL") {
            sessionRef.current.message("Oops! I had trouble analyzing what I'm seeing through the camera. Could you try asking again?");
          }
        } finally {
          setIsAnalyzingCamera(false);
        }
      }, "image/jpeg", 0.95);
    } catch (error) {
      console.error("Error capturing camera frame:", error);
      setIsAnalyzingCamera(false);
      if (sessionRef.current && mode === "FULL") {
        sessionRef.current.message("Hmm, I couldn't capture what I'm seeing right now. Let me try again in a moment!");
      }
    }
  }, [isCameraActive, sessionRef, mode]);

  // Listen for user transcriptions and handle camera-related questions
  useEffect(() => {
    if (!sessionRef.current) return;

    const handleUserTranscription = (event: { text: string }) => {
      const userMessage = event.text.toLowerCase();
      
      // Check if message is related to camera/seeing/viewing
      const cameraKeywords = [
        "camera",
        "see",
        "seeing",
        "what can you see",
        "what do you see",
        "what are you seeing",
        "describe what you see",
        "tell me what you see",
        "what's in the camera",
        "what's on the camera",
        "analyze the camera",
        "look at the camera",
        "view the camera",
      ];

      const isCameraRelated = cameraKeywords.some(keyword => 
        userMessage.includes(keyword)
      );

      if (isCameraRelated && isCameraActive && cameraPreviewRef.current && !isAnalyzingCamera) {
        analyzeCameraFeed();
      }
    };

    sessionRef.current.on(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);

    return () => {
      if (sessionRef.current) {
        sessionRef.current.off(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
      }
    };
  }, [sessionRef, isCameraActive, isAnalyzingCamera, analyzeCameraFeed]);

  const handleCameraClick = async () => {
    if (isCameraActive) {
      // Stop camera if already active
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
      }
      setIsCameraActive(false);
      return;
    }

    try {
      // First try to get rear camera (environment)
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (error) {
        // If rear camera fails, try front camera (user)
        console.log("Rear camera not available, trying front camera");
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "user" },
        });
      }

      if (stream) {
        setCameraStream(stream);
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      alert("Unable to access camera. Please check permissions.");
    }
  };

  const handleFileUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleCameraChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Handle camera image
      console.log("Camera image selected:", file);
      // Add your camera image handling logic here
    }
    // Reset input
    if (cameraInputRef.current) {
      cameraInputRef.current.value = "";
    }
  };

  const closeCameraPreview = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Check if file is an image
      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file");
        if (fileInputRef.current) {
          fileInputRef.current.value = "";
        }
        return;
      }

      setIsAnalyzingImage(true);
      try {
        const formData = new FormData();
        formData.append("image", file);

        const response = await fetch("/api/analyze-image", {
          method: "POST",
          body: formData,
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to analyze image");
        }

        const data = await response.json();
        setImageAnalysis(data.analysis);
        console.log("Image analyzed successfully");
        
        // For FULL mode, send the analysis as context to the AI
        if (mode === "FULL" && sessionRef.current) {
          const contextMessage = `[IMAGE CONTEXT] I have uploaded an image. Here is the detailed analysis: ${data.analysis}. Please remember this analysis and use it to answer any questions I ask about the image or related content.`;
          sessionRef.current.message(contextMessage);
        }
      } catch (error) {
        console.error("Error analyzing image:", error);
        alert("Failed to analyze image. Please try again.");
      } finally {
        setIsAnalyzingImage(false);
      }
    }
    // Reset input
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const VoiceChatComponents = (
    <>
      <p>Voice Chat Active: {isActive ? "true" : "false"}</p>
      <p>Voice Chat Loading: {isLoading ? "true" : "false"}</p>
      {isActive && <p>Muted: {isMuted ? "true" : "false"}</p>}
      <Button
        onClick={() => {
          if (isActive) {
            stop();
          } else {
            start();
          }
        }}
        disabled={isLoading}
      >
        {isActive ? "Stop Voice Chat" : "Start Voice Chat"}
      </Button>
      {isActive && (
        <Button
          onClick={() => {
            if (isMuted) {
              unmute();
            } else {
              mute();
            }
          }}
        >
          {isMuted ? "Unmute" : "Mute"}
        </Button>
      )}
    </>
  );

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black flex flex-col">
      {/* Text overlays at the top */}
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col items-center pt-4">
        <h1 className="text-white text-2xl font-semibold">iSolveUrProblems-Beta</h1>
        <p className="text-white text-xs mt-1">Everything except Murder</p>
        {microphoneWarning && (
          <div className="mt-4 bg-yellow-500 text-black px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">⚠️ Warning: {microphoneWarning}</p>
          </div>
        )}
        {(isAnalyzingImage || isAnalyzingCamera) && (
          <div className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">🔄 {isAnalyzingCamera ? "Analyzing camera feed..." : "Analyzing image..."}</p>
          </div>
        )}
        {imageAnalysis && !isAnalyzingImage && !isAnalyzingCamera && (
          <div className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">✅ Image analyzed successfully</p>
          </div>
        )}
      </div>

      {/* Camera Preview Full Screen (when active) */}
      {isCameraActive && (
        <video
          ref={cameraPreviewRef}
          autoPlay
          playsInline
          className="absolute inset-0 w-full h-full object-cover z-0"
        />
      )}

      {/* Avatar Video - Full screen when camera inactive, small corner when camera active */}
      <div className={`relative ${isCameraActive ? 'w-64 h-48 top-4 left-4' : 'w-full h-full'} flex items-center justify-center z-10`}>
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`${isCameraActive ? 'w-full h-full object-contain rounded-lg shadow-2xl border-2 border-white' : 'w-full h-full object-contain'}`}
        />
      </div>

      {/* Control Buttons */}
      <div className="relative z-20">
        {mode === "FULL" && (
          <>
            <input
              ref={cameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleCameraChange}
            />
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
            <button
              className="absolute bottom-20 left-1/4 bg-white text-black px-6 py-3 rounded-md z-20 transform -translate-x-1/2 flex items-center justify-center gap-2 hover:bg-gray-200"
              onClick={handleCameraClick}
            >
              📷 {isCameraActive ? "Close Camera" : "Camera"}
            </button>
            <button
              className="absolute bottom-20 right-1/4 bg-white text-black px-6 py-3 rounded-md z-20 transform translate-x-1/2 flex items-center justify-center gap-2 hover:bg-gray-200"
              onClick={handleFileUploadClick}
            >
              📁 Upload
            </button>
            {/* {imageAnalysis && !isAnalyzingImage && (
              <button
                className="absolute bottom-32 left-1/2 bg-green-500 text-white px-6 py-3 rounded-md z-20 transform -translate-x-1/2 flex items-center justify-center gap-2 hover:bg-green-600"
                onClick={() => repeat(imageAnalysis)}
              >
                🧪 Test: Speak Analysis
              </button>
            )} */}
          </>
        )}
        <button
          className="absolute bottom-4 right-4 bg-white text-black px-4 py-2 rounded-md z-20 hover:bg-gray-200"
          onClick={() => stopSession()}
        >
          Stop
        </button>
      </div>
    </div>
  );
};

export const LiveAvatarSession: React.FC<{
  mode: "FULL" | "CUSTOM";
  sessionAccessToken: string;
  onSessionStopped: () => void;
}> = ({ mode, sessionAccessToken, onSessionStopped }) => {
  return (
    <LiveAvatarContextProvider sessionAccessToken={sessionAccessToken}>
      <LiveAvatarSessionComponent
        mode={mode}
        onSessionStopped={onSessionStopped}
      />
    </LiveAvatarContextProvider>
  );
};

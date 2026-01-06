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
  const [isProcessingCameraQuestion, setIsProcessingCameraQuestion] = useState(false);

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
    if (cameraStream && cameraPreviewRef.current) {
      cameraPreviewRef.current.srcObject = cameraStream;
    }
  }, [cameraStream, isCameraActive]);

  // Function to capture frame from camera video
  const captureCameraFrame = useCallback(async (): Promise<File | null> => {
    if (!cameraPreviewRef.current || !isCameraActive) {
      return null;
    }

    try {
      const video = cameraPreviewRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        return null;
      }
      ctx.drawImage(video, 0, 0);
      
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-frame.jpg", { type: "image/jpeg" });
            resolve(file);
          } else {
            resolve(null);
          }
        }, "image/jpeg", 0.95);
      });
    } catch (error) {
      console.error("Error capturing camera frame:", error);
      return null;
    }
  }, [isCameraActive]);

  // Function to check if user question is about the camera
  const isCameraRelatedQuestion = useCallback((text: string): boolean => {
    const cameraKeywords = [
      "camera",
      "what can you see",
      "what do you see",
      "what are you seeing",
      "describe what you see",
      "explain what you see",
      "tell me about",
      "what's in",
      "what is in",
      "analyze",
      "look at",
      "see via camera",
      "via camera",
    ];
    const lowerText = text.toLowerCase();
    return cameraKeywords.some((keyword) => lowerText.includes(keyword));
  }, []);

  // Listen to user transcriptions and handle camera-related questions
  useEffect(() => {
    if (!sessionRef.current || !isCameraActive) {
      return;
    }

    const handleUserTranscription = async (event: { text: string }) => {
      const userText = event.text;
      
      // Check if the question is about the camera
      if (isCameraRelatedQuestion(userText) && !isProcessingCameraQuestion) {
        setIsProcessingCameraQuestion(true);
        setIsAnalyzingImage(true);

        try {
          // Capture frame from camera
          const frameFile = await captureCameraFrame();
          
          if (!frameFile) {
            console.error("Failed to capture camera frame");
            setIsProcessingCameraQuestion(false);
            setIsAnalyzingImage(false);
            return;
          }

          // Send to analyze-image API
          const formData = new FormData();
          formData.append("image", frameFile);

          const response = await fetch("/api/analyze-image", {
            method: "POST",
            body: formData,
          });

          if (!response.ok) {
            const error = await response.json();
            throw new Error(error.error || "Failed to analyze camera frame");
          }

          const data = await response.json();
          const analysis = data.analysis;
          setImageAnalysis(analysis);

          // Format the response as a conversational message for the avatar
          // The analysis from GrokAI is already funny, gregarious, and happy
          const responseMessage = `Oh wow! Let me tell you what I'm seeing through the camera! ${analysis} Pretty cool, right?`;

          // Send the response to the avatar
          if (sessionRef.current && mode === "FULL") {
            sessionRef.current.message(responseMessage);
          }
        } catch (error) {
          console.error("Error processing camera question:", error);
          // Send a friendly error message
          if (sessionRef.current && mode === "FULL") {
            sessionRef.current.message("Oops! I had a little trouble analyzing what I'm seeing right now. Could you try asking again?");
          }
        } finally {
          setIsProcessingCameraQuestion(false);
          setIsAnalyzingImage(false);
        }
      }
    };

    sessionRef.current.on(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);

    return () => {
      if (sessionRef.current) {
        // Use removeListener if off is not available
        if (typeof (sessionRef.current as any).off === 'function') {
          (sessionRef.current as any).off(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
        } else if (typeof (sessionRef.current as any).removeListener === 'function') {
          (sessionRef.current as any).removeListener(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
        }
      }
    };
  }, [sessionRef, isCameraActive, isProcessingCameraQuestion, mode, captureCameraFrame, isCameraRelatedQuestion]);

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
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col items-center pt-4 pb-2">
        <h1 className="text-white text-2xl font-semibold">iSolveUrProblems-Beta</h1>
        <p className="text-white text-xs mt-1">Everything except Murder</p>
        {microphoneWarning && (
          <div className="mt-4 bg-yellow-500 text-black px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">⚠️ Warning: {microphoneWarning}</p>
          </div>
        )}
        {isAnalyzingImage && (
          <div className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">🔄 Analyzing image...</p>
          </div>
        )}
        {imageAnalysis && !isAnalyzingImage && (
          <div className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">✅ Image analyzed successfully</p>
          </div>
        )}
      </div>

      {/* Full screen video */}
      <div className={`relative w-full flex-1 flex items-center justify-center ${isCameraActive ? 'pt-24' : ''}`}>
        {/* Avatar video - full screen when camera inactive, small overlay in left corner when camera active */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className={`${
            isCameraActive 
              ? 'absolute top-24 left-4 w-64 h-48 object-contain z-20 rounded-lg border-2 border-white shadow-2xl' 
              : 'h-full w-full object-contain'
          }`}
        />
        
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
          </>
        )}

        {/* Camera Preview - full screen under header when active */}
        {isCameraActive && (
          <div className="absolute inset-0 pt-24 flex items-center justify-center z-10">
            <video
              ref={cameraPreviewRef}
              autoPlay
              playsInline
              className="max-h-[calc(100vh-6rem)] w-full object-contain"
            />
            <button
              className="absolute top-4 right-4 bg-red-600 text-white px-6 py-3 rounded-md z-40 hover:bg-red-700"
              onClick={closeCameraPreview}
            >
              Close Camera
            </button>
          </div>
        )}
      </div>

      {/* Fixed buttons at bottom - positioned relative to viewport */}
      {mode === "FULL" && (
        <>
          <button
            className="fixed bottom-20 left-1/4 bg-white text-black px-6 py-3 rounded-md z-20 transform -translate-x-1/2 flex items-center justify-center gap-2"
            onClick={handleCameraClick}
          >
            📷 {isCameraActive ? "Close Camera" : "Camera"}
          </button>
          <button
            className="fixed bottom-20 right-1/4 bg-white text-black px-6 py-3 rounded-md z-20 transform translate-x-1/2 flex items-center justify-center gap-2"
            onClick={handleFileUploadClick}
          >
            📁 Upload
          </button>
        </>
      )}
      <button
        className="fixed bottom-4 right-4 bg-white text-black px-4 py-2 rounded-md z-20"
        onClick={() => stopSession()}
      >
        Stop
      </button>
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

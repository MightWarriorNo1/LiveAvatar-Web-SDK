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
import { Radio, Camera, Image as ImageIcon, Video } from "lucide-react";

// Then in your buttons:
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
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [fallbackImage, setFallbackImage] = useState<File | null>(null);
  const [fallbackImagePreview, setFallbackImagePreview] = useState<string | null>(null);
  const lastProcessedQuestionRef = useRef<string>("");
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackImageInputRef = useRef<HTMLInputElement>(null);
  const isDebugProcessingRef = useRef<boolean>(false);
  const lastAvatarResponseRef = useRef<string>("");
  const hasAutoAnalyzedRef = useRef<boolean>(false);

  const [uploadType, setUploadType] = useState<string>('image');
  const isAttachedRef = useRef<boolean>(false);
  const greetingTriggeredRef = useRef<boolean>(false);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
      // Reset greeting trigger when session disconnects
      greetingTriggeredRef.current = false;
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    // console.log("isStreamReady: ", isStreamReady);
    // console.log("videoRef.current: ", videoRef.current);
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
      // console.log("attached element");
      
      // Trigger greeting after video is ready (only in FULL mode and only once)
      if (mode === "FULL" && !greetingTriggeredRef.current && sessionRef.current) {
        greetingTriggeredRef.current = true;
        
        // Wait a moment for video to render, then trigger greeting
        const timer = setTimeout(() => {
          if (sessionRef.current) {
            // Send trigger message to start greeting
            sessionRef.current.message("Please greet the user now");
          }
        }, 1000); // 1 second delay after video is ready
        
        // Cleanup timeout on unmount or if dependencies change
        return () => {
          clearTimeout(timer);
        };
      }
    }
  }, [attachElement, isStreamReady, mode, sessionRef]);







  













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
      // Cleanup timeout on unmount
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [cameraStream]);

  // Set camera stream to video element when both are available
  useEffect(() => {
    if (cameraStream && cameraPreviewRef.current) {
      const video = cameraPreviewRef.current;
      video.srcObject = cameraStream;
      
      // Ensure video plays
      video.play().catch((error) => {
        console.error("Error playing camera video:", error);
      });
      
      // Log when video is ready
      const onLoadedMetadata = () => {
        console.log("Camera video metadata loaded:", {
          width: video.videoWidth,
          height: video.videoHeight,
          readyState: video.readyState
        });
      };
      
      video.addEventListener("loadedmetadata", onLoadedMetadata);
      
      return () => {
        video.removeEventListener("loadedmetadata", onLoadedMetadata);
      };
    }
  }, [cameraStream, isCameraActive]);

  // Function to capture frame from camera video or use fallback image
  const captureCameraFrame = useCallback(async (): Promise<File | null> => {
    if (!isCameraActive) {
      return null;
    }

    // If using fallback image, return it directly
    if (fallbackImage) {
      console.log("Using fallback image:", fallbackImage.name);
      return fallbackImage;
    }

    // Otherwise, try to capture from camera
    if (!cameraPreviewRef.current) {
      console.error("Camera preview ref not available");
      return null;
    }

    try {
      const video = cameraPreviewRef.current;
      
      // Wait for video to be ready with valid dimensions
      if (video.readyState < 2) {
        // Video not ready, wait for loadedmetadata
        await new Promise<void>((resolve, reject) => {
          const timeout = setTimeout(() => {
            reject(new Error("Video metadata loading timeout"));
          }, 3000);
          
          const onLoadedMetadata = () => {
            clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            resolve();
          };
          
          video.addEventListener("loadedmetadata", onLoadedMetadata);
          
          // If already loaded, resolve immediately
          if (video.readyState >= 2) {
            clearTimeout(timeout);
            video.removeEventListener("loadedmetadata", onLoadedMetadata);
            resolve();
          }
        });
      }

      // Check if video has valid dimensions
      if (video.videoWidth === 0 || video.videoHeight === 0) {
        console.error("Video has invalid dimensions:", video.videoWidth, video.videoHeight);
        return null;
      }

      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        console.error("Failed to get canvas context");
        return null;
      }
      
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      
      return new Promise((resolve) => {
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], "camera-frame.jpg", { type: "image/jpeg" });
            console.log("Camera frame captured successfully:", {
              width: canvas.width,
              height: canvas.height,
              fileSize: file.size
            });
            resolve(file);
          } else {
            console.error("Failed to convert canvas to blob");
            resolve(null);
          }
        }, "image/jpeg", 0.95);
      });
    } catch (error) {
      console.error("Error capturing camera frame:", error);
      return null;
    }
  }, [isCameraActive, fallbackImage]);

  // Function to process camera question (reusable for both voice and debug button)
  const processCameraQuestion = useCallback(async (question: string, skipDuplicateCheck: boolean = false) => {
    console.log("processCameraQuestion called", { question, skipDuplicateCheck, isCameraActive, isProcessingCameraQuestion });
    
    if (!isCameraActive) {
      console.log("Camera not active, returning early");
      return;
    }

    const userText = question.trim();
    
    // Allow empty question for general analysis (when camera mode is first activated)
    // Skip only if we're not doing a general analysis (skipDuplicateCheck is false and question is empty)
    if (userText.length === 0 && !skipDuplicateCheck) {
      console.log("Question is empty and not a general analysis request, returning early");
      return;
    }

    // Skip if already processing (use ref for immediate check to prevent race conditions)
    // Note: We allow processing if isDebugProcessingRef is set by the current call
    // The check is done in handleDebugAnalysis before calling this function
    if (isProcessingCameraQuestion) {
      console.log("Already processing, skipping duplicate request");
      return;
    }

    // Skip duplicate check if explicitly skipped (for debug button)
    if (!skipDuplicateCheck && lastProcessedQuestionRef.current === userText) {
      console.log("Skipping duplicate question:", userText);
      return;
    }
    
    // Clear any existing timeout
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
    }
    
    // Mark as processing and store the question
    console.log("Processing question with camera frame analysis...");
    setIsProcessingCameraQuestion(true);
    setIsAnalyzingImage(true);
    lastProcessedQuestionRef.current = userText;

    try {
      // Capture frame from camera or use fallback image
      console.log("Capturing camera frame or using fallback image...");
      const frameFile = await captureCameraFrame();
      
      if (!frameFile) {
        console.error("Failed to capture camera frame or no fallback image");
        if (mode === "FULL") {
          if (cameraAvailable === false && !fallbackImage) {
            await repeat("I don't have a camera or image to analyze right now. Please upload an image first by clicking the Camera button and selecting an image!");
          } else {
            await repeat("Hmm, I'm having trouble capturing what I'm seeing right now. Could you try asking again in a moment?");
          }
        }
        setIsProcessingCameraQuestion(false);
        setIsAnalyzingImage(false);
        // Reset after a delay to allow retry
        processingTimeoutRef.current = setTimeout(() => {
          lastProcessedQuestionRef.current = "";
        }, 2000);
        return;
      }

      console.log("Frame captured, sending to API with question:", userText);
      // Send to analyze-image API with the user's question
      const formData = new FormData();
      formData.append("image", frameFile);
      formData.append("question", userText);

      const response = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("API error:", error);
        throw new Error(error.error || "Failed to analyze camera frame");
      }

      const data = await response.json();
      const analysis = data.analysis;
      console.log("Analysis received:", analysis.substring(0, 100) + "...");
      setImageAnalysis(analysis);

      // The analysis from GrokAI already includes the answer to the question with funny, gregarious, and happy tone
      const responseMessage = analysis;

      // Store the response to filter out avatar transcriptions later
      lastAvatarResponseRef.current = responseMessage.substring(0, 100); // Store first 100 chars for comparison

      // Send the response to the avatar - use repeat() to speak directly without AI processing
      if (mode === "FULL") {
        console.log("Sending response to avatar using repeat()");
        // Use repeat() to make avatar speak the analysis directly without AI processing
        await repeat(responseMessage);
      }
      
      // Reset the last processed question after a delay to allow the same question to be asked again later
      processingTimeoutRef.current = setTimeout(() => {
        lastProcessedQuestionRef.current = "";
      }, 5000);
    } catch (error) {
      console.error("Error processing camera question:", error);
      // Send a friendly error message - use repeat() to speak directly
      if (mode === "FULL") {
        await repeat("Oops! I had a little trouble analyzing what I'm seeing right now. Could you try asking again?");
      }
      // Reset after error
      processingTimeoutRef.current = setTimeout(() => {
        lastProcessedQuestionRef.current = "";
      }, 2000);
    } finally {
      setIsProcessingCameraQuestion(false);
      setIsAnalyzingImage(false);
    }
  }, [isCameraActive, isProcessingCameraQuestion, mode, captureCameraFrame, cameraAvailable, fallbackImage, sessionRef, repeat]);

  // Debug button handler
  const handleDebugAnalysis = useCallback(async () => {
    console.log("Debug button clicked", {
      isDebugProcessing: isDebugProcessingRef.current,
      isProcessingCameraQuestion,
      isCameraActive,
      hasFallbackImage: !!fallbackImage,
      cameraAvailable
    });

    // Prevent multiple simultaneous calls
    if (isDebugProcessingRef.current || isProcessingCameraQuestion) {
      console.log("Debug analysis already in progress, skipping...");
      return;
    }

    if (!isCameraActive) {
      console.error("Camera is not active, cannot analyze");
      return;
    }

    isDebugProcessingRef.current = true;
    const defaultQuestion = "What can you see in this image? Please describe everything you see with enthusiasm and humor!";
    
    console.log("Starting debug analysis with question:", defaultQuestion);
    
    try {
      await processCameraQuestion(defaultQuestion, true);
      console.log("Debug analysis completed successfully");
    } catch (error) {
      console.error("Error in debug analysis:", error);
    } finally {
      // Reset after processing completes
      setTimeout(() => {
        isDebugProcessingRef.current = false;
        console.log("Debug processing ref reset");
      }, 500);
    }
  }, [processCameraQuestion, isProcessingCameraQuestion, isCameraActive, fallbackImage, cameraAvailable]);

  // Listen to user transcriptions and handle all questions when camera is active
  useEffect(() => {
    if (!sessionRef.current) {
      return;
    }

    const handleUserTranscription = async (event: { text: string }) => {
      const userText = event.text.trim();
      console.log("User transcription received:", userText);
      
      // Skip if this transcription matches our recent avatar response (avatar's speech being transcribed)
      // This prevents infinite loops where avatar's response triggers another analysis
      if (lastAvatarResponseRef.current && userText.length > 30) {
        const responseStart = lastAvatarResponseRef.current.toLowerCase().trim();
        const transcriptionStart = userText.substring(0, Math.min(150, userText.length)).toLowerCase().trim();
        
        // Check if transcription matches our response (avatar speaking our response)
        // Compare first 50-100 characters for similarity
        const responsePrefix = responseStart.substring(0, 80);
        const transcriptionPrefix = transcriptionStart.substring(0, 80);
        
        // If they're very similar (80% match), it's likely the avatar's response
        if (responsePrefix.length > 30 && transcriptionPrefix.length > 30) {
          let matchCount = 0;
          const minLength = Math.min(responsePrefix.length, transcriptionPrefix.length);
          for (let i = 0; i < minLength; i++) {
            if (responsePrefix[i] === transcriptionPrefix[i]) {
              matchCount++;
            }
          }
          const similarity = matchCount / minLength;
          
          if (similarity > 0.7) {
            console.log("Skipping transcription - appears to be avatar's response being transcribed", {
              similarity,
              responsePrefix: responsePrefix.substring(0, 50),
              transcriptionPrefix: transcriptionPrefix.substring(0, 50)
            });
            return;
          }
        }
      }
      
      // Also skip if transcription is very long (likely avatar response, not user question)
      // User questions are typically shorter, avatar responses are longer
      if (userText.length > 200) {
        console.log("Skipping transcription - too long, likely avatar response");
        return;
      }
      
      // Process the question using the reusable function
      await processCameraQuestion(userText, false);
    };

    console.log("Setting up USER_TRANSCRIPTION listener, camera active:", isCameraActive);
    sessionRef.current.on(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      if (sessionRef.current) {
        console.log("Cleaning up USER_TRANSCRIPTION listener");
        // Use removeListener if off is not available
        if (typeof (sessionRef.current as any).off === 'function') {
          (sessionRef.current as any).off(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
        } else if (typeof (sessionRef.current as any).removeListener === 'function') {
          (sessionRef.current as any).removeListener(AgentEventsEnum.USER_TRANSCRIPTION, handleUserTranscription);
        }
      }
    };
  }, [sessionRef, isCameraActive, processCameraQuestion]);

  // Automatically analyze and speak when camera mode is activated
  useEffect(() => {
    if (!isCameraActive) {
      // Reset the flag when camera is deactivated
      hasAutoAnalyzedRef.current = false;
      return;
    }

    // Skip if we've already auto-analyzed for this activation
    if (hasAutoAnalyzedRef.current) {
      return;
    }

    // Wait a bit for camera stream or fallback image to be ready
    const timeoutId = setTimeout(async () => {
      // Check if we have either a camera stream or fallback image
      const hasImage = fallbackImage !== null;
      const hasCameraStream = cameraStream !== null && cameraPreviewRef.current;
      
      if (!hasImage && !hasCameraStream) {
        console.log("Waiting for camera or fallback image to be ready...");
        return;
      }

      // If camera stream, wait a bit more for video to be ready
      if (hasCameraStream && cameraPreviewRef.current) {
        const video = cameraPreviewRef.current;
        if (video.readyState < 2 || video.videoWidth === 0) {
          // Wait for video to be ready
          const checkVideoReady = () => {
            if (!isCameraActive || hasAutoAnalyzedRef.current) {
              return; // Camera was turned off or already analyzed
            }
            if (video.readyState >= 2 && video.videoWidth > 0) {
              console.log("Camera video is ready, triggering auto-analysis");
              hasAutoAnalyzedRef.current = true;
              // Use empty string for general analysis (no specific question)
              processCameraQuestion("", true);
            } else {
              setTimeout(checkVideoReady, 200);
            }
          };
          checkVideoReady();
          return;
        }
      }

      // Trigger automatic analysis without a question (just describe what it sees)
      console.log("Camera mode activated, triggering automatic analysis");
      hasAutoAnalyzedRef.current = true;
      // Use empty string to trigger general analysis without a specific question
      processCameraQuestion("", true);
    }, 500); // Wait 500ms for setup

    return () => {
      clearTimeout(timeoutId);
    };
  }, [isCameraActive, cameraStream, fallbackImage, processCameraQuestion]);

  // Function to load fallback image from public folder
  const loadFallbackImage = useCallback(async (): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          reject(new Error('Failed to get canvas context'));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], '2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg', { type: 'image/jpeg' });
            resolve(file);
          } else {
            reject(new Error('Failed to convert canvas to blob'));
          }
        }, 'image/jpeg', 0.95);
      };
      
      img.onerror = () => {
        reject(new Error('Failed to load fallback image from public folder'));
      };
      
      // Load image from public folder
      img.src = '/2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg';
    });
  }, []);

  // Check camera availability on mount and set default broken glass image
  useEffect(() => {
    const checkCameraAvailability = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoInput = devices.some(device => device.kind === 'videoinput');
        setCameraAvailable(hasVideoInput);
        
        // If no camera available, load and set default fallback image
        if (!hasVideoInput) {
          try {
            const fallbackImageFile = await loadFallbackImage();
            setFallbackImage(fallbackImageFile);
            const previewUrl = URL.createObjectURL(fallbackImageFile);
            setFallbackImagePreview(previewUrl);
          } catch (error) {
            console.error("Error loading fallback image:", error);
          }
        }
      } catch (error) {
        console.error("Error checking camera availability:", error);
        setCameraAvailable(false);
        // Still try to load fallback image
        try {
          const fallbackImageFile = await loadFallbackImage();
          setFallbackImage(fallbackImageFile);
          const previewUrl = URL.createObjectURL(fallbackImageFile);
          setFallbackImagePreview(previewUrl);
        } catch (err) {
          console.error("Error loading fallback image:", err);
        }
      }
    };
    checkCameraAvailability();
  }, [loadFallbackImage]);


  
  const handleCameraClick = async () => {
    if (isCameraActive) {
      // Stop camera if already active
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
      }
      setIsCameraActive(false);
      setFallbackImage(null);
      setFallbackImagePreview(null);
      
      // CRITICAL: Don't pause or mute the video element
      // Audio should continue playing
      return;
    }

    // If camera is not available, show fallback mode with default image
    if (cameraAvailable === false) {
      setIsCameraActive(true);
      // If fallback image is not already set, load it
      if (!fallbackImage) {
        loadFallbackImage().then((file) => {
          setFallbackImage(file);
          const previewUrl = URL.createObjectURL(file);
          setFallbackImagePreview(previewUrl);
        }).catch((error) => {
          console.error("Error loading fallback image:", error);
        });
      }
      return;
    }

    try {
      // First try to get rear camera (environment)
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
        setCameraAvailable(true);
      } catch (error) {
        // If rear camera fails, try front camera (user)
        console.log("Rear camera not available, trying front camera");
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
          });
          setCameraAvailable(true);
        } catch (error2) {
          // No camera available, use fallback mode with default image
          console.log("No camera available, using fallback mode");
          setCameraAvailable(false);
          setIsCameraActive(true);
          // If fallback image is not already set, load it
          if (!fallbackImage) {
            loadFallbackImage().then((file) => {
              setFallbackImage(file);
              const previewUrl = URL.createObjectURL(file);
              setFallbackImagePreview(previewUrl);
            }).catch((error) => {
              console.error("Error loading fallback image:", error);
            });
          }
          return;
        }
      }

      if (stream) {
        setCameraStream(stream);
        setIsCameraActive(true);
      }
    } catch (error) {
      console.error("Error accessing camera:", error);
      // Use fallback mode instead of showing error
      setCameraAvailable(false);
      setIsCameraActive(true);
      fallbackImageInputRef.current?.click();
    }
  };


  const handleFallbackImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith("image/")) {
        alert("Please upload an image file");
        if (fallbackImageInputRef.current) {
          fallbackImageInputRef.current.value = "";
        }
        return;
      }
      // Clean up previous preview URL if it exists
      if (fallbackImagePreview) {
        URL.revokeObjectURL(fallbackImagePreview);
      }
      setFallbackImage(file);
      // Create preview URL
      const previewUrl = URL.createObjectURL(file);
      setFallbackImagePreview(previewUrl);
    }
    // Reset input
    if (fallbackImageInputRef.current) {
      fallbackImageInputRef.current.value = "";
    }
  };

  const handleFileUploadClick = (value: string) => {
    setUploadType(value);
    fileInputRef.current?.setAttribute('accept', `${value}/*`);
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
    // Clean up preview URL if it's not the default fallback image
    if (fallbackImagePreview && fallbackImage && fallbackImage.name !== '2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg') {
      URL.revokeObjectURL(fallbackImagePreview);
    }
    setFallbackImage(null);
    setFallbackImagePreview(null);
    // Reset processing state when camera is closed
    setIsProcessingCameraQuestion(false);
    setIsAnalyzingImage(false);
    lastProcessedQuestionRef.current = "";
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  };

  // Cleanup object URLs on unmount
  useEffect(() => {
    return () => {
      if (fallbackImagePreview) {
        URL.revokeObjectURL(fallbackImagePreview);
      }
    };
  }, [fallbackImagePreview]);

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
        {/* {isAnalyzingImage && (
          <div className="mt-4 bg-blue-500 text-white px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">🔄 Analyzing image...</p>
          </div>
        )}
        {imageAnalysis && !isAnalyzingImage && (
          <div className="mt-4 bg-green-500 text-white px-4 py-2 rounded-md max-w-2xl text-center">
            <p className="font-semibold">✅ Image analyzed successfully</p>
          </div>
        )} */}
      </div>

      {/* Full screen video */}
      <div className={`relative w-full flex-1 flex items-center justify-center ${isCameraActive ? 'pt-24' : ''}`}>
        {/* Avatar video - full screen when camera inactive, small overlay in left corner when camera active */}
        <video
          ref={videoRef}
          autoPlay  // Native autoplay
          playsInline
          preload="auto"
          muted={false}
          className={`${
            isCameraActive 
              ? 'absolute top-24 left-4 w-24 h-44 object-contain z-20 rounded-lg border-2 border-white shadow-2xl' 
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
              accept={`${uploadType}/*`}
              className="hidden"
              onChange={handleFileChange}
            />
          </>
        )}

        {/* Camera Preview - full screen under header when active */}
        {isCameraActive && (
          <div className="absolute inset-0 pt-24 flex items-center justify-center z-10">
            {cameraAvailable === false && fallbackImagePreview ? (
              // Fallback image preview (default image from public folder)
              <div className="relative w-full h-full max-w-4xl max-h-[calc(100vh-8rem)] flex flex-col">
                <img
                  src={fallbackImagePreview}
                  alt="Fallback"
                  className="w-full h-full object-contain rounded-lg"
                />
                {/* <button
                  onClick={() => fallbackImageInputRef.current?.click()}
                  className="absolute top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-md z-40 hover:bg-blue-700 text-sm"
                >
                  Change Image
                </button> */}
                <input
                  ref={fallbackImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFallbackImageChange}
                />
              </div>
            ) : cameraAvailable === false && !fallbackImagePreview ? (
              // Loading fallback image
              <div className="flex flex-col items-center justify-center w-full h-full max-w-4xl max-h-[calc(100vh-8rem)] bg-gray-900 rounded-lg p-8">
                <div className="text-center text-white">
                  <p className="text-lg">Loading...</p>
                </div>
              </div>
            ) : fallbackImagePreview ? (
              // User uploaded image preview
              <div className="relative w-full h-full max-w-4xl max-h-[calc(100vh-8rem)] flex flex-col">
                <img
                  src={fallbackImagePreview}
                  alt="Uploaded preview"
                  className="w-full h-full object-contain rounded-lg"
                />
                <button
                  onClick={() => fallbackImageInputRef.current?.click()}
                  className="absolute top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded-md z-40 hover:bg-blue-700 text-sm"
                >
                  Change Image
                </button>
                <input
                  ref={fallbackImageInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFallbackImageChange}
                />
              </div>
            ) : (
              // Camera video preview
              <video
                ref={cameraPreviewRef}
                autoPlay
                playsInline
                className="max-h-[calc(100vh-6rem)] w-full object-contain"
              />
            )}
          </div>
        )}
      </div>

      {/* Fixed buttons at bottom - positioned relative to viewport */}
      {mode === "FULL" && (
        <>
          {/* <button
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
          </button> */}

          {/* Debug button - only visible in camera mode */}
          {/* {isCameraActive && (
            <button
              className="fixed bottom-20 left-1/2 bg-purple-600 text-white px-6 py-3 rounded-md z-20 transform -translate-x-1/2 flex items-center justify-center gap-2 hover:bg-purple-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                console.log("Debug button onClick triggered", {
                  isProcessingCameraQuestion,
                  isAnalyzingImage,
                  isDebugProcessing: isDebugProcessingRef.current,
                  isCameraActive,
                  hasFallbackImage: !!fallbackImage
                });
                // Always call the handler - it will check internally if it should proceed
                handleDebugAnalysis().catch((error) => {
                  console.error("Error in handleDebugAnalysis:", error);
                });
              }}
              disabled={isProcessingCameraQuestion || isAnalyzingImage || isDebugProcessingRef.current}
            >
              {isAnalyzingImage || isDebugProcessingRef.current ? (
                <>🔄 Analyzing...</>
              ) : (
                <>🔍 Debug: Analyze Image</>
              )}
            </button>
          )} */}

          {/* ss added */}
          <div className="fixed bottom-[4rem] left-1/2 -translate-x-1/2 bg-[#00000057] w-[95%] max-w-7xl text-white rounded-lg shadow-lg p-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <button className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-sm font-medium text-custom-green whitespace-nowrap">
                <Radio className="mr-2 w-4 h-4" /> Go Live
              </button>
              <button className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-sm font-medium text-custom-green whitespace-nowrap" onClick={handleCameraClick}>
                <Camera className="mr-2 w-4 h-4" /> Camera
              </button>
              <button className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-sm font-medium text-custom-green whitespace-nowrap" onClick={() => {handleFileUploadClick('image')}}>
                <ImageIcon className="mr-2 w-4 h-4" /> Gallery
              </button>
              <button className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-sm font-medium text-custom-green whitespace-nowrap" onClick={() => {handleFileUploadClick('video')}}>
                <Video className="mr-2 w-4 h-4" />Video
              </button>
            </div>
          </div>
        </>
      )}
      
      {/* <button
        className="fixed bottom-4 w-[11rem] ml-[7rem] bg-white text-black px-4 py-2 rounded-md z-20"
        onClick={() => stopSession()}
      >
        Stop
      </button> */}

      <button
        className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[11rem] sm:w-[15rem] md:w-[18rem] lg:w-[22rem] max-w-[22rem] bg-white text-black px-4 py-2 rounded-md z-20"
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

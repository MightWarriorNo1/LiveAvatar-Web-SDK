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
  onExit?: (completeExit?: boolean) => void;
}> = ({ mode, onSessionStopped, onExit }) => {
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
  const [videoAnalysis, setVideoAnalysis] = useState<string | null>(null);
  const [isAnalyzingImage, setIsAnalyzingImage] = useState(false);
  const [isAnalyzingVideo, setIsAnalyzingVideo] = useState(false);
  const [isProcessingCameraQuestion, setIsProcessingCameraQuestion] =
    useState(false);
  const [showVisionLoading, setShowVisionLoading] = useState(false);
  const [cameraAvailable, setCameraAvailable] = useState<boolean | null>(null);
  const [fallbackImage, setFallbackImage] = useState<File | null>(null);
  const [fallbackImagePreview, setFallbackImagePreview] = useState<
    string | null
  >(null);
  const lastProcessedQuestionRef = useRef<string>("");
  const processingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const fallbackImageInputRef = useRef<HTMLInputElement>(null);
  const isDebugProcessingRef = useRef<boolean>(false);
  const lastAvatarResponseRef = useRef<string>("");
  const hasAutoAnalyzedRef = useRef<boolean>(false);

  const [uploadType, setUploadType] = useState<string>("image");
  const isAttachedRef = useRef<boolean>(false);
  const greetingTriggeredRef = useRef<boolean>(false);
  const audioUnlockedRef = useRef<boolean>(false);
  const initialGreetingInterceptedRef = useRef<boolean>(false);
  const wasMutedBeforeRecordingRef = useRef<boolean>(false);
  const sessionStartTimeRef = useRef<number | null>(null);
  const sessionDurationTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [isAppFullyLoaded, setIsAppFullyLoaded] = useState(false);
  const MAX_SESSION_DURATION_MINUTES = parseInt(
    process.env.NEXT_PUBLIC_MAX_SESSION_DURATION_MINUTES || "10",
    10,
  ); // 10 minutes = 20 credits per session

  // Vision mode state: 'streaming' for Go Live, 'snapshot' for Camera button, null for inactive
  const [visionMode, setVisionMode] = useState<"streaming" | "snapshot" | null>(
    null,
  );

  // Video recording state
  const [isVideoActive, setIsVideoActive] = useState(false);
  const [videoStream, setVideoStream] = useState<MediaStream | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideoBlob, setRecordedVideoBlob] = useState<Blob | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const videoPreviewRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      onSessionStopped();
      // Reset greeting trigger when session disconnects
      greetingTriggeredRef.current = false;
      initialGreetingInterceptedRef.current = false; // Reset greeting interception
      setIsAppFullyLoaded(false); // Reset app loaded state
      // Clear session duration tracking
      sessionStartTimeRef.current = null;
      if (sessionDurationTimeoutRef.current) {
        clearTimeout(sessionDurationTimeoutRef.current);
        sessionDurationTimeoutRef.current = null;
      }
    } else if (sessionState === SessionState.CONNECTED) {
      // Track session start time and set up duration enforcement
      if (!sessionStartTimeRef.current) {
        sessionStartTimeRef.current = Date.now();
        
        // Get max duration from session or use default
        const maxDurationSeconds = sessionRef.current?.maxSessionDuration 
          ? sessionRef.current.maxSessionDuration 
          : MAX_SESSION_DURATION_MINUTES * 60;
        
        // Set timeout to stop session when duration limit is reached
        sessionDurationTimeoutRef.current = setTimeout(() => {
          if (sessionRef.current && sessionState === SessionState.CONNECTED) {
            console.log("Session duration limit reached, stopping session");
            stopSession().catch((error) => {
              console.error("Error stopping session after duration limit:", error);
            });
          }
        }, maxDurationSeconds * 1000);
      }
    }
  }, [sessionState, onSessionStopped, stopSession, sessionRef, MAX_SESSION_DURATION_MINUTES]);

  // Function to reset to home screen (close camera, clear uploads, but keep session)
  const resetToHomeScreen = useCallback(() => {
    // Close camera if active
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setIsCameraActive(false);
    setVisionMode(null);

    // Close video recording if active
    if (videoStream) {
      videoStream.getTracks().forEach((track) => track.stop());
      setVideoStream(null);
    }
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
    setIsVideoActive(false);
    setRecordedVideoBlob(null);
    recordedChunksRef.current = [];

    // Clean up preview URL if it's not the default fallback image
    if (
      fallbackImagePreview &&
      fallbackImage &&
      fallbackImage.name !== "2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg"
    ) {
      URL.revokeObjectURL(fallbackImagePreview);
    }
    setFallbackImage(null);
    setFallbackImagePreview(null);

    // Clear analysis states (but keep videoAnalysis so avatar can still reference it)
    setImageAnalysis(null);
    setIsAnalyzingImage(false);
    setIsAnalyzingVideo(false);
    setIsProcessingCameraQuestion(false);
    // Note: videoAnalysis is NOT cleared so avatar can still reference uploaded videos

    // Reset processing refs
    lastProcessedQuestionRef.current = "";
    hasAutoAnalyzedRef.current = false;
    if (processingTimeoutRef.current) {
      clearTimeout(processingTimeoutRef.current);
      processingTimeoutRef.current = null;
    }
  }, [
    cameraStream,
    fallbackImage,
    fallbackImagePreview,
    videoStream,
    isRecording,
  ]);

  // Check if we're on the home screen (no camera, no video, no uploads)
  const isOnHomeScreen = useCallback(() => {
    return (
      !isCameraActive &&
      !isVideoActive &&
      !imageAnalysis &&
      !isAnalyzingImage &&
      !isAnalyzingVideo
    );
  }, [
    isCameraActive,
    isVideoActive,
    imageAnalysis,
    isAnalyzingImage,
    isAnalyzingVideo,
  ]);

  // Wrapper for stopSession - ends session on home screen, resets to home screen otherwise
  const handleStopSession = useCallback(() => {
    if (isOnHomeScreen()) {
      // On home screen: completely exit the app (don't show Session Ended page)
      greetingTriggeredRef.current = false; // Reset greeting trigger
      stopSession();
      // Call onExit callback with completeExit=true to completely exit app
      if (onExit) {
        onExit(true);
      }
    } else {
      // Not on home screen: reset to home screen (keep session)
      resetToHomeScreen();
    }
  }, [isOnHomeScreen, resetToHomeScreen, stopSession, onExit]);

  // Function to unlock audio on Android (requires user interaction)
  const unlockAudio = useCallback(async () => {
    if (audioUnlockedRef.current || !videoRef.current) {
      return;
    }

    const video = videoRef.current;
    try {
      // For Android: explicitly play the video to unlock audio on mobile browsers
      // Set volume to max and unmute
      video.volume = 1.0;
      video.muted = false;
      
      // Try to play the video
      await video.play();

      // Ensure audio tracks are enabled
      if (video.srcObject && video.srcObject instanceof MediaStream) {
        video.srcObject.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      }

      audioUnlockedRef.current = true;
      console.log("Audio unlocked successfully for Android/mobile");
      
      // Force a second attempt after a short delay for stubborn Android devices
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.volume = 1.0;
          videoRef.current.muted = false;
          videoRef.current.play().catch(() => {
            // Ignore errors on second attempt
          });
        }
      }, 100);
    } catch (error) {
      console.warn("Failed to unlock audio:", error);
      // Audio might still be blocked, but we'll try again on next interaction
    }
  }, []);

  useEffect(() => {
    // console.log("isStreamReady: ", isStreamReady);
    // console.log("videoRef.current: ", videoRef.current);
    if (isStreamReady && videoRef.current) {
      // Ensure video is muted initially to prevent mouth movement during loading
      const video = videoRef.current;
      video.muted = true;
      video.volume = 0;
      
      attachElement(videoRef.current);
      
      // DO NOT unmute automatically - wait for explicit user interaction
      // This prevents mouth movement during loading
      // Unmute only after user explicitly unlocks audio
      
      // Try to unlock audio if already unlocked (for cases where stream becomes ready after user interaction)
      if (audioUnlockedRef.current) {
        unlockAudio();
      }
      // console.log("attached element");
    }
  }, [attachElement, isStreamReady, unlockAudio]);

  // Ensure video has volume and is not muted whenever video element is available
  // Only unmute after user interaction (audio unlock) - CRITICAL to prevent mouth movement during loading
  useEffect(() => {
    if (videoRef.current && isStreamReady && audioUnlockedRef.current) {
      const video = videoRef.current;
      video.volume = 1.0;
      video.muted = false;
      // Also ensure audio tracks are enabled if available
      if (video.srcObject && video.srcObject instanceof MediaStream) {
        video.srcObject.getAudioTracks().forEach((track) => {
          track.enabled = true;
        });
      }
    } else if (videoRef.current && isStreamReady && !audioUnlockedRef.current) {
      // Ensure video stays muted if audio is not unlocked yet
      const video = videoRef.current;
      video.muted = true;
      video.volume = 0;
    }
  }, [isStreamReady, audioUnlockedRef]);

  // Auto-unlock audio on mount for Android (try immediately, then on user interaction)
  useEffect(() => {
    // Try to unlock audio immediately on mount (for Android)
    if (isStreamReady && videoRef.current) {
      // Small delay to ensure video element is ready
      setTimeout(() => {
        unlockAudio().catch(() => {
          // If auto-unlock fails, wait for user interaction
        });
      }, 500);
    }
  }, [isStreamReady, unlockAudio]);

  // Add user interaction listeners to unlock audio on first interaction
  // Critical for Android devices to enable audio playback
  useEffect(() => {
    if (audioUnlockedRef.current) {
      return;
    }

    const handleUserInteraction = async () => {
      await unlockAudio();
      // Remove listeners after first successful unlock
      if (audioUnlockedRef.current) {
        document.removeEventListener("click", handleUserInteraction);
        document.removeEventListener("touchstart", handleUserInteraction);
        document.removeEventListener("touchend", handleUserInteraction);
        document.removeEventListener("pointerdown", handleUserInteraction);
      }
    };

    // Listen for various user interaction events - especially important for Android
    document.addEventListener("click", handleUserInteraction, {
      passive: true,
    });
    document.addEventListener("touchstart", handleUserInteraction, {
      passive: true,
    });
    document.addEventListener("touchend", handleUserInteraction, {
      passive: true,
    });
    // Add pointer events for better Android support
    document.addEventListener("pointerdown", handleUserInteraction, {
      passive: true,
    });

    return () => {
      document.removeEventListener("click", handleUserInteraction);
      document.removeEventListener("touchstart", handleUserInteraction);
      document.removeEventListener("touchend", handleUserInteraction);
      document.removeEventListener("pointerdown", handleUserInteraction);
    };
  }, [unlockAudio]);

  // Trigger greeting after app is fully loaded
  useEffect(() => {
    if (isAppFullyLoaded && !greetingTriggeredRef.current && sessionRef.current && mode === "FULL") {
      greetingTriggeredRef.current = true;
      // Wait a moment for everything to settle, then trigger intro
      const timeoutId = setTimeout(async () => {
        if (sessionRef.current) {
          // Send the intro greeting
          await repeat("Hi, I'm 6, your AI buddy. How can I help you today?");
        }
      }, 1000);
      return () => clearTimeout(timeoutId);
    }
  }, [isAppFullyLoaded, sessionRef, mode, repeat]);

  // Function to load fallback image from public folder
  const loadFallbackImage = useCallback(async (): Promise<File> => {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";

      img.onload = () => {
        const canvas = document.createElement("canvas");
        canvas.width = img.width;
        canvas.height = img.height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Failed to get canvas context"));
          return;
        }
        ctx.drawImage(img, 0, 0);
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const file = new File(
                [blob],
                "2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg",
                { type: "image/jpeg" },
              );
              resolve(file);
            } else {
              reject(new Error("Failed to convert canvas to blob"));
            }
          },
          "image/jpeg",
          0.95,
        );
      };

      img.onerror = () => {
        reject(new Error("Failed to load fallback image from public folder"));
      };

      // Load image from public folder
      img.src = "/2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg";
    });
  }, []);

  // Handle Go Live button - enable real-time streaming vision mode (verbal questions)
  const handleGoLive = useCallback(async () => {
    // If already in streaming vision mode, return
    if (visionMode === "streaming") {
      return;
    }

    // Activate streaming Vision mode
    setVisionMode("streaming");

    // If camera is not available, show fallback mode with default image
    if (cameraAvailable === false) {
      setIsCameraActive(true);
      // If fallback image is not already set, load it
      if (!fallbackImage) {
        loadFallbackImage()
          .then((file) => {
            setFallbackImage(file);
            const previewUrl = URL.createObjectURL(file);
            setFallbackImagePreview(previewUrl);
          })
          .catch((error) => {
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
            loadFallbackImage()
              .then((file) => {
                setFallbackImage(file);
                const previewUrl = URL.createObjectURL(file);
                setFallbackImagePreview(previewUrl);
              })
              .catch((error) => {
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
      if (!fallbackImage) {
        loadFallbackImage()
          .then((file) => {
            setFallbackImage(file);
            const previewUrl = URL.createObjectURL(file);
            setFallbackImagePreview(previewUrl);
          })
          .catch((error) => {
            console.error("Error loading fallback image:", error);
          });
      }
    }
  }, [
    triggerGreetingIfNeeded,
    visionMode,
    cameraAvailable,
    fallbackImage,
    loadFallbackImage,
  ]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  // Track when app is fully loaded (session connected AND stream ready)
  useEffect(() => {
    if (sessionState === SessionState.CONNECTED && isStreamReady) {
      // Small delay to ensure everything is ready
      const timeoutId = setTimeout(() => {
        setIsAppFullyLoaded(true);
      }, 500);
      return () => clearTimeout(timeoutId);
    } else {
      setIsAppFullyLoaded(false);
    }
  }, [sessionState, isStreamReady]);

  // Intercept and interrupt the initial greeting from the backend
  useEffect(() => {
    if (sessionState === SessionState.CONNECTED && sessionRef.current) {
      const handleAvatarSpeakStarted = () => {
        // Only intercept the first greeting (before app is fully loaded)
        if (!initialGreetingInterceptedRef.current && !isAppFullyLoaded) {
          initialGreetingInterceptedRef.current = true;
          // Immediately interrupt the greeting
          interrupt();
        }
      };

      sessionRef.current.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleAvatarSpeakStarted);

      return () => {
        if (sessionRef.current) {
          sessionRef.current.off(AgentEventsEnum.AVATAR_SPEAK_STARTED, handleAvatarSpeakStarted);
        }
      };
    }
  }, [sessionState, interrupt, sessionRef, isAppFullyLoaded]);

  // Cleanup camera stream on unmount
  useEffect(() => {
    return () => {
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
      }
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
      }
      // Cleanup timeout on unmount
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
    };
  }, [cameraStream, videoStream]);

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
          readyState: video.readyState,
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
        console.error(
          "Video has invalid dimensions:",
          video.videoWidth,
          video.videoHeight,
        );
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
        canvas.toBlob(
          (blob) => {
            if (blob) {
              const file = new File([blob], "camera-frame.jpg", {
                type: "image/jpeg",
              });
              console.log("Camera frame captured successfully:", {
                width: canvas.width,
                height: canvas.height,
                fileSize: file.size,
              });
              resolve(file);
            } else {
              console.error("Failed to convert canvas to blob");
              resolve(null);
            }
          },
          "image/jpeg",
          0.95,
        );
      });
    } catch (error) {
      console.error("Error capturing camera frame:", error);
      return null;
    }
  }, [isCameraActive, fallbackImage]);

  // Function to capture photo and analyze it (only for snapshot mode)
  const handleSnapPhoto = useCallback(async () => {
    if (!isCameraActive || visionMode !== "snapshot") {
      return;
    }

    try {
      setIsAnalyzingImage(true);
      // Show "Analyzing" immediately (not "Loading")
      setIsProcessingCameraQuestion(true);

      // Capture frame from camera or use fallback image
      const frameFile = await captureCameraFrame();

      if (!frameFile) {
        console.error("Failed to capture camera frame");
        setIsAnalyzingImage(false);
        return;
      }

      // Close camera preview and return to full avatar display
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
      }
      setIsCameraActive(false);
      setVisionMode(null);

      // Clean up preview URL if it's not the default fallback image
      if (
        fallbackImagePreview &&
        fallbackImage &&
        fallbackImage.name !== "2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg"
      ) {
        URL.revokeObjectURL(fallbackImagePreview);
      }
      setFallbackImage(null);
      setFallbackImagePreview(null);

      // Analyze the photo
      const formData = new FormData();
      formData.append("image", frameFile);
        formData.append(
          "question",
          "Describe what you see briefly",
        );

      const response = await fetch("/api/analyze-image", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || "Failed to analyze photo");
      }

      const data = await response.json();
      const analysis = data.analysis;
      setImageAnalysis(analysis);

        // Store analysis as context for future questions, but ask short question
        if (mode === "FULL" && sessionRef.current) {
          // Send analysis as context to AI so it knows what's in the image
          // But do this AFTER speaking the prompt to prevent monologuing
          const contextMessage = `You are directly viewing an image. Here's what you see: ${analysis}. When the user asks about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the image, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this image. When user asks about the image, respond briefly (1-2 sentences).`;
          
          // Ask ONLY the short question FIRST using repeat() - direct speech, no AI processing
          await repeat(
            "What problems can I help you solve that are in this picture?",
          );
          
          // Then send context in background (non-blocking) for future questions
          // Use setTimeout to ensure prompt is spoken first
          setTimeout(() => {
            if (sessionRef.current) {
              sessionRef.current.message(contextMessage);
            }
          }, 100);
        }

      setIsAnalyzingImage(false);
    } catch (error) {
      console.error("Error capturing and analyzing photo:", error);
      if (mode === "FULL") {
        await repeat(
          "Oops! I had a little trouble analyzing the photo. Could you try again?",
        );
      }
      setIsAnalyzingImage(false);
    }
  }, [
    isCameraActive,
    visionMode,
    captureCameraFrame,
    cameraStream,
    fallbackImage,
    fallbackImagePreview,
    mode,
    sessionRef,
    repeat,
  ]);

  // Function to process camera question (only for streaming mode - verbal questions)
  const processCameraQuestion = useCallback(
    async (question: string, skipDuplicateCheck: boolean = false) => {
      console.log("processCameraQuestion called", {
        question,
        skipDuplicateCheck,
        isCameraActive,
        visionMode,
        isProcessingCameraQuestion,
      });

      // Only process in streaming mode (Go Live)
      if (!isCameraActive || visionMode !== "streaming") {
        console.log("Not in streaming vision mode, returning early");
        return;
      }

      const userText = question.trim();

      // Allow empty question for general analysis (when camera mode is first activated)
      // Skip only if we're not doing a general analysis (skipDuplicateCheck is false and question is empty)
      if (userText.length === 0 && !skipDuplicateCheck) {
        console.log(
          "Question is empty and not a general analysis request, returning early",
        );
        return;
      }

      // Skip if already processing (use ref for immediate check to prevent race conditions)
      // Note: We allow processing if isDebugProcessingRef is set by the current call
      // The check is done in handleDebugAnalysis before calling this function
      // BUT: Allow processing if skipDuplicateCheck is true (for initial vision recognition)
      if (isProcessingCameraQuestion && !skipDuplicateCheck) {
        console.log("Already processing, skipping duplicate request");
        return;
      }

      // Skip duplicate check if explicitly skipped (for debug button)
      if (
        !skipDuplicateCheck &&
        lastProcessedQuestionRef.current === userText
      ) {
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
      // Don't show loading text - we'll only show "Analyzing" via isProcessingCameraQuestion
      // Removed setShowVisionLoading(true) to prevent flashing text
      lastProcessedQuestionRef.current = userText;

      try {
        // Capture frame from camera or use fallback image
        console.log("Capturing camera frame or using fallback image...");
        const frameFile = await captureCameraFrame();

        if (!frameFile) {
          console.error("Failed to capture camera frame or no fallback image");
          if (mode === "FULL") {
            if (cameraAvailable === false && !fallbackImage) {
              await repeat(
                "I don't have a camera or image to analyze right now. Please upload an image first by clicking the Camera button and selecting an image!",
              );
            } else {
              await repeat(
                "Hmm, I'm having trouble capturing what I'm seeing right now. Could you try asking again in a moment?",
              );
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

      // For initial recognition (empty question with skipDuplicateCheck), use ONLY the specific message
      let responseMessage: string;
      if (userText.length === 0 && skipDuplicateCheck) {
        // This is initial recognition when Go Live starts - use ONLY the specific question, no analysis
        responseMessage = "What problems can I help you solve that we're looking at right now?";
        
        // Send analysis as context to AI so it knows what's in the image for future questions
        if (mode === "FULL" && sessionRef.current) {
          const contextMessage = `You are directly viewing an image. Here's what you see: ${analysis}. When the user asks about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the image, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this image. When user asks about the image, respond briefly (1-2 sentences).`;
          // Send context in background (non-blocking) for future questions
          setTimeout(() => {
            if (sessionRef.current) {
              sessionRef.current.message(contextMessage);
            }
          }, 100);
        }
      } else {
        // For user questions, send the analysis as context along with the user's question
        // This ensures the AI has the context when responding
        if (mode === "FULL" && sessionRef.current) {
          // Combine context and question into a single message to avoid duplicate responses
          const combinedMessage = `You are directly viewing an image. Here's what you see: ${analysis}. When the user asks about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the image, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this image. Now the user asks: "${userText}". Please respond briefly (1-2 sentences).`;
          
          // Send the combined message so AI can respond with context
          sessionRef.current.message(combinedMessage);
          
          // Don't use repeat() here - let the AI respond naturally with context
          // The "Analyzing..." will hide when avatar starts speaking
          return; // Exit early - AI will respond via message()
        } else {
          // Fallback: use analysis as response message
          responseMessage = analysis;
        }
      }

        // Store the response to filter out avatar transcriptions later
        if (responseMessage) {
          lastAvatarResponseRef.current = responseMessage.substring(0, 100); // Store first 100 chars for comparison

          // Send the response to the avatar - use repeat() to speak directly without AI processing
          // IMPORTANT: Use repeat() which speaks directly without AI processing to prevent monologuing
          if (mode === "FULL") {
            console.log("Sending response to avatar using repeat() - direct speech only");
            // Use repeat() to make avatar speak ONLY this message, no AI processing = no monologue
            await repeat(responseMessage);
          }
        }

        // Reset the last processed question after a delay to allow the same question to be asked again later
        processingTimeoutRef.current = setTimeout(() => {
          lastProcessedQuestionRef.current = "";
        }, 5000);
      } catch (error) {
        console.error("Error processing camera question:", error);
        // Send a friendly error message - use repeat() to speak directly
        if (mode === "FULL") {
          await repeat(
            "Oops! I had a little trouble analyzing what I'm seeing right now. Could you try asking again?",
          );
        }
        // Reset after error
        processingTimeoutRef.current = setTimeout(() => {
          lastProcessedQuestionRef.current = "";
        }, 2000);
        // Hide analyzing state on error
        setIsProcessingCameraQuestion(false);
        setIsAnalyzingImage(false);
      } finally {
        // Don't hide "Analyzing..." here if successful - keep it visible until avatar starts speaking
        // It will be hidden when avatar starts talking (via useEffect below)
      }
    },
    [
      isCameraActive,
      isProcessingCameraQuestion,
      visionMode,
      mode,
      captureCameraFrame,
      cameraAvailable,
      fallbackImage,
      sessionRef,
      repeat,
    ],
  );

  // Debug button handler
  const handleDebugAnalysis = useCallback(async () => {
    console.log("Debug button clicked", {
      isDebugProcessing: isDebugProcessingRef.current,
      isProcessingCameraQuestion,
      isCameraActive,
      hasFallbackImage: !!fallbackImage,
      cameraAvailable,
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
    const defaultQuestion =
      "What can you see in this image? Please describe everything you see with enthusiasm and humor!";

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
  }, [
    processCameraQuestion,
    isProcessingCameraQuestion,
    isCameraActive,
    fallbackImage,
    cameraAvailable,
  ]);

  // Listen to user transcriptions and handle verbal questions in streaming mode (Go Live)
  useEffect(() => {
    if (!sessionRef.current) {
      return;
    }

    const handleUserTranscription = async (event: { text: string }) => {
      const userText = event.text.trim();
      console.log(
        "User transcription received:",
        userText,
        "Vision mode:",
        visionMode,
      );

      // Skip transcription when video is recording - avatar should be quiet during recording
      if (isVideoActive && isRecording) {
        console.log("Video is recording, skipping transcription - avatar should be quiet");
        return;
      }

      // Only process in streaming mode (Go Live)
      if (visionMode !== "streaming") {
        console.log("Not in streaming mode, skipping transcription processing");
        return;
      }

      // Skip if this transcription matches our recent avatar response (avatar's speech being transcribed)
      // This prevents infinite loops where avatar's response triggers another analysis
      if (lastAvatarResponseRef.current && userText.length > 30) {
        const responseStart = lastAvatarResponseRef.current
          .toLowerCase()
          .trim();
        const transcriptionStart = userText
          .substring(0, Math.min(150, userText.length))
          .toLowerCase()
          .trim();

        // Check if transcription matches our response (avatar speaking our response)
        // Compare first 50-100 characters for similarity
        const responsePrefix = responseStart.substring(0, 80);
        const transcriptionPrefix = transcriptionStart.substring(0, 80);

        // If they're very similar (80% match), it's likely the avatar's response
        if (responsePrefix.length > 30 && transcriptionPrefix.length > 30) {
          let matchCount = 0;
          const minLength = Math.min(
            responsePrefix.length,
            transcriptionPrefix.length,
          );
          for (let i = 0; i < minLength; i++) {
            if (responsePrefix[i] === transcriptionPrefix[i]) {
              matchCount++;
            }
          }
          const similarity = matchCount / minLength;

          if (similarity > 0.7) {
            console.log(
              "Skipping transcription - appears to be avatar's response being transcribed",
              {
                similarity,
                responsePrefix: responsePrefix.substring(0, 50),
                transcriptionPrefix: transcriptionPrefix.substring(0, 50),
              },
            );
            return;
          }
        }
      }

      // Also skip if transcription is very long (likely avatar response, not user question)
      // User questions are typically shorter, avatar responses are longer
      if (userText.length > 200) {
        console.log(
          "Skipping transcription - too long, likely avatar response",
        );
        return;
      }

      // Skip if transcription is too short (likely noise or partial speech)
      if (userText.length < 3) {
        console.log("Skipping transcription - too short, likely noise");
        return;
      }

      // Skip if already processing to prevent duplicate triggers
      if (isProcessingCameraQuestion) {
        console.log("Skipping transcription - already processing");
        return;
      }

      // If user asks about video and videoAnalysis exists, re-send video context
      const userTextLower = userText.toLowerCase();
      const videoKeywords = ["video", "recording", "clip", "footage", "film"];
      const mentionsVideo = videoKeywords.some(keyword => userTextLower.includes(keyword));
      
      if (mentionsVideo && videoAnalysis && sessionRef.current && mode === "FULL") {
        console.log("User asked about video, re-sending video context");
        const contextMessage = `You are directly viewing a video. Here's what you see: ${videoAnalysis}. When the user asks about the video, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the video, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this video. When user asks about the video, respond briefly (1-2 sentences).`;
        sessionRef.current.message(contextMessage);
      }

      // Process the question using the reusable function (only in streaming mode)
      await processCameraQuestion(userText, false);
    };

    console.log(
      "Setting up USER_TRANSCRIPTION listener, vision mode:",
      visionMode,
    );
    sessionRef.current.on(
      AgentEventsEnum.USER_TRANSCRIPTION,
      handleUserTranscription,
    );

    return () => {
      if (processingTimeoutRef.current) {
        clearTimeout(processingTimeoutRef.current);
      }
      if (sessionRef.current) {
        console.log("Cleaning up USER_TRANSCRIPTION listener");
        // Use removeListener if off is not available
        if (typeof (sessionRef.current as any).off === "function") {
          (sessionRef.current as any).off(
            AgentEventsEnum.USER_TRANSCRIPTION,
            handleUserTranscription,
          );
        } else if (
          typeof (sessionRef.current as any).removeListener === "function"
        ) {
          (sessionRef.current as any).removeListener(
            AgentEventsEnum.USER_TRANSCRIPTION,
            handleUserTranscription,
          );
        }
      }
    };
  }, [sessionRef, visionMode, processCameraQuestion, isVideoActive, isRecording]);

  // Track if initial analysis has been triggered to prevent repeated automatic analysis
  const hasInitialAnalysisRef = useRef<boolean>(false);

  // Automatically trigger vision recognition when Go Live streaming mode is activated
  // BUT only once - prevent repeated automatic analysis that causes excessive talking
  useEffect(() => {
    if (
      visionMode === "streaming" &&
      isCameraActive &&
      !isProcessingCameraQuestion &&
      !hasInitialAnalysisRef.current
    ) {
      // Wait a moment for camera to be ready, then analyze what's in view ONCE
      // The "Analyzing" text will show when processCameraQuestion sets isProcessingCameraQuestion to true
      const timeoutId = setTimeout(() => {
        // Double-check conditions before triggering
        if (
          visionMode === "streaming" &&
          isCameraActive &&
          !isProcessingCameraQuestion &&
          !hasInitialAnalysisRef.current
        ) {
          hasInitialAnalysisRef.current = true;
          processCameraQuestion("", true);
        }
      }, 1000);

      return () => {
        clearTimeout(timeoutId);
      };
    } else if (visionMode !== "streaming" && !isCameraActive) {
      // Reset processing state and initial analysis flag when vision mode is deactivated
      setIsProcessingCameraQuestion(false);
      hasInitialAnalysisRef.current = false;
    }
  }, [
    visionMode,
    isCameraActive,
    isProcessingCameraQuestion,
    processCameraQuestion,
  ]);

  // Hide "Analyzing..." text when avatar starts talking (for streaming vision mode)
  useEffect(() => {
    if (isAvatarTalking && isProcessingCameraQuestion && visionMode === "streaming") {
      setIsProcessingCameraQuestion(false);
      setIsAnalyzingImage(false);
    }
  }, [isAvatarTalking, isProcessingCameraQuestion, visionMode]);

  // Automatically analyze and speak when camera mode is activated
  // DISABLED: This was causing automatic snap when camera opens on mobile
  // Users should manually trigger analysis by asking questions via voice
  /*
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
  */

  // Check camera availability on mount and set default broken glass image
  useEffect(() => {
    const checkCameraAvailability = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoInput = devices.some(
          (device) => device.kind === "videoinput",
        );
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
    if (visionMode === "snapshot") {
      // Stop camera if already in snapshot mode
      if (cameraStream) {
        cameraStream.getTracks().forEach((track) => track.stop());
        setCameraStream(null);
      }
      setIsCameraActive(false);
      setVisionMode(null);
      setFallbackImage(null);
      setFallbackImagePreview(null);

      // CRITICAL: Don't pause or mute the video element
      // Audio should continue playing
      return;
    }

    // Set to snapshot mode (for taking a single photo)
    setVisionMode("snapshot");

    // If camera is not available, show fallback mode with default image
    if (cameraAvailable === false) {
      setIsCameraActive(true);
      // If fallback image is not already set, load it
      if (!fallbackImage) {
        loadFallbackImage()
          .then((file) => {
            setFallbackImage(file);
            const previewUrl = URL.createObjectURL(file);
            setFallbackImagePreview(previewUrl);
          })
          .catch((error) => {
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
            loadFallbackImage()
              .then((file) => {
                setFallbackImage(file);
                const previewUrl = URL.createObjectURL(file);
                setFallbackImagePreview(previewUrl);
              })
              .catch((error) => {
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

  const handleFallbackImageChange = (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
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
    // If video, handle video recording instead of file upload
    if (value === "video") {
      handleVideoClick();
      return;
    }

    setUploadType(value);
    fileInputRef.current?.setAttribute("accept", `${value}/*`);
    fileInputRef.current?.click();
  };

  // Handle video recording
  const handleVideoClick = async () => {
    if (isVideoActive) {
      // Stop video recording if already active
      if (videoStream) {
        videoStream.getTracks().forEach((track) => track.stop());
        setVideoStream(null);
      }
      if (mediaRecorderRef.current && isRecording) {
        mediaRecorderRef.current.stop();
        setIsRecording(false);
      }
      setIsVideoActive(false);
      setRecordedVideoBlob(null);
      recordedChunksRef.current = [];
      return;
    }

    try {
      // Get video stream
      let stream: MediaStream | null = null;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      } catch (error) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: "user" },
          });
        } catch (error2) {
          console.error("Error accessing camera for video:", error2);
          alert("Unable to access camera for video recording");
          return;
        }
      }

      if (stream) {
        setVideoStream(stream);
        setIsVideoActive(true);
      }
    } catch (error) {
      console.error("Error accessing camera for video:", error);
      alert("Unable to access camera for video recording");
    }
  };

  // Start video recording
  const handleStartRecording = useCallback(() => {
    if (!videoStream || !videoPreviewRef.current) {
      return;
    }

    recordedChunksRef.current = [];

    // Check for supported MIME types
    let mimeType = "video/webm;codecs=vp9,opus";
    if (!MediaRecorder.isTypeSupported(mimeType)) {
      mimeType = "video/webm;codecs=vp8,opus";
      if (!MediaRecorder.isTypeSupported(mimeType)) {
        mimeType = "video/webm";
        if (!MediaRecorder.isTypeSupported(mimeType)) {
          mimeType = "";
        }
      }
    }

    const options: MediaRecorderOptions = mimeType ? { mimeType } : {};
    const mediaRecorder = new MediaRecorder(videoStream, options);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data.size > 0) {
        recordedChunksRef.current.push(event.data);
      }
    };

    mediaRecorder.onstop = async () => {
      const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
      setRecordedVideoBlob(blob);

      // Analyze the video
      setIsAnalyzingVideo(true);
      try {
        const videoFile = new File([blob], "recorded-video.webm", {
          type: "video/webm",
        });
        const frames = await extractVideoFrames(videoFile, 5);

        const response = await fetch("/api/analyze-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ frames }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to analyze video");
        }

        const data = await response.json();
        console.log("Video analyzed successfully");
        
        // Store video analysis in state so it persists even after closing video button
        setVideoAnalysis(data.analysis);

        // For FULL mode, send the analysis as context to the AI
        if (mode === "FULL" && sessionRef.current) {
          // Ask ONLY the short question FIRST using repeat() - direct speech, no AI processing
          await repeat(
            "What problems can I help you solve that are in this video?",
          );
          
          // Then send context in background (non-blocking) for future questions
          // Use setTimeout to ensure prompt is spoken first
          const contextMessage = `You are directly viewing a video. Here's what you see: ${data.analysis}. When the user asks about the video, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the video, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this video. When user asks about the video, respond briefly (1-2 sentences).`;
          setTimeout(() => {
            if (sessionRef.current) {
              sessionRef.current.message(contextMessage);
            }
          }, 100);
        }

        // Keep video active for discussion - don't auto-return to home screen
        setIsAnalyzingVideo(false);
      } catch (error) {
        console.error("Error analyzing video:", error);
        alert("Failed to analyze video. Please try again.");
        setIsAnalyzingVideo(false);
      }
    };

    mediaRecorderRef.current = mediaRecorder;
    mediaRecorder.start();
    setIsRecording(true);
    
    // Stop listening and mute microphone during video recording to prevent AI from processing audio
    // The AI should only analyze the video after recording is complete
    if (mode === "FULL") {
      stopListening();
      // Mute microphone to prevent any audio from being sent to the backend during recording
      // Store the current mute state so we can restore it after recording
      wasMutedBeforeRecordingRef.current = isMuted;
      if (isActive && !isMuted) {
        mute();
      }
    }
  }, [videoStream, mode, sessionRef, repeat, resetToHomeScreen, stopListening, isActive, isMuted, mute]);

  // Stop video recording
  const handleStopRecording = useCallback(() => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      
      // Restart listening and restore microphone state after recording stops
      // The video will be analyzed after recording completes (in mediaRecorder.onstop)
      if (mode === "FULL") {
        // Small delay to ensure recording has fully stopped
        setTimeout(() => {
          startListening();
          // Restore microphone state: unmute only if it wasn't muted before recording
          if (isActive && isMuted && !wasMutedBeforeRecordingRef.current) {
            unmute();
          }
        }, 500);
      }
    }
  }, [isRecording, mode, startListening, isActive, isMuted, unmute]);

  // Set video stream to video element when both are available
  useEffect(() => {
    if (videoStream && videoPreviewRef.current) {
      const video = videoPreviewRef.current;
      video.srcObject = videoStream;

      video.play().catch((error) => {
        console.error("Error playing video stream:", error);
      });
    }
  }, [videoStream, isVideoActive]);

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
    setVisionMode(null);
    // Clean up preview URL if it's not the default fallback image
    if (
      fallbackImagePreview &&
      fallbackImage &&
      fallbackImage.name !== "2c44c052-e58a-4f6d-a6c8-dba901ff0e9e.jpg"
    ) {
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

  // Helper function to extract frames from video
  const extractVideoFrames = async (
    videoFile: File,
    numFrames: number = 5,
  ): Promise<string[]> => {
    return new Promise((resolve, reject) => {
      const video = document.createElement("video");
      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d");

      if (!ctx) {
        reject(new Error("Failed to get canvas context"));
        return;
      }

      video.preload = "metadata";
      video.onloadedmetadata = () => {
        video.currentTime = 0;
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
      };

      const frames: string[] = [];
      let frameCount = 0;

      video.onseeked = () => {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const frameData = canvas.toDataURL("image/jpeg", 0.8);
        // Extract base64 data (remove data:image/jpeg;base64, prefix)
        const base64Data = frameData.split(",")[1];
        frames.push(base64Data);
        frameCount++;

        if (frameCount < numFrames) {
          // Seek to next frame position
          const nextTime =
            (video.duration / (numFrames + 1)) * (frameCount + 1);
          video.currentTime = nextTime;
        } else {
          resolve(frames);
        }
      };

      video.onerror = () => {
        reject(new Error("Error loading video"));
      };

      video.src = URL.createObjectURL(videoFile);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) {
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    const isImage = file.type.startsWith("image/");
    const isVideo = file.type.startsWith("video/");

    if (!isImage && !isVideo) {
      alert("Please upload an image or video file");
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
      return;
    }

    if (isImage) {
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
          // Ask ONLY the short question FIRST using repeat() - direct speech, no AI processing = no monologue
          await repeat(
            "What problems can I help you solve that are in this picture?",
          );
          
          // Then send context in background (non-blocking) for future questions
          // Use setTimeout to ensure prompt is spoken first
          const contextMessage = `You are directly viewing an image. Here's what you see: ${data.analysis}. When the user asks about the image, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the image, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this image. When user asks about the image, respond briefly (1-2 sentences).`;
          setTimeout(() => {
            if (sessionRef.current) {
              sessionRef.current.message(contextMessage);
            }
          }, 100);
          // Do NOT send any additional messages - just the one line
        }
      } catch (error) {
        console.error("Error analyzing image:", error);
        alert("Failed to analyze image. Please try again.");
      } finally {
        setIsAnalyzingImage(false);
        setIsProcessingCameraQuestion(false);
      }
    } else if (isVideo) {
      setIsAnalyzingVideo(true);
      try {
        // Extract frames from video
        const frames = await extractVideoFrames(file, 5);

        const response = await fetch("/api/analyze-video", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ frames }),
        });

        if (!response.ok) {
          const error = await response.json();
          throw new Error(error.error || "Failed to analyze video");
        }

        const data = await response.json();
        console.log("Video analyzed successfully");
        
        // Store video analysis in state so it persists even after closing video button
        setVideoAnalysis(data.analysis);

        // For FULL mode, send the analysis as context to the AI
        if (mode === "FULL" && sessionRef.current) {
          // Ask ONLY the short question FIRST using repeat() - direct speech, no AI processing
          await repeat(
            "What problems can I help you solve that are in this video?",
          );
          
          // Then send context in background (non-blocking) for future questions
          // Use setTimeout to ensure prompt is spoken first
          const contextMessage = `You are directly viewing a video. Here's what you see: ${data.analysis}. When the user asks about the video, respond as if you're directly viewing it. Describe what you see naturally and confidently - you have full visibility. Never say you can't see the video, that you don't have eyes, or that you're relying on someone else's analysis. You are directly viewing this video. When user asks about the video, respond briefly (1-2 sentences).`;
          setTimeout(() => {
            if (sessionRef.current) {
              sessionRef.current.message(contextMessage);
            }
          }, 100);
        }
      } catch (error) {
        console.error("Error analyzing video:", error);
        alert("Failed to analyze video. Please try again.");
      } finally {
        setIsAnalyzingVideo(false);
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

  // Show loading screen until app is fully loaded
  if (!isAppFullyLoaded) {
    return (
      <div className="fixed inset-0 w-screen h-screen bg-black flex flex-col items-center justify-center">
        <div className="text-white text-xl font-aptos">Loading...</div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 w-screen h-screen bg-black flex flex-col">
      {/* Analyzing popup overlay - only show for snapshot mode, not streaming mode */}
      {(isAnalyzingImage || isAnalyzingVideo) && visionMode !== "streaming" && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70">
          <div className="bg-gray-800 text-white px-8 py-6 rounded-lg shadow-2xl">
            <p className="text-xl font-semibold text-center font-aptos">
              {isAnalyzingImage ? "Analyzing Photo...." : "Analyzing Video...."}
            </p>
          </div>
        </div>
      )}

      {/* Text overlays at the top */}
      <div className="absolute top-0 left-0 right-0 z-10 flex flex-col items-center pt-4 pb-2">
        <h1 className="text-custom-green text-2xl font-semibold font-aptos">
          iSolveUrProblems.ai - beta
        </h1>
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
      <div
        className={`relative w-full flex-1 flex items-center justify-center ${isCameraActive || isVideoActive ? "pt-24" : ""}`}
      >
        {/* Avatar video - full screen when camera/video inactive, small overlay in left corner when active */}
        <video
          ref={videoRef}
          autoPlay // Native autoplay
          playsInline
          preload="auto"
          muted={true} // Start muted to prevent mouth movement during loading
          className={`${
            isCameraActive || isVideoActive
              ? "absolute top-24 left-4 w-24 h-44 object-contain z-20 rounded-lg border-2 border-white shadow-2xl"
              : "h-full w-full object-contain"
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

        {/* Video Recording Preview - full screen under header when active */}
        {isVideoActive && (
          <div className="absolute inset-0 pt-24 flex items-center justify-center z-10">
            <video
              ref={videoPreviewRef}
              autoPlay
              playsInline
              className="max-h-[calc(100vh-6rem)] w-full object-contain"
            />
          </div>
        )}

        {/* Camera Preview - full screen under header when active */}
        {isCameraActive && !isVideoActive && (
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
                  <p className="text-lg font-aptos">Loading...</p>
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

        {/* Snap Photo Button - shown only in snapshot mode (Camera button) */}
        {isCameraActive && !isVideoActive && visionMode === "snapshot" && (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-30">
            <button
              onClick={handleSnapPhoto}
              disabled={isAnalyzingImage || isProcessingCameraQuestion}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white rounded-full w-20 h-20 flex items-center justify-center shadow-2xl border-4 border-white"
            >
              <Camera className="w-10 h-10" />
            </button>
          </div>
        )}

        {/* Video Recording Controls - shown when video is active */}
        {isVideoActive && (
          <div className="fixed bottom-32 left-1/2 transform -translate-x-1/2 z-30 flex gap-4">
            {!isRecording ? (
              <button
                onClick={handleStartRecording}
                className="bg-red-600 hover:bg-red-700 text-white rounded-full w-20 h-20 flex items-center justify-center shadow-2xl border-4 border-white"
              >
                <Video className="w-10 h-10" />
              </button>
            ) : (
              <button
                onClick={handleStopRecording}
                className="bg-red-600 hover:bg-red-700 text-white rounded-lg px-6 py-3 flex items-center justify-center shadow-2xl border-4 border-white"
              >
                Stop Recording
              </button>
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
                <span className="font-aptos">🔄 Analyzing...</span>
              ) : (
                <>🔍 Debug: Analyze Image</>
              )}
            </button>
          )} */}

          {/* Status text above buttons - positioned just above Stop button */}
          {/* Do NOT show "Talk to Interrupt" when camera is ready to take pic (snapshot mode) */}
          {sessionState !== SessionState.DISCONNECTED &&
            visionMode !== "streaming" &&
            !isCameraActive &&
            !isVideoActive && (
              <div className="fixed bottom-[14rem] left-1/2 -translate-x-1/2 z-30">
                <p
                  className={`text-custom-green text-2xl font-semibold text-center drop-shadow-lg ${
                    isStreamReady && !isAvatarTalking
                      ? "animate-fade-opacity"
                      : ""
                  }`}
                >
                  {isAvatarTalking ? (
                    "Talk to Interrupt"
                  ) : (
                    "Ask Anything"
                  )}
                </p>
              </div>
            )}

          {/* Analyzing text for vision recognition in streaming mode - ONLY show when actually processing */}
          {/* Positioned just above Stop button when four boxes are not visible */}
          {visionMode === "streaming" && isProcessingCameraQuestion && (
              <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-30">
                <p className="text-custom-green text-2xl font-semibold text-center drop-shadow-lg font-aptos">
                  <span className="inline-flex items-center">
                    Analyzing
                    <span className="inline-block animate-pulse">...</span>
                  </span>
                </p>
              </div>
            )}

          {/* ss added */}
          {/* Hide buttons when in Video mode or when in streaming vision mode (Go Live) */}
          {!isVideoActive && visionMode !== "streaming" && (
            <div className="fixed bottom-[4rem] left-1/2 -translate-x-1/2 w-[95%] max-w-7xl p-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <button
                  className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-lg font-medium text-custom-green whitespace-nowrap"
                  onClick={async () => {
                    await unlockAudio();
                    handleGoLive();
                  }}
                >
                  <Radio className="mr-2 w-5 h-5" /> Go Live
                </button>
                <button
                  className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-lg font-medium text-custom-green whitespace-nowrap"
                  onClick={async () => {
                    await unlockAudio();
                    handleFileUploadClick("image");
                  }}
                >
                  <ImageIcon className="mr-2 w-5 h-5" /> Gallery
                </button>
                <button
                  className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-lg font-medium text-custom-green whitespace-nowrap"
                  onClick={async () => {
                    await unlockAudio();
                    handleCameraClick();
                  }}
                >
                  <Camera className="mr-2 w-5 h-5" /> Camera
                </button>
                <button
                  className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-lg font-medium text-custom-green whitespace-nowrap"
                  onClick={async () => {
                    await unlockAudio();
                    handleFileUploadClick("video");
                  }}
                >
                  <Video className="mr-2 w-5 h-5" />
                  Video
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* <button
        className="fixed bottom-4 w-[11rem] ml-[7rem] bg-white text-black px-4 py-2 rounded-md z-20"
        onClick={() => stopSession()}
      >
        Stop
      </button> */}

      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 w-[95%] max-w-7xl z-20 px-4">
        <div className="flex justify-center">
          <button
            className="bg-gray-800 p-3 rounded-lg flex items-center justify-center text-xl font-medium text-custom-green whitespace-nowrap w-1/4 md:w-[12.5%]"
            onClick={async () => {
              // Unlock audio on button click (user interaction)
              await unlockAudio();
              handleStopSession();
            }}
          >
            Stop
          </button>
        </div>
      </div>
    </div>
  );
};

export const LiveAvatarSession: React.FC<{
  mode: "FULL" | "CUSTOM";
  sessionAccessToken: string;
  onSessionStopped: () => void;
  onExit?: () => void;
}> = ({ mode, sessionAccessToken, onSessionStopped, onExit }) => {
  return (
    <LiveAvatarContextProvider sessionAccessToken={sessionAccessToken}>
      <LiveAvatarSessionComponent
        mode={mode}
        onSessionStopped={onSessionStopped}
        onExit={onExit}
      />
    </LiveAvatarContextProvider>
  );
};

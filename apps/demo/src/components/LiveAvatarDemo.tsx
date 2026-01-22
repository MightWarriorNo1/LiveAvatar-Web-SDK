"use client";

import { useState, useEffect } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExited, setIsExited] = useState(false);

  useEffect(() => {
    // Automatically start FULL mode session on mount
    const startSession = async () => {
      try {
        setIsLoading(true);
        const res = await fetch("/api/start-session", {
          method: "POST",
        });
        console.log("RESPONSE", res);
        if (!res.ok) {
          const error = await res.json();
          setError(error.error);
          setIsLoading(false);
          return;
        }
        const { session_token } = await res.json();
        setSessionToken(session_token);
        setIsLoading(false);
      } catch (error: unknown) {
        setError((error as Error).message);
        setIsLoading(false);
      }
    };

    startSession();
  }, []);

  const onSessionStopped = () => {
    // Only restart if not exited (user didn't click Stop to exit)
    if (!isExited) {
      // Reset the FE state
      setSessionToken("");
      // Automatically restart session
      const startSession = async () => {
        try {
          setIsLoading(true);
          const res = await fetch("/api/start-session", {
            method: "POST",
          });
          if (!res.ok) {
            const error = await res.json();
            setError(error.error);
            setIsLoading(false);
            return;
          }
          const { session_token } = await res.json();
          setSessionToken(session_token);
          setIsLoading(false);
        } catch (error: unknown) {
          setError((error as Error).message);
          setIsLoading(false);
        }
      };
      startSession();
    }
  };

  const handleExit = (completeExit: boolean = false) => {
    if (completeExit) {
      // Navigate back to the previous page in browser history
      // This will take the user back to the original page they came from
      if (typeof window !== "undefined") {
        // Detect if we're on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );

        // Strategy 1: Try to go back in history (works if user navigated from another page)
        // This is the most reliable method for mobile when user came from another page
        if (window.history.length > 1) {
          try {
            window.history.back();
            // Don't wait - let the browser handle the navigation
            return;
          } catch (e) {
            console.warn("history.back() failed:", e);
            // Fall through to alternative methods
          }
        }

        // Strategy 2: Try to navigate to referrer
        const referrer = document.referrer;
        if (referrer && referrer !== window.location.href && referrer !== "") {
          try {
            window.location.href = referrer;
            return;
          } catch (e) {
            console.warn("Failed to navigate to referrer:", e);
          }
        }

        // Strategy 3: For mobile, try window.close() if applicable
        // Note: This only works if the window was opened by JavaScript
        if (isMobile) {
          try {
            // window.close() only works if window was opened by script
            if (window.opener) {
              window.close();
              return;
            }
          } catch (e) {
            console.warn("window.close() not allowed:", e);
          }
        }

        // Strategy 4: Final fallback - Navigate to root
        // On mobile, this at least gets them to a different page
        // The user can then use the browser's back button to exit
        try {
          window.location.href = "/";
        } catch (e) {
          console.error("Failed to navigate:", e);
          // Last resort: Show exit message
          setIsExited(true);
          setSessionToken("");
        }
      }
      // Don't set isExited when completely exiting - we're navigating away
      return;
    }
    // Regular exit - show "Session Ended" message
    setIsExited(true);
    setSessionToken("");
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <div className="text-white text-xl">Loading...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <div className="text-red-500">
          {"Error getting session token: " + error}
        </div>
      </div>
    );
  }

  if (isExited) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <div className="text-white text-2xl font-semibold">Session Ended</div>
        <div className="text-gray-400 text-lg">
          Thank you for using iSolveUrProblems.ai
        </div>
      </div>
    );
  }

  return (
    <LiveAvatarSession
      mode="FULL"
      sessionAccessToken={sessionToken}
      onSessionStopped={onSessionStopped}
      onExit={handleExit}
    />
  );
};

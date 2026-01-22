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
        // Check if there's history to go back to
        if (window.history.length > 1) {
          window.history.back();
        } else {
          // If no history, try to go to the referrer or root
          const referrer = document.referrer;
          if (referrer && referrer !== window.location.href) {
            window.location.href = referrer;
          } else {
            // Fallback: go to root
            window.location.href = "/";
          }
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

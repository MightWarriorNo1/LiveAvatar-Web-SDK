"use client";

import { useState, useEffect } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isExited, setIsExited] = useState(false);
  // Removed auto-restart functionality - sessions end without restarting

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
    // Session ended - just mark as exited and clear token
    // No auto-restart - user must refresh page to start a new session
    if (!isExited) {
      setIsExited(true);
      setSessionToken("");
    }
  };

  // Helper function to try closing the tab with multiple methods
  const tryCloseTab = () => {
    if (typeof window === "undefined") return;

    // Try window.close() multiple times with different approaches
    try {
      window.close();
    } catch (e) {
      // Ignore
    }

    // Try self.close() (some browsers support this)
    try {
      (window as any).self?.close();
    } catch (e) {
      // Ignore
    }

    // Try top.close() if in iframe
    try {
      if (window.top && window.top !== window) {
        (window.top as any).close();
      }
    } catch (e) {
      // Ignore
    }
  };

  const handleExit = (completeExit: boolean = false) => {
    if (completeExit) {
      // Aggressively try to exit/close the tab on mobile
      if (typeof window !== "undefined") {
        // Detect if we're on mobile
        const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
          navigator.userAgent
        );

        // For mobile: Try multiple aggressive exit strategies
        if (isMobile) {
          // Strategy 1: Try window.close() immediately (works if opened by script)
          try {
            if (window.opener || window.history.length === 1) {
              window.close();
              // Give it a moment to close
              setTimeout(() => {
                // If still open, try other methods
                tryCloseTab();
              }, 100);
              return;
            }
          } catch (e) {
            // Fall through to other methods
          }

          // Strategy 2: Navigate to about:blank to minimize the page
          // This creates a blank page that's easy to close
          try {
            window.location.replace("about:blank");
            // Also try to close after navigation
            setTimeout(() => {
              try {
                window.close();
              } catch (e) {
                // Ignore - already on blank page
              }
            }, 100);
            return;
          } catch (e) {
            console.warn("Failed to navigate to about:blank:", e);
          }

          // Strategy 3: Try history.back() if available
          if (window.history.length > 1) {
            try {
              window.history.back();
              return;
            } catch (e) {
              // Continue to next strategy
            }
          }

          // Strategy 4: Navigate to referrer if available
          const referrer = document.referrer;
          if (referrer && referrer !== window.location.href && referrer !== "") {
            try {
              window.location.replace(referrer);
              return;
            } catch (e) {
              // Continue to final strategy
            }
          }

          // Strategy 5: Final fallback - Navigate to about:blank
          // This at least minimizes the page content
          try {
            window.location.replace("about:blank");
          } catch (e) {
            // Last resort: Show exit message
            setIsExited(true);
            setSessionToken("");
          }
        } else {
          // For desktop: Use standard navigation
          if (window.history.length > 1) {
            try {
              window.history.back();
              return;
            } catch (e) {
              // Fall through
            }
          }

          const referrer = document.referrer;
          if (referrer && referrer !== window.location.href && referrer !== "") {
            try {
              window.location.href = referrer;
              return;
            } catch (e) {
              // Fall through
            }
          }

          try {
            window.location.href = "/";
          } catch (e) {
            setIsExited(true);
            setSessionToken("");
          }
        }
      }
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
        <button
          onClick={() => {
            window.location.reload();
          }}
          className="bg-custom-green text-black px-6 py-3 rounded-md font-semibold hover:bg-green-400 transition-colors mt-4"
        >
          Start New Session
        </button>
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

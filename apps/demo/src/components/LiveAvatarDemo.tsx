"use client";

import { useState, useEffect } from "react";
import { LiveAvatarSession } from "./LiveAvatarSession";

export const LiveAvatarDemo = () => {
  const [sessionToken, setSessionToken] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

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
  };

  if (isLoading) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center gap-4">
        <div className="text-white text-xl">Connecting...</div>
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

  return (
        <LiveAvatarSession
      mode="FULL"
          sessionAccessToken={sessionToken}
          onSessionStopped={onSessionStopped}
        />
  );
};

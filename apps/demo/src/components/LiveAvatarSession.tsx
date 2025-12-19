"use client";

import React, { useEffect, useRef, useState } from "react";
import {
  LiveAvatarContextProvider,
  useSession,
  useTextChat,
  useVoiceChat,
  useLiveAvatarContext,
} from "../liveavatar";
import { SessionState } from "@heygen/liveavatar-web-sdk";
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
  const videoRef = useRef<HTMLVideoElement>(null);
  const greetingSentRef = useRef<boolean>(false);

  useEffect(() => {
    if (sessionState === SessionState.DISCONNECTED) {
      greetingSentRef.current = false;
      onSessionStopped();
    }
  }, [sessionState, onSessionStopped]);

  useEffect(() => {
    if (isStreamReady && videoRef.current) {
      attachElement(videoRef.current);
    }
  }, [attachElement, isStreamReady]);

  useEffect(() => {
    if (isStreamReady && sessionState === SessionState.CONNECTED && !greetingSentRef.current) {
      greetingSentRef.current = true;
      // Use repeat() instead of sendMessage() so it works in both FULL and CUSTOM modes
      // In CUSTOM mode, this will speak directly via ElevenLabs without going through OpenAI
      repeat("Hello I am 6, your personal assistant, how can I help you today");
    }
  }, [isStreamReady, sessionState, repeat]);

  useEffect(() => {
    if (sessionState === SessionState.INACTIVE) {
      startSession();
    }
  }, [startSession, sessionState]);

  // const VoiceChatComponents = (
  //   <>
  //     <p>Voice Chat Active: {isActive ? "true" : "false"}</p>
  //     <p>Voice Chat Loading: {isLoading ? "true" : "false"}</p>
  //     {isActive && <p>Muted: {isMuted ? "true" : "false"}</p>}
  //     <Button
  //       onClick={() => {
  //         if (isActive) {
  //           stop();
  //         } else {
  //           start();
  //         }
  //       }}
  //       disabled={isLoading}
  //     >
  //       {isActive ? "Stop Voice Chat" : "Start Voice Chat"}
  //     </Button>
  //     {isActive && (
  //       <Button
  //         onClick={() => {
  //           if (isMuted) {
  //             unmute();
  //           } else {
  //             mute();
  //           }
  //         }}
  //       >
  //         {isMuted ? "Unmute" : "Mute"}
  //       </Button>
  //     )}
  //   </>
  // );

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
      </div>

      {/* Full screen video */}
      <div className="relative w-full h-full flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          className="w-full h-full object-contain"
        />
        <button
          className="absolute bottom-4 right-4 bg-white text-black px-4 py-2 rounded-md z-20"
          onClick={() => stopSession()}
        >
          Stop
        </button>
      </div>

      {/* Controls overlay - hidden by default, can be shown on hover or kept visible */}
      {/* <div className="absolute bottom-4 left-4 right-4 z-10 flex flex-col items-center gap-2 bg-black/50 p-4 rounded-md">
        <div className="flex flex-row items-center gap-2 text-white text-xs">
          <p>Session: {sessionState}</p>
          <p>Quality: {connectionQuality}</p>
          {mode === "FULL" && (
            <p>User: {isUserTalking ? "talking" : "silent"}</p>
          )}
          <p>Avatar: {isAvatarTalking ? "talking" : "silent"}</p>
        </div>
        {mode === "FULL" && (
          <div className="flex flex-col items-center gap-2">
            {VoiceChatComponents}
          </div>
        )}
        <div className="flex flex-row items-center gap-2">
          <Button
            onClick={() => {
              keepAlive();
            }}
          >
            Keep Alive
          </Button>
          <Button
            onClick={() => {
              startListening();
            }}
          >
            Start Listening
          </Button>
          <Button
            onClick={() => {
              stopListening();
            }}
          >
            Stop Listening
          </Button>
          <Button
            onClick={() => {
              interrupt();
            }}
          >
            Interrupt
          </Button>
        </div>
        <div className="flex flex-row items-center gap-2">
          <input
            type="text"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            className="w-[400px] bg-white text-black px-4 py-2 rounded-md"
          />
          <Button
            onClick={() => {
              sendMessage(message);
              setMessage("");
            }}
          >
            Send
          </Button>
          <Button
            onClick={() => {
              repeat(message);
              setMessage("");
            }}
          >
            Repeat
          </Button>
        </div>
      </div> */}
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

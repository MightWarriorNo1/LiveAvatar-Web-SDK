import { useCallback } from "react";
import { useLiveAvatarContext } from "./context";

export const useTextChat = (mode: "FULL" | "CUSTOM") => {
  const { sessionRef } = useLiveAvatarContext();

  const sendMessage = useCallback(
    async (message: string) => {
      try {
        if (mode === "FULL") {
          // Use GrokAI for chat completion in FULL mode
          const response = await fetch("/api/grokai-chat-complete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
            console.error("GrokAI API error:", errorData);
            throw new Error(errorData.error || "Failed to get response from GrokAI");
          }

          const chatData = await response.json();
          const chatResponseText = chatData.response;

          if (!chatResponseText) {
            console.error("No response text from GrokAI:", chatData);
            throw new Error("No response text received from GrokAI");
          }

          const res = await fetch("/api/elevenlabs-text-to-speech", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: chatResponseText }),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
            console.error("ElevenLabs API error:", errorData);
            throw new Error(errorData.error || "Failed to generate speech");
          }

          const audioData = await res.json();
          const audioBase64 = audioData.audio;

          if (!audioBase64) {
            console.error("No audio data received:", audioData);
            throw new Error("No audio data received from ElevenLabs");
          }

          // Decode base64 to get raw PCM data
          const audio = atob(audioBase64);

          console.log("[FULL mode] Audio data received, base64 length:", audioBase64.length, "decoded length:", audio.length);
          console.log("[FULL mode] Session state:", sessionRef.current.state);
          
          // Have the avatar repeat the audio
          try {
            sessionRef.current.repeatAudio(audio);
            console.log("[FULL mode] repeatAudio called successfully");
          } catch (error) {
            console.error("[FULL mode] Error calling repeatAudio:", error);
            throw error;
          }
        } else if (mode === "CUSTOM") {
          const response = await fetch("/api/openai-chat-complete", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ message }),
          });

          if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: "Unknown error" }));
            console.error("OpenAI API error:", errorData);
            throw new Error(errorData.error || "Failed to get response from OpenAI");
          }

          const chatData = await response.json();
          const chatResponseText = chatData.response;

          if (!chatResponseText) {
            console.error("No response text from OpenAI:", chatData);
            throw new Error("No response text received from OpenAI");
          }

          const res = await fetch("/api/elevenlabs-text-to-speech", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ text: chatResponseText }),
          });

          if (!res.ok) {
            const errorData = await res.json().catch(() => ({ error: "Unknown error" }));
            console.error("ElevenLabs API error:", errorData);
            throw new Error(errorData.error || "Failed to generate speech");
          }

          const audioData = await res.json();
          const audioBase64 = audioData.audio;

          if (!audioBase64) {
            console.error("No audio data received:", audioData);
            throw new Error("No audio data received from ElevenLabs");
          }

          // Decode base64 to get raw PCM data
          const audio = atob(audioBase64);

          console.log("[CUSTOM mode] Audio data received, base64 length:", audioBase64.length, "decoded length:", audio.length);
          console.log("[CUSTOM mode] Session state:", sessionRef.current.state);
          
          // Have the avatar repeat the audio
          try {
            sessionRef.current.repeatAudio(audio);
            console.log("[CUSTOM mode] repeatAudio called successfully");
          } catch (error) {
            console.error("[CUSTOM mode] Error calling repeatAudio:", error);
            throw error;
          }
        }
      } catch (error) {
        console.error("Error in sendMessage:", error);
        throw error;
      }
    },
    [sessionRef, mode],
  );

  return {
    sendMessage,
  };
};

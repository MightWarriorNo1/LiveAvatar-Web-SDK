export const API_KEY = process.env.LIVEAVATAR_API_KEY || "";
export const API_URL = process.env.LIVEAVATAR_API_URL || "";
export const AVATAR_ID = process.env.LIVEAVATAR_AVATAR_ID || "";

// FULL MODE Customizations
// Wayne's avatar voice and context
export const VOICE_ID = process.env.LIVEAVATAR_VOICE_ID || "";
export const CONTEXT_ID = process.env.LIVEAVATAR_CONTEXT_ID || "";
export const LANGUAGE = process.env.LIVEAVATAR_LANGUAGE || "";

// CUSTOM MODE Customizations
export const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY || "";
export const ELEVENLABS_VOICE_ID = process.env.ELEVENLABS_VOICE_ID || "21m00Tcm4TlvDq8ikWAM"; // Default: Rachel voice

// LLM Provider Configuration (for CUSTOM mode)
// Set LLM_PROVIDER to "openai" or "xai" (default: "xai")
export const LLM_PROVIDER = (process.env.LLM_PROVIDER || "xai").toLowerCase();
export const OPENAI_API_KEY = process.env.OPENAI_API_KEY || "";
export const XAI_API_KEY = process.env.XAI_API_KEY || "";

import { LLM_PROVIDER, OPENAI_API_KEY, XAI_API_KEY } from "../secrets";

const SYSTEM_PROMPT =
  "You are a helpful assistant. You are being used in a demo. Please act courteously and helpfully.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      message,
      model,
      system_prompt = SYSTEM_PROMPT,
    } = body;

    if (!message) {
      return new Response(JSON.stringify({ error: "message is required" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
        },
      });
    }

    // Determine which provider to use (default: xAI)
    const useXAI = LLM_PROVIDER === "xai";
    const apiKey = useXAI ? XAI_API_KEY : OPENAI_API_KEY;
    const apiUrl = useXAI 
      ? "https://api.x.ai/v1/chat/completions"
      : "https://api.openai.com/v1/chat/completions";
    const defaultModel = useXAI 
      ? "grok-2-latest"
      : "gpt-4o-mini";
    const selectedModel = model || defaultModel;
    const providerName = useXAI ? "xAI" : "OpenAI";

    if (!apiKey) {
      return new Response(
        JSON.stringify({ 
          error: `${providerName} API key not configured`,
          hint: useXAI 
            ? "Please set XAI_API_KEY environment variable"
            : "Please set OPENAI_API_KEY environment variable"
        }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Call LLM API (xAI or OpenAI - both use the same schema)
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: selectedModel,
        messages: [
          { role: "system", content: system_prompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error(`${providerName} API error:`, errorData);
      return new Response(
        JSON.stringify({
          error: `Failed to generate response from ${providerName}`,
          details: errorData,
        }),
        {
          status: res.status,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    const data = await res.json();
    const response = data.choices[0].message.content;

    return new Response(JSON.stringify({ response }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error generating response:", error);
    return new Response(
      JSON.stringify({ error: "Failed to generate response" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

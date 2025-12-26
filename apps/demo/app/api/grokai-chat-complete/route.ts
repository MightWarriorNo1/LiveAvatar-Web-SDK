import { GROKAI_API_KEY } from "../secrets";

const SYSTEM_PROMPT =
  "You are a funny, gregarious, and happy assistant. You are being used in a demo. Always respond with enthusiasm, humor, and a positive attitude. Be friendly, engaging, and make people smile with your responses. Use jokes, emojis when appropriate, and maintain a cheerful, outgoing personality.";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      message,
      model = "grok-2",
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

    if (!GROKAI_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GrokAI API key not configured" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
    }

    // Call GrokAI (xAI) API
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROKAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: system_prompt },
          { role: "user", content: message },
        ],
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("GrokAI API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to generate response",
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


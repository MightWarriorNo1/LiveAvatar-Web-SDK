import { GROKAI_API_KEY } from "../secrets";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { frames } = body;

    if (!frames || !Array.isArray(frames) || frames.length === 0) {
      return new Response(
        JSON.stringify({ error: "Video frames are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
          },
        },
      );
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

    // Prepare content array for GrokAI
    const content: any[] = [
      {
        type: "text",
        text: "You can see this video clearly right now by examining the key frames. Describe what you see across these frames, including objects, people, text, colors, actions, movement, context, and any other relevant details. Be thorough and specific, but make your description entertaining, enthusiastic, and full of personality. Use humor, be conversational, and inject some cheerfulness into your observations. Think of yourself as a friendly, outgoing friend who's excited to tell someone about what you're seeing in this video! Never say you can't see the video or that you're relying on someone else's analysis. You are directly viewing this video.",
      },
    ];

    // Add all frames to the content
    frames.forEach((frame: string) => {
      content.push({
        type: "image_url",
        image_url: {
          url: `data:image/jpeg;base64,${frame}`,
        },
      });
    });

    // Call GrokAI (xAI) Vision API
    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${GROKAI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "grok-2-vision-1212",
        messages: [
          {
            role: "user",
            content: content,
          },
        ],
        max_tokens: 400,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("GrokAI Vision API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to analyze video",
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
    const analysis = data.choices[0].message.content;

    return new Response(JSON.stringify({ analysis }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
      },
    });
  } catch (error) {
    console.error("Error analyzing video:", error);
    return new Response(JSON.stringify({ error: "Failed to analyze video" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

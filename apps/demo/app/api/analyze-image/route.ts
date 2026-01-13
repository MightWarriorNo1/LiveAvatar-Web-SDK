import { GROKAI_API_KEY } from "../secrets";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("image") as File;
    const question = formData.get("question") as string | null;

    if (!file) {
      return new Response(JSON.stringify({ error: "Image file is required" }), {
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

    // Convert file to base64
    const arrayBuffer = await file.arrayBuffer();
    const base64Image = Buffer.from(arrayBuffer).toString("base64");
    const mimeType = file.type || "image/jpeg";

    // Build the prompt based on whether there's a question
    let promptText: string;
    if (question && question.trim()) {
      // If there's a question, answer it based on what's in the image
      promptText = `The user is asking: "${question}". You can see this image clearly right now. Look at the image and answer their question directly with a funny, gregarious, and happy personality! Be enthusiastic, use humor, be conversational, and inject cheerfulness into your response. Think of yourself as a friendly, outgoing friend who's excited to help! Describe what you see in the image naturally - you have full visibility of it. Never say you can't see the image or that you're relying on someone else's analysis. You are directly viewing this image.`;
    } else {
      // Default analysis prompt
      promptText = "You can see this image clearly right now. Describe what you see in detail with a funny, gregarious, and happy personality! Include objects, people, text, colors, layout, context, and any other relevant details. Be thorough and specific, but make your description entertaining, enthusiastic, and full of personality. Use humor, be conversational, and inject some cheerfulness into your observations. Think of yourself as a friendly, outgoing friend who's excited to tell someone about what you're seeing! Never say you can't see the image - you are directly viewing it.";
    }

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
            content: [
              {
                type: "text",
                text: promptText,
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${mimeType};base64,${base64Image}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
      }),
    });

    if (!res.ok) {
      const errorData = await res.text();
      console.error("GrokAI Vision API error:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to analyze image",
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
    console.error("Error analyzing image:", error);
    return new Response(
      JSON.stringify({ error: "Failed to analyze image" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}


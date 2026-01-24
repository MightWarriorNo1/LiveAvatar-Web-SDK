import { GROKAI_API_KEY } from "../secrets";
import { rateLimit, createRateLimitResponse } from "../../../lib/rate-limit";
import { usageTracker } from "../../../lib/usage-tracker";
import { getLimitsConfig } from "../../../lib/limits-config";

export async function POST(request: Request) {
  const limits = getLimitsConfig();

  // Check rate limit
  const rateLimitResult = await rateLimit(
    request,
    limits.rateLimit.analyzeImage.maxRequests,
    limits.rateLimit.analyzeImage.windowMs,
  );

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult.resetTime);
  }

  // Check daily usage caps
  if (
    usageTracker.isDailyLimitExceeded(
      undefined,
      limits.usageCaps.daily.maxApiCalls,
    )
  ) {
    return new Response(
      JSON.stringify({
        error: "Daily API call limit exceeded. Please try again tomorrow.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Check hourly usage caps
  if (
    usageTracker.isHourlyLimitExceeded(
      undefined,
      limits.usageCaps.hourly.maxApiCalls,
    )
  ) {
    return new Response(
      JSON.stringify({
        error: "Hourly API call limit exceeded. Please try again later.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Track API call
  usageTracker.trackApiCall();

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
      promptText = `Look at this image and answer: "${question}". Be direct and concise (2-3 sentences max). Be friendly but brief.`;
    } else {
      // Default analysis prompt - VERY concise
      promptText =
        "Briefly describe what you see in this image in 1-2 sentences. Be direct and concise.";
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
        max_tokens: 150,
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
    return new Response(JSON.stringify({ error: "Failed to analyze image" }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
      },
    });
  }
}

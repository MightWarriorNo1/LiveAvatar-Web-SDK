import { GROKAI_API_KEY } from "../secrets";

import { rateLimit, createRateLimitResponse } from "../../../lib/rate-limit";
import { usageTracker } from "../../../lib/usage-tracker";
import { getLimitsConfig } from "../../../lib/limits-config";

export async function POST(request: Request) {
  const limits = getLimitsConfig();

  // Check rate limit
  const rateLimitResult = await rateLimit(
    request,
    limits.rateLimit.analyzeVideo.maxRequests,
    limits.rateLimit.analyzeVideo.windowMs,
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
        text: "Briefly describe what you see in this video across these frames in 2-3 sentences. Be direct and concise.",
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
        max_tokens: 200,
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

import { API_KEY, API_URL, AVATAR_ID } from "../secrets";
import { rateLimit, createRateLimitResponse } from "../../../lib/rate-limit";
import { usageTracker } from "../../../lib/usage-tracker";
import { getLimitsConfig } from "../../../lib/limits-config";

export async function POST(request: Request) {
  const limits = getLimitsConfig();

  // Check rate limit
  const rateLimitResult = await rateLimit(
    request,
    limits.rateLimit.startSession.maxRequests,
    limits.rateLimit.startSession.windowMs,
  );

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult.resetTime);
  }

  // Check daily usage caps
  if (usageTracker.isDailyLimitExceeded(limits.usageCaps.daily.maxSessions)) {
    return new Response(
      JSON.stringify({
        error: "Daily session limit exceeded. Please try again tomorrow.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  // Check hourly usage caps
  if (usageTracker.isHourlyLimitExceeded(limits.usageCaps.hourly.maxSessions)) {
    return new Response(
      JSON.stringify({
        error: "Hourly session limit exceeded. Please try again later.",
      }),
      {
        status: 429,
        headers: { "Content-Type": "application/json" },
      },
    );
  }

  let session_token = "";
  let session_id = "";
  try {
    const res = await fetch(`${API_URL}/v1/sessions/token`, {
      method: "POST",
      headers: {
        "X-API-KEY": API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        mode: "CUSTOM",
        avatar_id: AVATAR_ID,
      }),
    });
    if (!res.ok) {
      const resp = await res.json();
      let errorMessage = "Failed to retrieve session token";

      // Handle different error response formats
      if (resp?.data && Array.isArray(resp.data) && resp.data.length > 0) {
        errorMessage = resp.data[0].message || errorMessage;
      } else if (resp?.data?.message) {
        errorMessage = resp.data.message;
      } else if (resp?.message) {
        errorMessage = resp.message;
      } else if (resp?.error) {
        errorMessage = resp.error;
      }

      return new Response(JSON.stringify({ error: errorMessage }), {
        status: res.status,
      });
    }
    const data = await res.json();
    console.log(data);

    session_token = data.data.session_token;
    session_id = data.data.session_id;

    // Track session start
    if (session_id) {
      usageTracker.trackSessionStart(session_id);
    }
  } catch (error: unknown) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
    });
  }

  if (!session_token) {
    return new Response(
      JSON.stringify({ error: "Failed to retrieve session token" }),
      {
        status: 500,
      },
    );
  }
  return new Response(JSON.stringify({ session_token, session_id }), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * API endpoint for monitoring usage statistics
 * Returns current usage metrics for monitoring and debugging
 */

import { usageTracker } from "../../../lib/usage-tracker";
import { getLimitsConfig } from "../../../lib/limits-config";

export async function GET() {
  try {
    const limits = getLimitsConfig();
    const stats = usageTracker.getStats();

    return new Response(
      JSON.stringify({
        stats: {
          today: {
            sessions: stats.today.sessionCount,
            apiCalls: stats.today.apiCallCount,
            totalDurationMinutes: Math.floor(stats.today.totalDuration / 60),
            totalDurationSeconds: stats.today.totalDuration,
          },
          currentHour: {
            sessions: stats.currentHour.sessionCount,
            apiCalls: stats.currentHour.apiCallCount,
            totalDurationMinutes: Math.floor(stats.currentHour.totalDuration / 60),
            totalDurationSeconds: stats.currentHour.totalDuration,
          },
          activeSessions: stats.activeSessions,
        },
        limits: {
          daily: {
            maxSessions: limits.usageCaps.daily.maxSessions,
            maxApiCalls: limits.usageCaps.daily.maxApiCalls,
            maxDurationMinutes: limits.usageCaps.daily.maxDurationMinutes,
          },
          hourly: {
            maxSessions: limits.usageCaps.hourly.maxSessions,
            maxApiCalls: limits.usageCaps.hourly.maxApiCalls,
            maxDurationMinutes: limits.usageCaps.hourly.maxDurationMinutes,
          },
          session: {
            maxDurationMinutes: limits.session.maxDurationMinutes,
            maxAutoRestarts: limits.session.maxAutoRestarts,
            maxSessionsPerDay: limits.session.maxSessionsPerDay,
          },
        },
        rateLimits: {
          startSession: limits.rateLimit.startSession,
          analyzeImage: limits.rateLimit.analyzeImage,
          analyzeVideo: limits.rateLimit.analyzeVideo,
        },
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  } catch (error) {
    console.error("Error getting usage stats:", error);
    return new Response(
      JSON.stringify({ error: "Failed to get usage stats" }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
        },
      },
    );
  }
}

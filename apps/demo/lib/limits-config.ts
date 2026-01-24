/**
 * Configuration for usage limits and safeguards
 * All values can be overridden via environment variables
 */

export interface LimitsConfig {
  // Rate limiting
  rateLimit: {
    startSession: {
      maxRequests: number;
      windowMs: number; // Time window in milliseconds
    };
    analyzeImage: {
      maxRequests: number;
      windowMs: number;
    };
    analyzeVideo: {
      maxRequests: number;
      windowMs: number;
    };
    apiCall: {
      maxRequests: number;
      windowMs: number;
    };
  };

  // Usage caps
  usageCaps: {
    daily: {
      maxSessions: number;
      maxApiCalls: number;
      maxDurationMinutes: number; // Total session duration in minutes per day
    };
    hourly: {
      maxSessions: number;
      maxApiCalls: number;
      maxDurationMinutes: number;
    };
  };

  // Session limits
  session: {
    maxDurationMinutes: number; // Maximum duration per session in minutes
    maxAutoRestarts: number; // Maximum number of automatic session restarts (total sessions = maxAutoRestarts + 1)
    maxSessionsPerDay: number; // Maximum sessions per user per day
  };
}

/**
 * Get limits configuration from environment variables or use defaults
 */
export function getLimitsConfig(): LimitsConfig {
  return {
    rateLimit: {
      startSession: {
        maxRequests: parseInt(
          process.env.RATE_LIMIT_START_SESSION_MAX || "10",
          10,
        ),
        windowMs: parseInt(
          process.env.RATE_LIMIT_START_SESSION_WINDOW_MS || "60000",
          10,
        ), // 1 minute default
      },
      analyzeImage: {
        maxRequests: parseInt(
          process.env.RATE_LIMIT_ANALYZE_IMAGE_MAX || "20",
          10,
        ),
        windowMs: parseInt(
          process.env.RATE_LIMIT_ANALYZE_IMAGE_WINDOW_MS || "60000",
          10,
        ), // 1 minute default
      },
      analyzeVideo: {
        maxRequests: parseInt(
          process.env.RATE_LIMIT_ANALYZE_VIDEO_MAX || "10",
          10,
        ),
        windowMs: parseInt(
          process.env.RATE_LIMIT_ANALYZE_VIDEO_WINDOW_MS || "60000",
          10,
        ), // 1 minute default
      },
      apiCall: {
        maxRequests: parseInt(
          process.env.RATE_LIMIT_API_CALL_MAX || "100",
          10,
        ),
        windowMs: parseInt(
          process.env.RATE_LIMIT_API_CALL_WINDOW_MS || "60000",
          10,
        ), // 1 minute default
      },
    },
    usageCaps: {
      daily: {
        maxSessions: parseInt(
          process.env.DAILY_MAX_SESSIONS || "330",
          10,
        ), // 330 credits per day / 20 credits per session = ~16 sessions, but we limit per user to 3
        maxApiCalls: parseInt(process.env.DAILY_MAX_API_CALLS || "1000", 10),
        maxDurationMinutes: parseInt(
          process.env.DAILY_MAX_DURATION_MINUTES || "330",
          10,
        ), // 330 credits per day (10 min session = 20 credits, so 330 credits = 16.5 sessions worth)
      },
      hourly: {
        maxSessions: parseInt(
          process.env.HOURLY_MAX_SESSIONS || "20",
          10,
        ),
        maxApiCalls: parseInt(process.env.HOURLY_MAX_API_CALLS || "200", 10),
        maxDurationMinutes: parseInt(
          process.env.HOURLY_MAX_DURATION_MINUTES || "60",
          10,
        ), // 1 hour default
      },
    },
    session: {
      maxDurationMinutes: parseInt(
        process.env.MAX_SESSION_DURATION_MINUTES || "10",
        10,
      ), // 10 minutes default (20 credits per session)
      maxAutoRestarts: parseInt(
        process.env.MAX_SESSION_AUTO_RESTARTS || "2",
        10,
      ), // 2 restarts default (3 total sessions per day)
      maxSessionsPerDay: parseInt(
        process.env.MAX_SESSIONS_PER_DAY || "3",
        10,
      ), // 3 sessions per day default
    },
  };
}

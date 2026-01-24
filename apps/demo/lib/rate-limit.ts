/**
 * Simple in-memory rate limiter
 * For production, consider using Redis or a dedicated rate limiting service
 */

interface RateLimitStore {
  count: number;
  resetTime: number;
}

class RateLimiter {
  private store: Map<string, RateLimitStore> = new Map();
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 5 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    for (const [key, value] of this.store.entries()) {
      if (value.resetTime < now) {
        this.store.delete(key);
      }
    }
  }

  /**
   * Check if a request should be rate limited
   * @param identifier - Unique identifier (IP, user ID, etc.)
   * @param maxRequests - Maximum number of requests
   * @param windowMs - Time window in milliseconds
   * @returns true if allowed, false if rate limited
   */
  check(
    identifier: string,
    maxRequests: number,
    windowMs: number,
  ): { allowed: boolean; remaining: number; resetTime: number } {
    const now = Date.now();
    const key = `${identifier}:${Math.floor(now / windowMs)}`;

    const entry = this.store.get(key);
    if (!entry || entry.resetTime < now) {
      // Create new entry
      const resetTime = now + windowMs;
      this.store.set(key, { count: 1, resetTime });
      return { allowed: true, remaining: maxRequests - 1, resetTime };
    }

    if (entry.count >= maxRequests) {
      return { allowed: false, remaining: 0, resetTime: entry.resetTime };
    }

    entry.count++;
    return {
      allowed: true,
      remaining: maxRequests - entry.count,
      resetTime: entry.resetTime,
    };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.store.clear();
  }
}

// Singleton instance
const rateLimiter = new RateLimiter();

/**
 * Get client identifier from request
 * In Next.js, we need to handle headers differently
 */
function getClientIdentifier(request: Request | { headers: Headers }): string {
  // Try to get IP from various headers (for proxies/load balancers)
  const headers = request.headers;
  const forwarded = headers.get("x-forwarded-for");
  const realIp = headers.get("x-real-ip");
  const cfConnectingIp = headers.get("cf-connecting-ip");

  const ip =
    forwarded?.split(",")[0]?.trim() ||
    realIp ||
    cfConnectingIp ||
    "unknown";

  return ip;
}

/**
 * Rate limit middleware
 */
export async function rateLimit(
  request: Request,
  maxRequests: number,
  windowMs: number,
): Promise<{ allowed: boolean; remaining: number; resetTime: number }> {
  const identifier = getClientIdentifier(request);
  return rateLimiter.check(identifier, maxRequests, windowMs);
}

/**
 * Create a rate limit response
 */
export function createRateLimitResponse(
  resetTime: number,
): Response {
  const resetDate = new Date(resetTime);
  return new Response(
    JSON.stringify({
      error: "Rate limit exceeded. Please try again later.",
      resetTime: resetDate.toISOString(),
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "Retry-After": Math.ceil((resetTime - Date.now()) / 1000).toString(),
        "X-RateLimit-Reset": resetDate.toISOString(),
      },
    },
  );
}

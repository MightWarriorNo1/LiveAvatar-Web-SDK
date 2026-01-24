/**
 * Usage tracking for monitoring API consumption
 * Tracks sessions, API calls, and duration
 */

interface UsageMetrics {
  sessionCount: number;
  apiCallCount: number;
  totalDuration: number; // in seconds
  lastReset: number; // timestamp
}

interface DailyUsage {
  date: string; // YYYY-MM-DD
  metrics: UsageMetrics;
}

class UsageTracker {
  private dailyUsage: Map<string, UsageMetrics> = new Map();
  private hourlyUsage: Map<string, UsageMetrics> = new Map();
  private sessionStartTimes: Map<string, number> = new Map(); // session_id -> start timestamp
  private cleanupInterval: NodeJS.Timeout;

  constructor() {
    // Clean up old entries daily
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 24 * 60 * 60 * 1000);
  }

  private cleanup() {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // Clean up old hourly entries
    for (const [key, value] of this.hourlyUsage.entries()) {
      if (value.lastReset < oneDayAgo) {
        this.hourlyUsage.delete(key);
      }
    }

    // Clean up old daily entries (keep last 30 days)
    const thirtyDaysAgo = now - 30 * 24 * 60 * 60 * 1000;
    for (const [key, value] of this.dailyUsage.entries()) {
      if (value.lastReset < thirtyDaysAgo) {
        this.dailyUsage.delete(key);
      }
    }
  }

  private getDateKey(timestamp: number = Date.now()): string {
    return new Date(timestamp).toISOString().split("T")[0];
  }

  private getHourKey(timestamp: number = Date.now()): string {
    const date = new Date(timestamp);
    return `${date.toISOString().split("T")[0]}-${date.getHours()}`;
  }

  private getOrCreateMetrics(
    map: Map<string, UsageMetrics>,
    key: string,
  ): UsageMetrics {
    let metrics = map.get(key);
    if (!metrics) {
      metrics = {
        sessionCount: 0,
        apiCallCount: 0,
        totalDuration: 0,
        lastReset: Date.now(),
      };
      map.set(key, metrics);
    }
    return metrics;
  }

  /**
   * Track a new session start
   */
  trackSessionStart(sessionId: string): void {
    this.sessionStartTimes.set(sessionId, Date.now());

    const dailyKey = this.getDateKey();
    const hourlyKey = this.getHourKey();

    const dailyMetrics = this.getOrCreateMetrics(this.dailyUsage, dailyKey);
    const hourlyMetrics = this.getOrCreateMetrics(this.hourlyUsage, hourlyKey);

    dailyMetrics.sessionCount++;
    hourlyMetrics.sessionCount++;
  }

  /**
   * Track session end and calculate duration
   */
  trackSessionEnd(sessionId: string): void {
    const startTime = this.sessionStartTimes.get(sessionId);
    if (!startTime) {
      return; // Session not tracked
    }

    const duration = Math.floor((Date.now() - startTime) / 1000); // in seconds
    this.sessionStartTimes.delete(sessionId);

    const dailyKey = this.getDateKey(startTime);
    const hourlyKey = this.getHourKey(startTime);

    const dailyMetrics = this.getOrCreateMetrics(this.dailyUsage, dailyKey);
    const hourlyMetrics = this.getOrCreateMetrics(this.hourlyUsage, hourlyKey);

    dailyMetrics.totalDuration += duration;
    hourlyMetrics.totalDuration += duration;
  }

  /**
   * Track an API call
   */
  trackApiCall(): void {
    const dailyKey = this.getDateKey();
    const hourlyKey = this.getHourKey();

    const dailyMetrics = this.getOrCreateMetrics(this.dailyUsage, dailyKey);
    const hourlyMetrics = this.getOrCreateMetrics(this.hourlyUsage, hourlyKey);

    dailyMetrics.apiCallCount++;
    hourlyMetrics.apiCallCount++;
  }

  /**
   * Get today's usage
   */
  getTodayUsage(): UsageMetrics {
    const key = this.getDateKey();
    return this.getOrCreateMetrics(this.dailyUsage, key);
  }

  /**
   * Get current hour's usage
   */
  getCurrentHourUsage(): UsageMetrics {
    const key = this.getHourKey();
    return this.getOrCreateMetrics(this.hourlyUsage, key);
  }

  /**
   * Get usage for a specific date
   */
  getDateUsage(date: string): UsageMetrics {
    return this.getOrCreateMetrics(this.dailyUsage, date);
  }

  /**
   * Check if daily limit is exceeded
   */
  isDailyLimitExceeded(
    maxSessions?: number,
    maxApiCalls?: number,
    maxDuration?: number,
  ): boolean {
    const usage = this.getTodayUsage();
    if (maxSessions && usage.sessionCount >= maxSessions) return true;
    if (maxApiCalls && usage.apiCallCount >= maxApiCalls) return true;
    if (maxDuration && usage.totalDuration >= maxDuration) return true;
    return false;
  }

  /**
   * Check if hourly limit is exceeded
   */
  isHourlyLimitExceeded(
    maxSessions?: number,
    maxApiCalls?: number,
    maxDuration?: number,
  ): boolean {
    const usage = this.getCurrentHourUsage();
    if (maxSessions && usage.sessionCount >= maxSessions) return true;
    if (maxApiCalls && usage.apiCallCount >= maxApiCalls) return true;
    if (maxDuration && usage.totalDuration >= maxDuration) return true;
    return false;
  }

  /**
   * Get all usage statistics
   */
  getStats(): {
    today: UsageMetrics;
    currentHour: UsageMetrics;
    activeSessions: number;
  } {
    return {
      today: this.getTodayUsage(),
      currentHour: this.getCurrentHourUsage(),
      activeSessions: this.sessionStartTimes.size,
    };
  }

  destroy() {
    clearInterval(this.cleanupInterval);
    this.dailyUsage.clear();
    this.hourlyUsage.clear();
    this.sessionStartTimes.clear();
  }
}

// Singleton instance
export const usageTracker = new UsageTracker();

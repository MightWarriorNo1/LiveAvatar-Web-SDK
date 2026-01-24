/**
 * Session duration enforcer
 * Tracks active sessions and enforces maximum duration limits
 */

import { getLimitsConfig } from "./limits-config";

interface ActiveSession {
  sessionId: string;
  startTime: number;
  maxDurationMs: number;
  timeoutId: NodeJS.Timeout;
}

class SessionDurationEnforcer {
  private activeSessions: Map<string, ActiveSession> = new Map();
  private onSessionExpired?: (sessionId: string) => void;

  /**
   * Register a callback for when a session expires
   */
  onExpired(callback: (sessionId: string) => void) {
    this.onSessionExpired = callback;
  }

  /**
   * Start tracking a session
   */
  startTracking(sessionId: string, maxDurationMinutes?: number): void {
    const limits = getLimitsConfig();
    const maxDurationMs =
      (maxDurationMinutes || limits.session.maxDurationMinutes) * 60 * 1000;

    // Clear any existing tracking for this session
    this.stopTracking(sessionId);

    const timeoutId = setTimeout(() => {
      this.handleSessionExpired(sessionId);
    }, maxDurationMs);

    this.activeSessions.set(sessionId, {
      sessionId,
      startTime: Date.now(),
      maxDurationMs,
      timeoutId,
    });
  }

  /**
   * Stop tracking a session
   */
  stopTracking(sessionId: string): void {
    const session = this.activeSessions.get(sessionId);
    if (session) {
      clearTimeout(session.timeoutId);
      this.activeSessions.delete(sessionId);
    }
  }

  /**
   * Get remaining time for a session in milliseconds
   */
  getRemainingTime(sessionId: string): number | null {
    const session = this.activeSessions.get(sessionId);
    if (!session) {
      return null;
    }

    const elapsed = Date.now() - session.startTime;
    const remaining = session.maxDurationMs - elapsed;
    return Math.max(0, remaining);
  }

  /**
   * Check if a session is still valid
   */
  isValid(sessionId: string): boolean {
    return this.activeSessions.has(sessionId);
  }

  /**
   * Handle session expiration
   */
  private handleSessionExpired(sessionId: string): void {
    this.activeSessions.delete(sessionId);
    if (this.onSessionExpired) {
      this.onSessionExpired(sessionId);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): string[] {
    return Array.from(this.activeSessions.keys());
  }

  /**
   * Cleanup all sessions
   */
  destroy(): void {
    for (const session of this.activeSessions.values()) {
      clearTimeout(session.timeoutId);
    }
    this.activeSessions.clear();
  }
}

// Singleton instance
export const sessionDurationEnforcer = new SessionDurationEnforcer();

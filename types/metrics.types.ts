export const VALID_WINDOW_DAYS = [7, 14, 30] as const;
export type TimeWindowDays = (typeof VALID_WINDOW_DAYS)[number];

/**
 * The canonical scope for every metrics query.
 * windowDays + cutoffDate define the time boundary.
 * Every metric must only consider data within this scope.
 */
export interface MetricsScope {
  repositoryId?: number;
  workspaceId?: number;
  // For standard windows this will be one of TimeWindowDays, but
  // when using 'overall' the span may exceed those values, so
  // allow any positive integer here.
  windowDays: number;
  cutoffDate: Date; // Derived: now - windowDays (exact, not midnight-rounded)
}

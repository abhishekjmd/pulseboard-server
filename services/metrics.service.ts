import { prisma } from "../prisma";
import { MetricsScope } from "../types/metrics.types";

export const calculateChange = (current: number, previous: number): number => {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Math.round(((current - previous) / previous) * 100);
};

const buildWhereClause = (scope: { repositoryId?: number; workspaceId?: number }) => {
  const where: any = {};
  if (scope.repositoryId) {
    where.repositoryId = scope.repositoryId;
  } else if (scope.workspaceId) {
    where.repository = { workspaceId: scope.workspaceId };
  }
  return where;
};

/**
 * Standardizes time windows for consistent comparison
 */
const getWindows = (scope: MetricsScope) => {
  const now = new Date();
  const currentCutoff = scope.cutoffDate;
  const windowMs = now.getTime() - currentCutoff.getTime();
  const previousCutoff = new Date(currentCutoff.getTime() - windowMs);
  
  return { now, currentCutoff, previousCutoff };
};

export const getCycleTimeMetrics = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const { now, currentCutoff, previousCutoff } = getWindows(scope);

  const fetchCycleTime = async (start: Date, end: Date) => {
    const prs = await prisma.pullRequest.findMany({
      where: {
        ...baseWhere,
        state: "merged",
        mergedAt: { gte: start, lte: end },
      },
      select: { createdAt: true, mergedAt: true },
    });

    if (prs.length === 0) return 0;
    const cycleTimes = prs.map(pr => (pr.mergedAt!.getTime() - pr.createdAt.getTime()) / (1000 * 60 * 60));
    return cycleTimes.reduce((a, b) => a + b, 0) / cycleTimes.length;
  };

  const currentAvg = await fetchCycleTime(currentCutoff, now);
  const previousAvg = await fetchCycleTime(previousCutoff, currentCutoff);

  return {
    averageHours: Math.round(currentAvg * 10) / 10,
    change: calculateChange(currentAvg, previousAvg),
  };
};

export const getThroughputMetrics = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const { now, currentCutoff, previousCutoff } = getWindows(scope);

  const fetchCount = (start: Date, end: Date) => 
    prisma.pullRequest.count({
      where: {
        ...baseWhere,
        state: "merged",
        mergedAt: { gte: start, lte: end },
      },
    });

  const currentCount = await fetchCount(currentCutoff, now);
  const previousCount = await fetchCount(previousCutoff, currentCutoff);

  return {
    count: currentCount,
    change: calculateChange(currentCount, previousCount),
  };
};

export const getOpenPRs = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const count = await prisma.pullRequest.count({
    where: {
      ...baseWhere,
      state: "open",
    },
  });
  return { count };
};

export const getClosedPRs = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const count = await prisma.pullRequest.count({
    where: {
      ...baseWhere,
      state: "closed",
    },
  });
  return { count };
};

export const getStalePRs = async (scope: MetricsScope, staleDays = 7) => {
  const baseWhere = buildWhereClause(scope);
  const now = new Date();
  
  const getStaleThreshold = (baseDate: Date) => {
    const d = new Date(baseDate);
    d.setDate(d.getDate() - staleDays);
    return d;
  };

  const currentThreshold = getStaleThreshold(now);
  
  const currentCount = await prisma.pullRequest.count({
    where: {
      ...baseWhere,
      state: "open",
      createdAt: { lt: currentThreshold },
    },
  });
  
  const { currentCutoff } = getWindows(scope);
  const previousThreshold = getStaleThreshold(currentCutoff);

  const previousCount = await prisma.pullRequest.count({
    where: {
      ...baseWhere,
      state: "open",
      createdAt: { lt: previousThreshold },
      OR: [
        { state: "open" },
        { closedAt: { gt: currentCutoff } },
        { mergedAt: { gt: currentCutoff } }
      ]
    }
  });

  return {
    count: currentCount,
    change: calculateChange(currentCount, previousCount),
  };
};

export const getActiveDevelopers = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const { now, currentCutoff, previousCutoff } = getWindows(scope);

  const fetchDevCount = async (start: Date, end: Date) => {
    const devs = await prisma.pullRequest.groupBy({
      by: ['authorName'],
      where: {
        ...baseWhere,
        state: "merged",
        mergedAt: { gte: start, lte: end },
      },
    });
    return devs.length;
  };

  const currentCount = await fetchDevCount(currentCutoff, now);
  const previousCount = await fetchDevCount(previousCutoff, currentCutoff);

  return {
    count: currentCount,
    change: calculateChange(currentCount, previousCount),
  };
};

export const getTopContributors = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  
  const contributors = await prisma.pullRequest.groupBy({
    by: ['authorName'],
    where: {
      ...baseWhere,
      state: "merged",
      mergedAt: { gte: scope.cutoffDate },
    },
    _count: {
      _all: true,
    },
    orderBy: {
      _count: {
        authorName: 'desc',
      },
    },
    take: 5,
  });

  return contributors.map(c => ({
    name: c.authorName,
    count: c._count._all,
  }));
};

export const getRecentActivity = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  
  // Activity shows what's happening now, so we use updatedAt
  return prisma.pullRequest.findMany({
    where: {
      ...baseWhere,
      updatedAt: { gte: scope.cutoffDate },
    },
    orderBy: {
      updatedAt: 'desc',
    },
    take: 10,
    select: {
      id: true,
      number: true,
      title: true,
      state: true,
      authorName: true,
      updatedAt: true,
    }
  });
};

export const getActivityHistory = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  
  const prs = await prisma.pullRequest.findMany({
    where: {
      ...baseWhere,
      state: "merged",
      mergedAt: { gte: scope.cutoffDate },
    },
    select: {
      mergedAt: true,
    },
  });

  const dailyCounts: Record<string, number> = {};
  
  // Initialize all dates in the range with 0
  const days = scope.windowDays;
  for (let i = 0; i <= days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split('T')[0];
    dailyCounts[dateStr] = 0;
  }

  prs.forEach(pr => {
    if (pr.mergedAt) {
      const dateStr = pr.mergedAt.toISOString().split('T')[0];
      if (dailyCounts[dateStr] !== undefined) {
        dailyCounts[dateStr]++;
      }
    }
  });

  return Object.entries(dailyCounts)
    .map(([date, count]) => ({ date, count }))
    .sort((a, b) => a.date.localeCompare(b.date));
};

export const getActionablePRs = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  return prisma.pullRequest.findMany({
    where: {
      ...baseWhere,
      state: "open",
    },
    select: {
      id: true,
      number: true,
      title: true,
      authorName: true,
      createdAt: true,
      updatedAt: true,
      state: true,
    },
    orderBy: { createdAt: 'asc' },
  });
};

export const getMergedPRsList = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  return prisma.pullRequest.findMany({
    where: {
      ...baseWhere,
      state: "merged",
      mergedAt: { gte: scope.cutoffDate },
    },
    select: {
      id: true,
      number: true,
      title: true,
      authorName: true,
      createdAt: true,
      mergedAt: true,
      state: true,
    },
    orderBy: { mergedAt: 'desc' },
    take: 50,
  });
};

export const getHealthMetrics = async (scope: MetricsScope) => {
  const [cycleTime, throughput, stalePrs, openPrs, closedPrs, activeDevs, topContributors, recentActivity, activityHistory, actionablePrs, mergedPrsList] = await Promise.all([
    getCycleTimeMetrics(scope),
    getThroughputMetrics(scope),
    getStalePRs(scope),
    getOpenPRs(scope),
    getClosedPRs(scope),
    getActiveDevelopers(scope),
    getTopContributors(scope),
    getRecentActivity(scope),
    getActivityHistory(scope),
    getActionablePRs(scope),
    getMergedPRsList(scope),
  ]);

  return {
    cycleTime,
    throughput,
    stalePrs,
    openPrs,
    closedPrs,
    activeDevs,
    topContributors,
    recentActivity,
    activityHistory,
    actionablePrs,
    mergedPrsList,
  };
};

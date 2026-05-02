import { prisma } from "../prisma";
import { MetricsScope, TimeWindowDays } from "../types/metrics.types";

interface MetricValue {
  current: number;
  previous: number;
  change: number; // percentage change
}

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

export const getCycleTimeMetrics = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const now = new Date();
  const currentCutoff = scope.cutoffDate;
  const previousCutoff = new Date(currentCutoff.getTime() - (now.getTime() - currentCutoff.getTime()));

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
  const now = new Date();
  const currentCutoff = scope.cutoffDate;
  const previousCutoff = new Date(currentCutoff.getTime() - (now.getTime() - currentCutoff.getTime()));

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

export const getStalePRs = async (scope: MetricsScope, staleDays = 7) => {
  const baseWhere = buildWhereClause(scope);
  const now = new Date();
  const thresholdDate = new Date();
  thresholdDate.setDate(thresholdDate.getDate() - staleDays);

  const where = {
    ...baseWhere,
    state: "open",
    updatedAt: { lt: thresholdDate },
  };

  const currentCount = await prisma.pullRequest.count({ where });
  
  // For stale PRs, "previous" could be count at the cutoff point
  // But a simpler approach is comparing to window start
  const prevThreshold = new Date(scope.cutoffDate);
  prevThreshold.setDate(prevThreshold.getDate() - staleDays);
  
  const previousCount = await prisma.pullRequest.count({
    where: {
      ...baseWhere,
      state: "open",
      updatedAt: { lt: prevThreshold },
    }
  });

  return {
    count: currentCount,
    change: calculateChange(currentCount, previousCount),
  };
};

export const getActiveDevelopers = async (scope: MetricsScope) => {
  const baseWhere = buildWhereClause(scope);
  const now = new Date();
  const currentCutoff = scope.cutoffDate;
  const previousCutoff = new Date(currentCutoff.getTime() - (now.getTime() - currentCutoff.getTime()));

  const fetchDevCount = async (start: Date, end: Date) => {
    const devs = await prisma.pullRequest.groupBy({
      by: ['authorName'],
      where: {
        ...baseWhere,
        createdAt: { gte: start, lte: end },
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
      createdAt: { gte: scope.cutoffDate },
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

export const getHealthMetrics = async (scope: MetricsScope) => {
  const [cycleTime, throughput, stalePrs, activeDevs, topContributors, recentActivity] = await Promise.all([
    getCycleTimeMetrics(scope),
    getThroughputMetrics(scope),
    getStalePRs(scope),
    getActiveDevelopers(scope),
    getTopContributors(scope),
    getRecentActivity(scope),
  ]);

  return {
    cycleTime,
    throughput,
    stalePrs,
    activeDevs,
    topContributors,
    recentActivity,
  };
};


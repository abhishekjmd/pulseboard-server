import { Router, Request, Response, NextFunction } from "express";
import { protect, optionalProtect } from "../middlewares/auth.middleware";
import { getHealthMetrics, getCommitActivityMetrics } from "../services/metrics.service";
import { prisma } from "../prisma";
import { VALID_WINDOW_DAYS, TimeWindowDays, MetricsScope } from "../types/metrics.types";

const router = Router();

// Wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const getMetricsScope = (req: Request): { isOverall: boolean; windowDays?: TimeWindowDays; cutoffDate?: Date } => {
  const raw = req.query.window as string | undefined;
  if (!raw || raw === "overall") {
    return { isOverall: true };
  }

  const windowParam = parseInt(raw, 10);
  const windowDays = (VALID_WINDOW_DAYS.includes(windowParam as TimeWindowDays) ? windowParam : 7) as TimeWindowDays;
  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);

  return { isOverall: false, windowDays, cutoffDate };
};

const formatHealthData = (metrics: any, commitMetrics?: any) => ({
  metrics: {
    avgCycleTimeHours: metrics.cycleTime.averageHours,
    prThroughput: metrics.throughput.count,
    stalePrsCount: metrics.stalePrs.count,
    openPrsCount: metrics.openPrs.count,
    closedPrsCount: metrics.closedPrs.count,
    velocityIndex: metrics.activeDevs.count,
  },
  trends: {
    cycleTimeTrend: metrics.cycleTime.change,
    throughputTrend: metrics.throughput.change,
    staleTrend: metrics.stalePrs.change,
    velocityTrend: metrics.activeDevs.change,
  },
  activities: (metrics.recentActivity || []).map((pr: any) => {
    const isStale = pr.state === "open" && (new Date().getTime() - new Date(pr.updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000);
    let type = "PR_OPENED";
    if (pr.state === "merged") type = "PR_MERGED";
    else if (pr.state === "closed") type = "PR_CLOSED";
    else if (isStale) type = "PR_STALE";

    return {
      id: pr.id,
      type,
      title: pr.title || 'Untitled Pull Request',
      user: pr.authorName || 'Unknown',
      timestamp: pr.updatedAt || new Date().toISOString(),
      number: pr.number,
    };
  }),
  topContributors: metrics.topContributors,
  engineering: commitMetrics || null,
  activityHistory: metrics.activityHistory,
  actionablePrs: metrics.actionablePrs,
  mergedPrsList: metrics.mergedPrsList,
});

router.get(
  "/repos/:id/health",
  optionalProtect,
  asyncHandler(async (req, res) => {
    const repoId = parseInt(req.params.id as string, 10);
      const scopeInput = getMetricsScope(req);
      const scope: any = {};
      scope.repositoryId = repoId;

      if (scopeInput.isOverall) {
        // Determine earliest date available for this repository across PRs and commits
        const earliestPr = await prisma.pullRequest.findFirst({ where: { repositoryId: repoId, }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
        const earliestCommit = await prisma.commit.findFirst({ where: { repositoryId: repoId }, orderBy: { date: 'asc' }, select: { date: true } });
        let earliest: Date | null = null;
        if (earliestPr && earliestPr.createdAt) earliest = earliestPr.createdAt;
        if (earliestCommit && earliestCommit.date && (!earliest || earliestCommit.date < earliest)) earliest = earliestCommit.date;
        if (!earliest) earliest = new Date(0);
        const now = new Date();
        const diffDays = Math.max(0, Math.ceil((now.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)));
        scope.windowDays = diffDays;
        scope.cutoffDate = earliest;
      } else {
        scope.windowDays = scopeInput.windowDays;
        scope.cutoffDate = scopeInput.cutoffDate;
      }

    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found" });
    }

    // Authorization: Allow if user is authenticated OR if repo is in "Public Sandbox"
    const userId = req.user?.id;
    const isPublic = repo.workspace.name === "Public Sandbox";

    if (!isPublic && !userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    if (!isPublic && userId) {
      const membership = await prisma.membership.findUnique({
        where: {
          userId_workspaceId: {
            userId,
            workspaceId: repo.workspaceId,
          },
        },
      });
      if (!membership) {
        return res.status(403).json({ success: false, error: "Access denied" });
      }
    }

    const metrics = await getHealthMetrics(scope);

    // Only compute commit-based engineering metrics when there are commits
    // for this repository. This avoids returning an empty/undefined
    // engineering payload for overall windows when no commits exist.
    const commitCount = await prisma.commit.count({ where: { repositoryId: repoId } });
    let commitMetrics = null;
    if (commitCount > 0) {
      commitMetrics = await getCommitActivityMetrics(scope);
    }

    res.json({
      success: true,
      data: formatHealthData(metrics, commitMetrics),
    });
  })
);

router.get(
  "/workspaces/:id/health",
  protect,
  asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.id as string, 10);
      const scopeInput = getMetricsScope(req);
      const scope: any = {};
      scope.workspaceId = workspaceId;

      if (scopeInput.isOverall) {
        // Determine earliest date available for this workspace across PRs and commits
        const earliestPr = await prisma.pullRequest.findFirst({ where: { repository: { workspaceId } }, orderBy: { createdAt: 'asc' }, select: { createdAt: true } });
        const earliestCommit = await prisma.commit.findFirst({ where: { repository: { workspaceId } }, orderBy: { date: 'asc' }, select: { date: true } });
        let earliest: Date | null = null;
        if (earliestPr && earliestPr.createdAt) earliest = earliestPr.createdAt;
        if (earliestCommit && earliestCommit.date && (!earliest || earliestCommit.date < earliest)) earliest = earliestCommit.date;
        if (!earliest) earliest = new Date(0);
        const now = new Date();
        const diffDays = Math.max(0, Math.ceil((now.getTime() - earliest.getTime()) / (1000 * 60 * 60 * 24)));
        scope.windowDays = diffDays;
        scope.cutoffDate = earliest;
      } else {
        scope.windowDays = scopeInput.windowDays;
        scope.cutoffDate = scopeInput.cutoffDate;
      }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ success: false, error: "Workspace not found" });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId: req.user!.id,
          workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({ success: false, error: "Access denied" });
    }

    const metrics = await getHealthMetrics(scope);

    res.json({
      success: true,
      data: formatHealthData(metrics),
    });
  })
);

export default router;


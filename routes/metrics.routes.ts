import { Router, Request, Response, NextFunction } from "express";
import { protect, optionalProtect } from "../middlewares/auth.middleware";
import { getHealthMetrics } from "../services/metrics.service";
import { prisma } from "../prisma";
import { VALID_WINDOW_DAYS, TimeWindowDays, MetricsScope } from "../types/metrics.types";

const router = Router();

// Wrap async route handlers
const asyncHandler = (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) => 
  (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };

const getMetricsScope = (req: Request): MetricsScope => {
  const windowParam = parseInt(req.query.window as string, 10);
  const windowDays = (VALID_WINDOW_DAYS.includes(windowParam as TimeWindowDays) 
    ? windowParam 
    : 7) as TimeWindowDays;

  const cutoffDate = new Date();
  cutoffDate.setDate(cutoffDate.getDate() - windowDays);

  return {
    windowDays,
    cutoffDate,
  };
};

const formatHealthData = (metrics: any) => ({
  metrics: {
    avgCycleTimeHours: metrics.cycleTime.averageHours,
    prThroughput: metrics.throughput.count,
    stalePrsCount: metrics.stalePrs.count,
    openPrsCount: metrics.openPrs.count,
    velocityIndex: metrics.activeDevs.count,
  },
  trends: {
    cycleTimeTrend: metrics.cycleTime.change,
    throughputTrend: metrics.throughput.change,
    staleTrend: metrics.stalePrs.change,
    velocityTrend: metrics.activeDevs.change,
  },
    activities: (metrics.recentActivity || []).map((pr: any) => {
      const isStale = pr.state === "open" && 
        (new Date().getTime() - new Date(pr.updatedAt).getTime() > 7 * 24 * 60 * 60 * 1000);
      
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
    activityHistory: metrics.activityHistory,
});

router.get(
  "/repos/:id/health",
  optionalProtect,
  asyncHandler(async (req, res) => {
    const repoId = parseInt(req.params.id as string, 10);
    const scope = getMetricsScope(req);
    scope.repositoryId = repoId;

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

    res.json({
      success: true,
      data: formatHealthData(metrics),
    });
  })
);

router.get(
  "/workspaces/:id/health",
  protect,
  asyncHandler(async (req, res) => {
    const workspaceId = parseInt(req.params.id as string, 10);
    const scope = getMetricsScope(req);
    scope.workspaceId = workspaceId;

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return res.status(404).json({ success: false, error: "Workspace not found" });
    }

    const metrics = await getHealthMetrics(scope);

    res.json({
      success: true,
      data: formatHealthData(metrics),
    });
  })
);

export default router;


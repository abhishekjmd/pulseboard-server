import { Router, Request, Response, NextFunction } from "express";
import { protect } from "../middlewares/auth.middleware";
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
    velocityIndex: metrics.activeDevs.count,
  },
  trends: {
    cycleTimeTrend: metrics.cycleTime.change,
    throughputTrend: metrics.throughput.change,
    staleTrend: metrics.stalePrs.change,
    velocityTrend: metrics.activeDevs.change,
  },
  activities: metrics.recentActivity,
  topContributors: metrics.topContributors,
});

router.get(
  "/repos/:id/health",
  protect,
  asyncHandler(async (req, res) => {
    const repoId = parseInt(req.params.id as string, 10);
    const scope = getMetricsScope(req);
    scope.repositoryId = repoId;

    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
    });

    if (!repo) {
      return res.status(404).json({ success: false, error: "Repository not found" });
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


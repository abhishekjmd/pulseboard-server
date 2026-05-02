import { Request, Response } from "express";
import { syncRepoCommitsById } from "../../services/repo.service";
import { syncRepoPRsById } from "../../services/pr-sync.service";
import { prisma } from "../../prisma";


const getAuthorizedRepoForUser = async (userId: number, repoId: number) => {
  const repo = await prisma.repository.findUnique({
    where: { id: repoId },
  });
  if (!repo) {
    return { repo: null, isAuthorized: false };
  }

  const membership = await prisma.membership.findUnique({
    where: {
      userId_workspaceId: {
        userId,
        workspaceId: repo.workspaceId,
      },
    },
  });

  return { repo, isAuthorized: Boolean(membership) };
};

export const getRepoById = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (isPublic) {
      return res.status(200).json({ success: true, data: repo });
    }

    if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });

    const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
    if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });

    return res.status(200).json({ success: true, data: repo });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const connectRepo = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { workspaceId, owner, repo } = req.body;

    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    if (workspaceId === undefined || !owner || !repo) {
      return res.status(400).json({ success: false, message: "workspaceId, owner and repo are required" });
    }

    const numericWorkspaceId = Number(workspaceId);
    if (Number.isNaN(numericWorkspaceId)) {
      return res.status(400).json({ success: false, message: "workspaceId must be a valid number" });
    }

    const normalizedOwner = owner.trim();
    const normalizedRepo = repo.trim();

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: numericWorkspaceId,
        },
      },
    });

    if (!membership || membership.role !== "admin") {
      return res.status(403).json({ success: false, message: "only admins can connect repos" });
    }

    const existingRepo = await prisma.repository.findUnique({
      where: {
        owner_name_workspaceId: {
          workspaceId: numericWorkspaceId,
          owner: normalizedOwner,
          name: normalizedRepo,
        },
      },
    });

    if (existingRepo) {
      return res.status(400).json({ success: false, message: "Repository already connected" });
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${normalizedOwner}/${normalizedRepo}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
          "User-Agent": "pulseboard-app",
        },
      }
    );

    if (!githubResponse.ok) {
      return res.status(githubResponse.status).json({ success: false, message: "GitHub API error" });
    }

    const data = await githubResponse.json();

    const newRepo = await prisma.repository.create({
      data: {
        name: data.name,
        owner: data.owner.login,
        githubId: String(data.id),
        workspaceId: numericWorkspaceId,
      },
    });

    return res.status(201).json({ success: true, message: "Repository connected", repository: newRepo });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getRepoCommits = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (!isPublic) {
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
      if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const requestedLimit = Number(req.query.limit);
    const requestedPage = Number(req.query.page);
    const limit = Number.isInteger(requestedLimit) && requestedLimit > 0 ? Math.min(requestedLimit, 100) : 20;
    const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    const commits = await prisma.commit.findMany({
      where: { repositoryId: repo.id },
      orderBy: { date: "desc" },
      take: limit,
      skip: (page - 1) * limit,
    });

    return res.status(200).json({ success: true, page, limit, commits });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const syncCommits = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (!isPublic) {
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
      if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const count = await syncRepoCommitsById(repo.id);
    return res.status(200).json({ success: true, message: "Commits synced", count });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getRepoAnalytics = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (!isPublic) {
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
      if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) && requestedDays > 0 ? requestedDays : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);

    const analyticsWhere = { repositoryId: repo.id, date: { gte: since } };
    const totalCommits = await prisma.commit.count({ where: analyticsWhere });

    const contributorGroups = await prisma.commit.groupBy({
      by: ["authorName"],
      where: analyticsWhere,
      _count: { authorName: true },
      orderBy: { _count: { authorName: "desc" } },
      take: 5,
    });

    const topContributors = contributorGroups.map((group) => ({
      author: group.authorName,
      commits: group._count.authorName,
    }));

    return res.status(200).json({ success: true, data: { days, totalCommits, topContributors } });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getRepoContributors = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (!isPublic) {
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
      if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const groups = await prisma.commit.groupBy({
      by: ["authorName"],
      where: { repositoryId: repo.id },
      _count: { authorName: true },
      _max: { date: true },
      orderBy: { _count: { authorName: "desc" } },
      take: 5,
    });

    const contributors = groups.map((group) => ({
      author: group.authorName,
      commits: group._count.authorName,
      lastActive: group._max.date?.toLocaleDateString("en-CA") || null,
    }));

    return res.status(200).json({ success: true, contributors });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const syncPullRequests = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (!isPublic) {
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
      if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const count = await syncRepoPRsById(repo.id);
    return res.status(200).json({ success: true, message: "PRs synced", count });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

export const getRepoContributions = async (req: Request, res: Response) => {
  try {
    const repoId = Number(req.params.id);
    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
      include: { workspace: true },
    });

    if (!repo) return res.status(404).json({ success: false, message: "Repository not found" });

    const isPublic = repo.workspace.name === "Public Sandbox";
    const userId = req.user?.id;

    if (!isPublic) {
      if (!userId) return res.status(401).json({ success: false, message: "Unauthorized" });
      const { isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
      if (!isAuthorized) return res.status(403).json({ success: false, message: "Access denied" });
    }

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
    oneYearAgo.setHours(0, 0, 0, 0);

    // Pre-populate with 0s for all 365+ days to ensure full coverage
    const contributions: Record<string, number> = {};
    const iter = new Date(oneYearAgo);
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    while (iter <= today) {
      const dStr = iter.toISOString().split('T')[0];
      contributions[dStr] = 0;
      iter.setDate(iter.getDate() + 1);
    }

    const commits = await prisma.commit.findMany({
      where: {
        repositoryId: repo.id,
        date: { gte: oneYearAgo },
      },
      select: { date: true },
      orderBy: { date: 'asc' }
    });

    commits.forEach((commit) => {
      const dateStr = commit.date.toISOString().split('T')[0];
      if (contributions[dateStr] !== undefined) {
        contributions[dateStr]++;
      }
    });

    return res.status(200).json({ success: true, contributions });
  } catch (error) {
    return res.status(500).json({ success: false, message: "Internal server error" });
  }
};

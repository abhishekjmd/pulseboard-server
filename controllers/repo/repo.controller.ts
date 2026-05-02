import { Request, Response } from "express";
import { syncRepoCommitsById } from "../../services/repo.service";
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

export const connectRepo = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    const { workspaceId, owner, repo } = req.body;
    console.log("[connectRepo] request body:", req.body);

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (workspaceId === undefined || !owner || !repo) {
      return res.status(400).json({
        success: false,
        message: "workspaceId, owner and repo are required",
      });
    }

    const numericWorkspaceId = Number(workspaceId);
    console.log("[connectRepo] parsed workspaceId:", numericWorkspaceId);
    if (Number.isNaN(numericWorkspaceId)) {
      return res.status(400).json({
        success: false,
        message: "workspaceId must be a valid number",
      });
    }

    if (typeof owner !== "string" || typeof repo !== "string" || !owner.trim() || !repo.trim()) {
      return res.status(400).json({
        success: false,
        message: "owner and repo must be non-empty strings",
      });
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

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "user is not a member of the workspace",
      });
    }

    if (membership.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "only admins can connect repos to the workspace",
      });
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
      return res.status(400).json({
        success: false,
        message: "Repository already connected to this workspace",
      });
    }

    const githubUrl = `https://api.github.com/repos/${normalizedOwner}/${normalizedRepo}`;
    const githubResponse = await fetch(githubUrl, {
      headers: {
        "User-Agent": "Pulseboard",
        Accept: "application/vnd.github+json",
      },
    });
    console.log("[connectRepo] GitHub response status:", githubResponse.status);
    if (githubResponse.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    if (!githubResponse.ok) {
      const errorText = await githubResponse.text();
      console.error("[connectRepo] GitHub fetch failed", {
        status: githubResponse.status,
        body: errorText,
        url: githubUrl,
      });
      return res.status(500).json({
        success: false,
        message: "Failed to fetch repository from GitHub",
      });
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

    return res.status(201).json({
      message: "Repository connected successfully",
      repository: newRepo,
    });
  } catch (error) {
    console.error("Error connecting repository:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getRepoCommits = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const repoId = Number(req.params.id);
    if (Number.isNaN(repoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repository id",
      });
    }

    const { repo, isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const requestedLimit = Number(req.query.limit);
    const requestedPage = Number(req.query.page);
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 20;
    const page =
      Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

    const commits = await prisma.commit.findMany({
      where: { repositoryId: repo.id },
      orderBy: { date: "desc" },
      take: limit,
      skip: (page - 1) * limit,
      select: {
        message: true,
        authorName: true,
        date: true,
      },
    });

    return res.status(200).json({
      success: true,
      page,
      limit,
      commits: commits.map((commit) => ({
        message: commit.message,
        author: commit.authorName,
        date: commit.date,
      })),
    });
  } catch (error) {
    console.error("Error fetching repository commits:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const syncCommits = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const repoId = Number(req.params.id);
    if (Number.isNaN(repoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repository id",
      });
    }

    const { repo, isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const count = await syncRepoCommitsById(repo.id);

    return res.status(200).json({
      success: true,
      message: "Commits synced successfully",
      count,
    });
  } catch (error) {
    console.error("Error syncing repository commits:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getRepoAnalytics = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const repoId = Number(req.params.id);
    if (Number.isNaN(repoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repository id",
      });
    }

    const { repo, isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const requestedDays = Number(req.query.days);
    const days = Number.isInteger(requestedDays) && requestedDays > 0 ? requestedDays : 30;
    const since = new Date();
    since.setDate(since.getDate() - days);
    const analyticsWhere = {
      repositoryId: repo.id,
      date: { gte: since },
    };

    const totalCommits = await prisma.commit.count({
      where: analyticsWhere,
    });

    const contributorGroups = await prisma.commit.groupBy({
      by: ["authorName"],
      where: analyticsWhere,
      _count: {
        authorName: true,
      },
      orderBy: {
        _count: {
          authorName: "desc",
        },
      },
      take: 5,
    });

    const topContributors = contributorGroups.map((group) => ({
      author: group.authorName,
      commits: group._count.authorName,
    }));

    const commits = await prisma.commit.findMany({
      where: analyticsWhere,
      select: { date: true },
    });

    // Current approach groups in memory; for very large datasets we should move this to SQL aggregation.
    const commitsPerDayMap = commits.reduce<Record<string, number>>((acc, commit) => {
      const day = commit.date.toLocaleDateString("en-CA");
      acc[day] = (acc[day] ?? 0) + 1;
      return acc;
    }, {});

    const commitsPerDay = Object.entries(commitsPerDayMap)
      .map(([date, count]) => ({ date, commits: count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    return res.status(200).json({
      success: true,
      data: {
        days,
        totalCommits,
        topContributors,
        commitsPerDay,
      },
    });
  } catch (error) {
    console.error("Error getting repository analytics:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

export const getRepoContributors = async (req: Request, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const repoId = Number(req.params.id);
    if (Number.isNaN(repoId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid repository id",
      });
    }

    const { repo, isAuthorized } = await getAuthorizedRepoForUser(userId, repoId);
    if (!repo) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }
    if (!isAuthorized) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const requestedLimit = Number(req.query.limit);
    const limit =
      Number.isInteger(requestedLimit) && requestedLimit > 0
        ? Math.min(requestedLimit, 100)
        : 5;
    const sort = req.query.sort === "asc" ? "asc" : "desc";

    const groups = await prisma.commit.groupBy({
      by: ["authorName"],
      where: { repositoryId: repo.id },
      _count: { authorName: true },
      _max: { date: true },
      orderBy: {
        _count: {
          authorName: sort,
        },
      },
      take: limit,
    });

    const contributors = groups.map((group) => ({
      author: group.authorName,
      commits: group._count.authorName,
      lastActive: group._max.date ? group._max.date.toLocaleDateString("en-CA") : null,
    }));

    return res.status(200).json({
      success: true,
      limit,
      sort,
      contributors,
    });
  } catch (error) {
    console.error("Error getting repository contributors:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

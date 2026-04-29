import { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    if (!workspaceId || !owner || !repo) {
      return res.status(400).json({
        success: false,
        message: "workspaceId, owner and repo are required",
      });
    }

    const numericWorkspaceId = Number(workspaceId);
    if (Number.isNaN(numericWorkspaceId)) {
      return res.status(400).json({
        success: false,
        message: "workspaceId must be a valid number",
      });
    }

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
          owner,
          name: repo,
        },
      },
    });

    if (existingRepo) {
      return res.status(400).json({
        success: false,
        message: "Repository already connected to this workspace",
      });
    }

    const githubResponse = await fetch(`https://api.github.com/repos/${owner}/${repo}`);
    if (githubResponse.status === 404) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    if (!githubResponse.ok) {
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

    const commits = await prisma.commit.findMany({
      where: { repositoryId: repo.id },
      orderBy: { date: "desc" },
      take: 20,
      select: {
        message: true,
        authorName: true,
        date: true,
      },
    });

    return res.status(200).json({
      success: true,
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

    const githubResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?per_page=50`,
    );
    if (!githubResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch commits from GitHub",
      });
    }

    const githubCommits = await githubResponse.json();
    if (!Array.isArray(githubCommits)) {
      return res.status(500).json({
        success: false,
        message: "Invalid commit payload from GitHub",
      });
    }

    const mappedCommits = githubCommits
      .map((commit) => {
        const sha = commit?.sha;
        const message = commit?.commit?.message;
        const authorName = commit?.commit?.author?.name;
        const authorEmail = commit?.commit?.author?.email;
        const authorDate = commit?.commit?.author?.date;

        if (!sha || !message || !authorName || !authorEmail || !authorDate) {
          return null;
        }

        return {
          sha,
          message,
          authorName,
          authorEmail,
          date: new Date(authorDate),
          repositoryId: repo.id,
        };
      })
      .filter((commit): commit is NonNullable<typeof commit> => commit !== null);

    const result = await prisma.commit.createMany({
      data: mappedCommits,
      skipDuplicates: true,
    });

    return res.status(200).json({
      success: true,
      message: "Commits synced successfully",
      count: result.count,
    });
  } catch (error) {
    console.error("Error syncing repository commits:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

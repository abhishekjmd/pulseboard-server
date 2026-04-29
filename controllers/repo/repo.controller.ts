import { Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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

    const repo = await prisma.repository.findUnique({
      where: { id: repoId },
    });

    if (!repo) {
      return res.status(404).json({
        success: false,
        message: "Repository not found",
      });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId: repo.workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const githubResponse = await fetch(
      `https://api.github.com/repos/${repo.owner}/${repo.name}/commits?per_page=10`,
    );

    if (!githubResponse.ok) {
      return res.status(500).json({
        success: false,
        message: "Failed to fetch commits from GitHub",
      });
    }

    const data = await githubResponse.json();
    const commits = Array.isArray(data)
      ? data.map((commit) => ({
          message: commit?.commit?.message ?? null,
          author: commit?.commit?.author?.name ?? null,
          date: commit?.commit?.author?.date ?? null,
        }))
      : [];

    return res.status(200).json({
      success: true,
      commits,
    });
  } catch (error) {
    console.error("Error fetching repository commits:", error);
    return res.status(500).json({
      success: false,
      message: "Internal server error",
    });
  }
};

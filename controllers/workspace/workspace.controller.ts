import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { prisma } from "../../prisma";


export const createWorkspace = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { name } = req.body;
    const userId = req.user?.id;
    if (!userId)
      return res.status(401).json({ success: false, message: "Unauthorized" });
    if (typeof name !== "string" || !name.trim()) {
      return res.status(400).json({
        success: false,
        message: "Workspace name is required",
      });
    }
    const workspace = await prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({ data: { name: name.trim() } });
      const membership = await tx.membership.create({
        data: {
          userId,
          workspaceId: newWorkspace.id,
          role: "admin",
        },
      });
      return newWorkspace;
    });
    res.status(201).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaces = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "user not authenticated",
      });
    }

    const workspaces = await prisma.workspace.findMany({
      where: {
        memberships: {
          some: { userId },
        },
      },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } },
        },
      },
    });
    res.status(200).json({
      success: true,
      data: workspaces,
    });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaceById = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        sucess: false,
        message: "user not authenticated",
      });
    }

    const workspaceId = Number(req.params.id);
    const membership = await prisma.membership.findFirst({
      where: { userId, workspaceId },
    });
    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }
    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: {
        id: true,
        name: true,
        createdAt: true,
        memberships: {
          select: {
            id: true,
            role: true,
            user: { select: { id: true, name: true, email: true } },
          },
        },
      },
    });
    return res.status(200).json({
      success: true,
      data: workspace,
    });
  } catch (error) {
    next(error);
  }
};

export const inviteUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    const workspaceId = Number(req.params.id);
    const { email, role } = req.body;

    const membership = await prisma.membership.findFirst({
      where: { userId, workspaceId },
    });
    if (!membership || membership.role !== "admin") {
      return res.status(403).json({
        success: false,
        message: "Only admins can invite users",
      });
    }
    const userToInvite = await prisma.user.findUnique({ where: { email } });
    if (!userToInvite) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    const existingMembership = await prisma.membership.findFirst({
      where: { userId: userToInvite.id, workspaceId },
    });
    if (existingMembership) {
      return res.status(400).json({
        success: false,
        message: "User is already a member of this workspace",
      });
    }
    await prisma.membership.create({
      data: {
        userId: userToInvite.id,
        workspaceId,
        role: "member",
      },
    });
    res.status(200).json({
      success: true,
      message: "User invited successfully",
    });
  } catch (error) {
    next(error);
  }
};

export const getWorkspaceRepos = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({
        success: false,
        message: "Unauthorized",
      });
    }

    const workspaceId = Number(req.params.id);
    if (Number.isNaN(workspaceId)) {
      return res.status(400).json({
        success: false,
        message: "Invalid workspace id",
      });
    }

    const workspace = await prisma.workspace.findUnique({
      where: { id: workspaceId },
      select: { id: true },
    });

    if (!workspace) {
      return res.status(404).json({
        success: false,
        message: "Workspace not found",
      });
    }

    const membership = await prisma.membership.findUnique({
      where: {
        userId_workspaceId: {
          userId,
          workspaceId,
        },
      },
    });

    if (!membership) {
      return res.status(403).json({
        success: false,
        message: "Access denied",
      });
    }

    const reposWithDetails = await prisma.repository.findMany({
      where: { workspaceId },
      include: {
        _count: {
          select: {
            commits: true,
            pullRequests: true,
          },
        },
        pullRequests: {
          select: {
            id: true,
            state: true,
            createdAt: true,
          },
        },
        commits: {
          select: {
            authorName: true,
            date: true,
          },
        },
      },
    });

    const now = Date.now();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;

    const repos = reposWithDetails.map((repo) => {
      const commitCount = repo._count.commits;
      const prCount = repo._count.pullRequests;
      const uniqueAuthors = new Set(repo.commits.map((c) => c.authorName.toLowerCase())).size;
      const stalePrCount = repo.pullRequests.filter(
        (pr) => pr.state === "open" && now - new Date(pr.createdAt).getTime() > sevenDaysMs
      ).length;

      const lastCommitTime = repo.commits.length
        ? Math.max(...repo.commits.map((c) => new Date(c.date).getTime()))
        : null;
      const lastPrTime = repo.lastPrSyncAt ? new Date(repo.lastPrSyncAt).getTime() : null;
      const lastUpdatedMs = Math.max(lastCommitTime || 0, lastPrTime || 0);
      const updatedAt = lastUpdatedMs > 0 ? new Date(lastUpdatedMs).toISOString() : null;

      return {
        id: repo.id,
        name: repo.name,
        owner: repo.owner,
        lastPrSyncAt: repo.lastPrSyncAt ? repo.lastPrSyncAt.toISOString() : null,
        updatedAt,
        commitCount,
        contributorCount: uniqueAuthors,
        prCount,
        stalePrCount,
      };
    });

    return res.status(200).json({
      success: true,
      repos,
    });
  } catch (error) {
    next(error);
  }
};

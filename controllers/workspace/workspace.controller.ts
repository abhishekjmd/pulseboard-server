import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import { PrismaPg } from "@prisma/adapter-pg";
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

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
    const workspace = await prisma.$transaction(async (tx) => {
      const newWorkspace = await tx.workspace.create({ data: { name } });
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
      data: workspace
    });
  } catch (error) {
    next(error);
  }
};

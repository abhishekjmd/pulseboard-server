import { PrismaPg } from "@prisma/adapter-pg";
import { NextFunction, Request, Response } from "express";
import { PrismaClient } from "../../generated/prisma";
import brcypt from "bcrypt";
import jwt from "jsonwebtoken";

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.params;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      res.status(400).json({
        success: false,
        message: "user not found with this email",
      });
    }
    const isPasswordValid = await brcypt.compare(password, user.password);
    if (!isPasswordValid) {
      res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET, {
      expiresIn: "7d",
    });
    res.status(200).json({
      success: true,
      token,
    });
  } catch (error) {
    next(error);
  }
};

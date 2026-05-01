import { NextFunction, Request, Response } from "express";
import brcypt from "bcrypt";
import jwt from "jsonwebtoken";
import { prisma } from "../../prisma";



export const login = async (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "user not found with this email",
      });
    }
    const isPasswordValid = await brcypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({
        success: false,
        message: "Invalid password",
      });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({
        success: false,
        message: "JWT secret is not configured",
      });
    }

    const token = jwt.sign({ id: user.id }, jwtSecret, {
      expiresIn: "7d",
    });
    return res.status(200).json({
      success: true,
      token,
    });
  } catch (error) {
    next(error);
  }
};

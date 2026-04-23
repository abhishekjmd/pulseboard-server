import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";

export const protect = (req: Request, res: Response, next: NextFunction) => {
  try {
    let token;
    if (req.headers.authorization.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Not authorized, no token",
      });
    }
    const decodes = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decodes;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "not authorized, token failed",
    });
  }
};

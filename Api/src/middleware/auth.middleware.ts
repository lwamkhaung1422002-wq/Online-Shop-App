import type { NextFunction, Request, Response } from "express";

import { verifyAccessToken } from "../lib/jwt.js";

export type AuthUser = {
  id: string;
  email: string;
};

export type AuthenticatedRequest = Request & {
  user: AuthUser;
};

export function getAuthUser(request: Request): AuthUser {
  return (request as AuthenticatedRequest).user;
}

export function requireAuth(
  request: Request,
  response: Response,
  next: NextFunction,
): void {
  const header = request.headers.authorization;
  const token = header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null;

  if (!token) {
    response.status(401).json({ message: "Authentication token is required." });
    return;
  }

  try {
    const payload = verifyAccessToken(token);
    (request as AuthenticatedRequest).user = {
      id: payload.userId,
      email: payload.email,
    };
    next();
  } catch {
    response.status(401).json({ message: "Invalid or expired authentication token." });
  }
}

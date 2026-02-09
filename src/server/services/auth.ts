import { Request, Response, NextFunction } from "express";
import cookie from "cookie";
import { sessionCookieName, verifySessionToken } from "./session.js";

export const getSessionToken = (req: Request) => {
  const header = req.headers.cookie;
  if (!header) return null;
  const parsed = cookie.parse(header);
  return parsed[sessionCookieName] ?? null;
};

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  const token = getSessionToken(req);
  const verified = verifySessionToken(token);
  if (!verified.valid) {
    res.status(401).json({ error: "unauthorized", loginUrl: "/" });
    return;
  }
  next();
};

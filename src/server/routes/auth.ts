import { Router } from "express";
import { config } from "../config";
import { createSessionToken, sessionCookieName, sessionTtlMs } from "../services/session";
import { z } from "zod";

const router = Router();

router.post("/login", (req, res) => {
  const schema = z.object({ password: z.string() });
  const result = schema.safeParse(req.body);
  if (!result.success) {
    res.status(400).json({ error: "invalid_payload" });
    return;
  }
  if (result.data.password !== config.ACCESS_PASSWORD) {
    res.status(401).json({ error: "invalid_password" });
    return;
  }
  const { token } = createSessionToken();
  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: config.NODE_ENV === "production",
    maxAge: sessionTtlMs
  });
  res.json({ ok: true });
});

router.post("/logout", (_req, res) => {
  res.clearCookie(sessionCookieName);
  res.json({ ok: true });
});

export default router;

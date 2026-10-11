import { verifyToken, SESSION_COOKIE } from "../utils/token.js";

export function requireOrganizer(req, res, next) {
  const token = req.cookies?.[SESSION_COOKIE];

  if (!token) {
    return res
      .status(401)
      .json({ error: { code: "UNAUTHENTICATED", message: "Log in to continue." } });
  }

  try {
    const payload = verifyToken(token);
    req.organizer = payload; // { organizerId, email, name }
    next();
  } catch {
    return res
      .status(401)
      .json({ error: { code: "INVALID_SESSION", message: "Your session has expired. Log in again." } });
  }
}

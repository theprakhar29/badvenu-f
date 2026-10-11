import bcrypt from "bcryptjs";
import Organizer from "../models/Organizer.js";
import { signupSchema, loginSchema } from "../utils/validation.js";
import { signOrganizerToken, SESSION_COOKIE, cookieOptions } from "../utils/token.js";
import { logger } from "../utils/logger.js";

export async function signup(req, res, next) {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
      });
    }
    const { name, email, password } = parsed.data;

    const existing = await Organizer.findOne({ email });
    if (existing) {
      logger.auth(`Signup rejected — email already registered: ${email}`);
      return res.status(409).json({
        error: { code: "EMAIL_TAKEN", message: "An account with this email already exists." },
      });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const organizer = await Organizer.create({ name, email, passwordHash });

    const token = signOrganizerToken(organizer);
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    logger.auth(`New organizer signed up: ${email} (${organizer._id})`);
    res.status(201).json(organizer);
  } catch (err) {
    next(err);
  }
}

export async function login(req, res, next) {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { code: "VALIDATION_ERROR", message: parsed.error.issues[0].message },
      });
    }
    const { email, password } = parsed.data;

    const organizer = await Organizer.findOne({ email });
    if (!organizer) {
      logger.auth(`Login failed — no account for: ${email}`);
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." },
      });
    }

    const valid = await bcrypt.compare(password, organizer.passwordHash);
    if (!valid) {
      logger.auth(`Login failed — wrong password: ${email}`);
      return res.status(401).json({
        error: { code: "INVALID_CREDENTIALS", message: "Incorrect email or password." },
      });
    }

    const token = signOrganizerToken(organizer);
    res.cookie(SESSION_COOKIE, token, cookieOptions);
    logger.auth(`Organizer logged in: ${email} (${organizer._id})`);
    res.json(organizer);
  } catch (err) {
    next(err);
  }
}

export function logout(req, res) {
  res.clearCookie(SESSION_COOKIE, { path: "/" });
  logger.auth("Organizer logged out");
  res.json({ success: true });
}

export async function me(req, res, next) {
  try {
    const organizer = await Organizer.findById(req.organizer.organizerId);
    if (!organizer) {
      return res.status(401).json({ error: { code: "UNAUTHENTICATED", message: "Log in to continue." } });
    }
    res.json(organizer);
  } catch (err) {
    next(err);
  }
}

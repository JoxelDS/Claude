import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "node:crypto";
import config from "../config/index.js";

// ── Password hashing (bcrypt) ─────────────────────────────────────
export async function hashPassword(plain) {
  return bcrypt.hash(plain, config.bcryptRounds);
}

export async function verifyPassword(plain, hash) {
  return bcrypt.compare(plain, hash);
}

// ── JWT tokens ────────────────────────────────────────────────────
export function signAccessToken(payload) {
  return jwt.sign(payload, config.jwt.accessSecret, {
    expiresIn: config.jwt.accessExpiresIn,
    algorithm: "HS256",
  });
}

export function signRefreshToken(payload) {
  return jwt.sign(payload, config.jwt.refreshSecret, {
    expiresIn: config.jwt.refreshExpiresIn,
    algorithm: "HS256",
  });
}

export function verifyAccessToken(token) {
  return jwt.verify(token, config.jwt.accessSecret, {
    algorithms: ["HS256"],
  });
}

export function verifyRefreshToken(token) {
  return jwt.verify(token, config.jwt.refreshSecret, {
    algorithms: ["HS256"],
  });
}

// ── Misc ──────────────────────────────────────────────────────────
export function generateId() {
  return randomBytes(16).toString("hex");
}

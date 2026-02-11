import { Router } from "express";
import { body } from "express-validator";
import { handleValidationErrors } from "../middleware/validate.js";
import { authLimiter } from "../middleware/security.js";
import { authenticate } from "../middleware/auth.js";
import {
  hashPassword,
  verifyPassword,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
  generateId,
} from "../utils/crypto.js";
import { getDb } from "../utils/firestore.js";
import config from "../config/index.js";

const router = Router();

// ── POST /api/auth/register ──────────────────────────────────────
// Register a new inspector (requires admin approval before access).
router.post(
  "/register",
  authLimiter,
  [
    body("badge")
      .isString()
      .trim()
      .isLength({ min: 4, max: 20 })
      .withMessage("Badge must be 4-20 characters."),
    body("name")
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Name must be 2-100 characters.")
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage("Name contains invalid characters."),
    body("department")
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Department must be 2-100 characters."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { badge, name, department } = req.body;
      const db = await getDb();
      const usersCol = db.collection("users");

      // Hash badge for storage (never store plain text)
      const badgeHash = await hashPassword(badge);
      const id = generateId();

      // Check if user already exists by name (simple duplicate check)
      const existing = await usersCol.where("name", "==", name).get();
      if (!existing.empty) {
        return res.status(409).json({ error: "A user with this name already exists." });
      }

      await usersCol.doc(id).set({
        badgeHash,
        name,
        department,
        role: "inspector",
        approved: false,
        registeredAt: new Date().toISOString(),
      });

      res.status(201).json({
        message: "Registration submitted. An admin must approve your access.",
      });
    } catch (err) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Registration failed." });
    }
  }
);

// ── POST /api/auth/login ─────────────────────────────────────────
// Authenticate with badge — returns access + refresh tokens.
router.post(
  "/login",
  authLimiter,
  [
    body("badge")
      .isString()
      .trim()
      .isLength({ min: 4, max: 20 })
      .withMessage("Badge must be 4-20 characters."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { badge } = req.body;
      const db = await getDb();
      const snapshot = await db.collection("users").get();

      let matchedUser = null;
      let matchedId = null;

      for (const doc of snapshot.docs) {
        const user = doc.data();
        const match = await verifyPassword(badge, user.badgeHash);
        if (match) {
          matchedUser = user;
          matchedId = doc.id;
          break;
        }
      }

      if (!matchedUser) {
        // Intentionally vague — don't reveal if badge exists
        return res.status(401).json({ error: "Invalid credentials." });
      }

      if (!matchedUser.approved) {
        return res.status(403).json({ error: "Account pending admin approval." });
      }

      // Generate tokens
      const tokenPayload = {
        sub: matchedId,
        badgeHash: matchedUser.badgeHash,
        name: matchedUser.name,
        role: matchedUser.role,
      };

      const accessToken = signAccessToken(tokenPayload);
      const refreshToken = signRefreshToken({ sub: matchedId });

      // Send refresh token as httpOnly cookie (not accessible to JS)
      res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: config.nodeEnv === "production",
        sameSite: "strict",
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: "/api/auth/refresh",
      });

      res.json({
        accessToken,
        user: {
          id: matchedId,
          name: matchedUser.name,
          role: matchedUser.role,
          department: matchedUser.department,
        },
      });
    } catch (err) {
      console.error("Login error:", err);
      res.status(500).json({ error: "Login failed." });
    }
  }
);

// ── POST /api/auth/refresh ───────────────────────────────────────
// Issue a new access token using the refresh token cookie.
router.post("/refresh", async (req, res) => {
  try {
    const token = req.cookies?.refreshToken;
    if (!token) {
      return res.status(401).json({ error: "No refresh token provided." });
    }

    const payload = verifyRefreshToken(token);
    const db = await getDb();
    const userDoc = await db.collection("users").doc(payload.sub).get();

    if (!userDoc.exists) {
      return res.status(401).json({ error: "User no longer exists." });
    }

    const user = userDoc.data();
    if (!user.approved) {
      return res.status(403).json({ error: "Account has been deactivated." });
    }

    const accessToken = signAccessToken({
      sub: payload.sub,
      badgeHash: user.badgeHash,
      name: user.name,
      role: user.role,
    });

    res.json({ accessToken });
  } catch (err) {
    // Clear invalid refresh cookie
    res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
    return res.status(401).json({ error: "Invalid refresh token." });
  }
});

// ── POST /api/auth/logout ────────────────────────────────────────
// Clear the refresh token cookie.
router.post("/logout", authenticate, (_req, res) => {
  res.clearCookie("refreshToken", { path: "/api/auth/refresh" });
  res.json({ message: "Logged out." });
});

// ── GET /api/auth/me ─────────────────────────────────────────────
// Return the current authenticated user's profile.
router.get("/me", authenticate, async (req, res) => {
  try {
    const db = await getDb();
    const doc = await db.collection("users").doc(req.user.id).get();
    if (!doc.exists) {
      return res.status(404).json({ error: "User not found." });
    }
    const user = doc.data();
    res.json({
      id: req.user.id,
      name: user.name,
      role: user.role,
      department: user.department,
    });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

export default router;

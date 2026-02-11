import { Router } from "express";
import { body, param } from "express-validator";
import { handleValidationErrors } from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { hashPassword, generateId } from "../utils/crypto.js";
import { getDb } from "../utils/firestore.js";

const router = Router();

// All admin routes require authentication + admin role
router.use(authenticate);
router.use(authorize("admin"));

// ── GET /api/admin/users ─────────────────────────────────────────
// List all users (admins, inspectors, pending).
router.get("/users", async (_req, res) => {
  try {
    const db = await getDb();
    const snapshot = await db.collection("users").get();

    const users = snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: data.name,
        department: data.department,
        role: data.role,
        approved: data.approved,
        registeredAt: data.registeredAt,
      };
      // Note: badgeHash is intentionally excluded from response
    });

    res.json({ users });
  } catch (err) {
    console.error("List users error:", err);
    res.status(500).json({ error: "Failed to fetch users." });
  }
});

// ── GET /api/admin/users/pending ─────────────────────────────────
// List only users awaiting approval.
router.get("/users/pending", async (_req, res) => {
  try {
    const db = await getDb();
    const snapshot = await db.collection("users").where("approved", "==", false).get();

    const pending = snapshot.docs.map((doc) => ({
      id: doc.id,
      name: doc.data().name,
      department: doc.data().department,
      registeredAt: doc.data().registeredAt,
    }));

    res.json({ pending, count: pending.length });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch pending users." });
  }
});

// ── POST /api/admin/users/:id/approve ────────────────────────────
// Approve a pending user's registration.
router.post(
  "/users/:id/approve",
  [param("id").isString().trim().isLength({ min: 1, max: 64 })],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      const docRef = db.collection("users").doc(req.params.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found." });
      }

      if (doc.data().approved) {
        return res.status(400).json({ error: "User is already approved." });
      }

      await docRef.update({
        approved: true,
        approvedBy: req.user.id,
        approvedAt: new Date().toISOString(),
      });

      res.json({ message: `${doc.data().name} has been approved.` });
    } catch (err) {
      console.error("Approve error:", err);
      res.status(500).json({ error: "Failed to approve user." });
    }
  }
);

// ── POST /api/admin/users/:id/deny ───────────────────────────────
// Deny and remove a pending user's registration.
router.post(
  "/users/:id/deny",
  [param("id").isString().trim().isLength({ min: 1, max: 64 })],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      const docRef = db.collection("users").doc(req.params.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found." });
      }

      await docRef.delete();

      res.json({ message: "User registration denied and removed." });
    } catch (err) {
      res.status(500).json({ error: "Failed to deny user." });
    }
  }
);

// ── PATCH /api/admin/users/:id/role ──────────────────────────────
// Change a user's role (promote/demote).
router.patch(
  "/users/:id/role",
  [
    param("id").isString().trim().isLength({ min: 1, max: 64 }),
    body("role")
      .isString()
      .isIn(["inspector", "admin"])
      .withMessage("Role must be 'inspector' or 'admin'."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      const docRef = db.collection("users").doc(req.params.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found." });
      }

      // Prevent admins from demoting themselves
      if (req.params.id === req.user.id && req.body.role !== "admin") {
        return res.status(400).json({ error: "You cannot demote yourself." });
      }

      await docRef.update({ role: req.body.role });

      const action = req.body.role === "admin" ? "promoted to admin" : "demoted to inspector";
      res.json({ message: `${doc.data().name} ${action}.` });
    } catch (err) {
      res.status(500).json({ error: "Failed to change role." });
    }
  }
);

// ── DELETE /api/admin/users/:id ──────────────────────────────────
// Remove a user entirely.
router.delete(
  "/users/:id",
  [param("id").isString().trim().isLength({ min: 1, max: 64 })],
  handleValidationErrors,
  async (req, res) => {
    try {
      // Prevent self-deletion
      if (req.params.id === req.user.id) {
        return res.status(400).json({ error: "You cannot delete your own account." });
      }

      const db = await getDb();
      const docRef = db.collection("users").doc(req.params.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "User not found." });
      }

      await docRef.delete();

      res.json({ message: `${doc.data().name} has been removed.` });
    } catch (err) {
      res.status(500).json({ error: "Failed to remove user." });
    }
  }
);

// ── POST /api/admin/users ────────────────────────────────────────
// Directly add a new user (pre-approved).
router.post(
  "/users",
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
      .withMessage("Name is required.")
      .matches(/^[a-zA-Z\s'-]+$/)
      .withMessage("Name contains invalid characters."),
    body("department")
      .isString()
      .trim()
      .isLength({ min: 2, max: 100 })
      .withMessage("Department is required."),
    body("role")
      .isString()
      .isIn(["inspector", "admin"])
      .withMessage("Role must be 'inspector' or 'admin'."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const { badge, name, department, role } = req.body;
      const db = await getDb();

      const id = generateId();
      const badgeHash = await hashPassword(badge);

      await db.collection("users").doc(id).set({
        badgeHash,
        name,
        department,
        role,
        approved: true,
        registeredAt: new Date().toISOString(),
        addedBy: req.user.id,
      });

      res.status(201).json({
        message: `${name} added as ${role}.`,
        user: { id, name, department, role },
      });
    } catch (err) {
      console.error("Add user error:", err);
      res.status(500).json({ error: "Failed to add user." });
    }
  }
);

export default router;

import { Router } from "express";
import { body, param, query } from "express-validator";
import { handleValidationErrors } from "../middleware/validate.js";
import { authenticate, authorize } from "../middleware/auth.js";
import { generateId } from "../utils/crypto.js";
import { getDb } from "../utils/firestore.js";

const router = Router();

// All report routes require authentication
router.use(authenticate);

// ── POST /api/reports ────────────────────────────────────────────
// Create a new inspection report. (inspector or admin)
router.post(
  "/",
  authorize("inspector", "admin"),
  [
    body("inspectionType")
      .isString()
      .trim()
      .isIn(["Event Day", "Post Event", "Regular Inspection"])
      .withMessage("Invalid inspection type."),
    body("inspectionDate")
      .isISO8601()
      .withMessage("Date must be in ISO 8601 format."),
    body("siteName")
      .isString()
      .trim()
      .isLength({ min: 1, max: 200 })
      .withMessage("Site name is required (max 200 chars)."),
    body("siteNumber")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 }),
    body("floor")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 50 }),
    body("locationType")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 }),
    body("inspectorName")
      .isString()
      .trim()
      .isLength({ min: 1, max: 100 })
      .withMessage("Inspector name is required."),
    body("supervisorName")
      .optional()
      .isString()
      .trim()
      .isLength({ max: 100 }),
    body("facility")
      .optional()
      .isObject(),
    body("operations")
      .optional()
      .isObject(),
    body("equipment")
      .optional()
      .isObject(),
    body("actionItems")
      .optional()
      .isArray(),
    body("notes")
      .optional()
      .isString()
      .isLength({ max: 10000 })
      .withMessage("Notes cannot exceed 10,000 characters."),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const id = generateId();
      const db = await getDb();

      const report = {
        ...req.body,
        id,
        createdBy: req.user.id,
        createdByName: req.user.name,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await db.collection("inspections").doc(id).set(report);

      res.status(201).json({ message: "Report created.", report });
    } catch (err) {
      console.error("Create report error:", err);
      res.status(500).json({ error: "Failed to create report." });
    }
  }
);

// ── GET /api/reports ─────────────────────────────────────────────
// List reports. All authenticated users see all reports.
router.get(
  "/",
  [
    query("type").optional().isString().trim(),
    query("limit").optional().isInt({ min: 1, max: 100 }).toInt(),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      let ref = db.collection("inspections");

      const snapshot = await ref.get();
      let reports = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));

      // Optional type filter
      if (req.query.type) {
        reports = reports.filter((r) => r.inspectionType === req.query.type);
      }

      // Sort by date descending
      reports.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

      // Apply limit
      const limit = req.query.limit || 50;
      reports = reports.slice(0, limit);

      res.json({ reports, total: reports.length });
    } catch (err) {
      console.error("List reports error:", err);
      res.status(500).json({ error: "Failed to fetch reports." });
    }
  }
);

// ── GET /api/reports/:id ─────────────────────────────────────────
// Get a single report by ID.
router.get(
  "/:id",
  [param("id").isString().trim().isLength({ min: 1, max: 64 })],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      const doc = await db.collection("inspections").doc(req.params.id).get();

      if (!doc.exists) {
        return res.status(404).json({ error: "Report not found." });
      }

      const report = doc.data();

      res.json({ report: { id: doc.id, ...report } });
    } catch (err) {
      console.error("Get report error:", err);
      res.status(500).json({ error: "Failed to fetch report." });
    }
  }
);

// ── PUT /api/reports/:id ─────────────────────────────────────────
// Update a report. Inspectors can only update their own.
router.put(
  "/:id",
  [
    param("id").isString().trim().isLength({ min: 1, max: 64 }),
    body("inspectionType")
      .optional()
      .isString()
      .isIn(["Event Day", "Post Event", "Regular Inspection"]),
    body("notes")
      .optional()
      .isString()
      .isLength({ max: 10000 }),
  ],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      const docRef = db.collection("inspections").doc(req.params.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "Report not found." });
      }

      const report = doc.data();

      // Inspectors can only update their own reports
      if (req.user.role === "inspector" && report.createdBy !== req.user.id) {
        return res.status(403).json({ error: "Access denied." });
      }

      // Prevent overwriting protected fields
      const { id, createdBy, createdByName, createdAt, ...updates } = req.body;
      updates.updatedAt = new Date().toISOString();

      await docRef.update(updates);

      res.json({ message: "Report updated." });
    } catch (err) {
      console.error("Update report error:", err);
      res.status(500).json({ error: "Failed to update report." });
    }
  }
);

// ── DELETE /api/reports/:id ──────────────────────────────────────
// Delete a report. Only admins or the report creator.
router.delete(
  "/:id",
  [param("id").isString().trim().isLength({ min: 1, max: 64 })],
  handleValidationErrors,
  async (req, res) => {
    try {
      const db = await getDb();
      const docRef = db.collection("inspections").doc(req.params.id);
      const doc = await docRef.get();

      if (!doc.exists) {
        return res.status(404).json({ error: "Report not found." });
      }

      const report = doc.data();

      if (req.user.role !== "admin" && report.createdBy !== req.user.id) {
        return res.status(403).json({ error: "Only admins or the creator can delete." });
      }

      await docRef.delete();

      res.json({ message: "Report deleted." });
    } catch (err) {
      console.error("Delete report error:", err);
      res.status(500).json({ error: "Failed to delete report." });
    }
  }
);

export default router;

import { validationResult } from "express-validator";

// ── Validation error handler ─────────────────────────────────────
// Call after express-validator check chains to return errors.
export function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: "Validation failed.",
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  next();
}

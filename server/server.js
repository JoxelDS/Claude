import express from "express";
import cookieParser from "cookie-parser";
import config from "./config/index.js";
import {
  helmetMiddleware,
  corsMiddleware,
  globalLimiter,
  hppMiddleware,
  sanitizeInput,
} from "./middleware/security.js";
import authRoutes from "./routes/auth.js";
import reportRoutes from "./routes/reports.js";
import adminRoutes from "./routes/admin.js";
import { getDb } from "./utils/firestore.js";
import { hashPassword, generateId } from "./utils/crypto.js";

const app = express();

// ─────────────────────────────────────────────────────────────────
// 1. SECURITY MIDDLEWARE (applied to every request)
// ─────────────────────────────────────────────────────────────────
app.use(helmetMiddleware);          // Security HTTP headers (CSP, HSTS, etc.)
app.use(corsMiddleware);            // Cross-Origin Resource Sharing
app.use(globalLimiter);             // Rate limiting (100 req / 15 min)
app.use(hppMiddleware);             // HTTP parameter pollution protection
app.use(express.json({ limit: "1mb" }));  // Body parser with size limit
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());            // Parse cookies (for refresh tokens)
app.use(sanitizeInput);             // Strip NoSQL injection operators

// Disable x-powered-by (extra safety, helmet also does this)
app.disable("x-powered-by");

// ─────────────────────────────────────────────────────────────────
// 2. API ROUTES
// ─────────────────────────────────────────────────────────────────
app.use("/api/auth", authRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/admin", adminRoutes);

// ── Health check ─────────────────────────────────────────────────
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// ─────────────────────────────────────────────────────────────────
// 3. ERROR HANDLING
// ─────────────────────────────────────────────────────────────────

// 404 — unknown routes
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint not found." });
});

// Global error handler — never leaks stack traces to clients
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err);
  res.status(500).json({ error: "Internal server error." });
});

// ─────────────────────────────────────────────────────────────────
// 4. SEED ADMIN & START
// ─────────────────────────────────────────────────────────────────
async function seedAdmin() {
  const db = await getDb();
  const snapshot = await db.collection("users").where("role", "==", "admin").get();

  if (snapshot.empty) {
    const id = generateId();
    const badgeHash = await hashPassword("365582");

    await db.collection("users").doc(id).set({
      badgeHash,
      name: "Joxel Da Silva",
      department: "Safety Inspector",
      role: "admin",
      approved: true,
      registeredAt: new Date().toISOString(),
    });

    console.log("✓ Seed admin created (badge: 365582)");
  }
}

async function start() {
  await getDb();
  await seedAdmin();

  app.listen(config.port, () => {
    console.log(`
╔══════════════════════════════════════════════════════╗
║   Sodexo Kitchen Inspection — Secure Server          ║
╠══════════════════════════════════════════════════════╣
║   Port:       ${String(config.port).padEnd(39)}║
║   Mode:       ${config.nodeEnv.padEnd(39)}║
║   CORS:       ${config.cors.origin.padEnd(39)}║
╠══════════════════════════════════════════════════════╣
║   SECURITY ACTIVE:                                   ║
║   ✓ Helmet (CSP, HSTS, X-Frame-Options)             ║
║   ✓ CORS restricted to trusted origin                ║
║   ✓ Rate limiting (100/15min global, 10/15min auth)  ║
║   ✓ JWT authentication (HS256, 15m access tokens)    ║
║   ✓ Bcrypt password hashing (12 rounds)              ║
║   ✓ HttpOnly secure cookies (refresh tokens)         ║
║   ✓ Input validation & sanitization                  ║
║   ✓ NoSQL injection protection                       ║
║   ✓ HTTP parameter pollution protection              ║
║   ✓ Request size limit (1MB)                         ║
║   ✓ Role-based access control (RBAC)                 ║
╚══════════════════════════════════════════════════════╝
    `);
  });
}

start().catch((err) => {
  console.error("FATAL: Server failed to start:", err);
  process.exit(1);
});

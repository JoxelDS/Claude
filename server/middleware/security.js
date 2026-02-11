import helmet from "helmet";
import cors from "cors";
import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import hpp from "hpp";
import config from "../config/index.js";

// ── Helmet — sets dozens of security HTTP headers ────────────────
// Includes: Content-Security-Policy, X-Content-Type-Options,
// Strict-Transport-Security, X-Frame-Options, and more.
export const helmetMiddleware = helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "blob:"],
      connectSrc: ["'self'", "https://*.firebaseio.com", "https://*.googleapis.com"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      frameSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
    },
  },
  // Prevent clickjacking
  frameguard: { action: "deny" },
  // Disable MIME-type sniffing
  noSniff: true,
  // Enable HSTS (force HTTPS) — 1 year
  hsts: { maxAge: 31536000, includeSubDomains: true, preload: true },
  // Hide powered-by header (don't reveal Express)
  hidePoweredBy: true,
  // Prevent IE from executing downloads in site context
  ieNoOpen: true,
  // Referrer policy
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
});

// ── CORS — restrict which origins can call the API ───────────────
export const corsMiddleware = cors({
  origin: config.cors.origin,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,  // allow cookies (refresh token)
  maxAge: 86400,      // cache preflight for 24 hours
});

// ── Global rate limiter ──────────────────────────────────────────
export const globalLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests. Please try again later." },
  // Use IP + user-agent fingerprint (with IPv6 support)
  keyGenerator: (req) => {
    return `${ipKeyGenerator(req)}-${req.get("user-agent") || "unknown"}`;
  },
});

// ── Strict rate limiter for auth routes ──────────────────────────
export const authLimiter = rateLimit({
  windowMs: config.authRateLimit.windowMs,
  max: config.authRateLimit.max,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login attempts. Please wait 15 minutes." },
  keyGenerator: (req) => ipKeyGenerator(req),
});

// ── HTTP parameter pollution protection ──────────────────────────
export const hppMiddleware = hpp();

// ── Request size limiter ─────────────────────────────────────────
// Applied in server.js via express.json({ limit: "1mb" })

// ── Sanitize request data (strip $ and . from keys) ─────────────
export function sanitizeInput(req, _res, next) {
  const clean = (obj) => {
    if (typeof obj !== "object" || obj === null) return obj;
    const cleaned = Array.isArray(obj) ? [] : {};
    for (const [key, val] of Object.entries(obj)) {
      // Block NoSQL injection operators (keys starting with $ or containing .)
      if (key.startsWith("$") || key.includes(".")) continue;
      cleaned[key] = typeof val === "object" ? clean(val) : val;
    }
    return cleaned;
  };

  if (req.body) req.body = clean(req.body);
  if (req.query) req.query = clean(req.query);
  if (req.params) req.params = clean(req.params);
  next();
}

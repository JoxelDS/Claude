import "dotenv/config";

const config = {
  port: parseInt(process.env.PORT, 10) || 4000,
  nodeEnv: process.env.NODE_ENV || "development",

  // JWT secrets — MUST be set in .env for production
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET || "",
    refreshSecret: process.env.JWT_REFRESH_SECRET || "",
    accessExpiresIn: "15m",
    refreshExpiresIn: "7d",
  },

  // CORS — restrict to your deployed frontend origin
  cors: {
    origin: process.env.CORS_ORIGIN || "http://localhost:5173",
  },

  // Bcrypt work factor — higher = slower but more secure
  bcryptRounds: 12,

  // Rate-limit windows
  rateLimit: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100,                  // max requests per window
  },
  authRateLimit: {
    windowMs: 15 * 60 * 1000,
    max: 10,                   // stricter for auth endpoints
  },

  // Firebase Admin SDK
  firebase: {
    serviceAccountPath: process.env.FIREBASE_SERVICE_ACCOUNT || "",
  },
};

// ── Startup validation ────────────────────────────────────────────
const required = ["jwt.accessSecret", "jwt.refreshSecret"];
const missing = required.filter((key) => {
  const val = key.split(".").reduce((obj, k) => obj?.[k], config);
  return !val;
});

if (missing.length > 0 && config.nodeEnv === "production") {
  console.error(
    `FATAL: Missing required config: ${missing.join(", ")}. Set them in .env`
  );
  process.exit(1);
}

// Allow dev mode with generated secrets (warns loudly)
if (missing.length > 0) {
  const { randomBytes } = await import("node:crypto");
  if (!config.jwt.accessSecret) {
    config.jwt.accessSecret = randomBytes(64).toString("hex");
    console.warn("⚠  DEV MODE: Generated random JWT_ACCESS_SECRET");
  }
  if (!config.jwt.refreshSecret) {
    config.jwt.refreshSecret = randomBytes(64).toString("hex");
    console.warn("⚠  DEV MODE: Generated random JWT_REFRESH_SECRET");
  }
}

export default config;

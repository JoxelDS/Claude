import { verifyAccessToken } from "../utils/crypto.js";

// ── Authenticate — verify JWT from Authorization header ──────────
export function authenticate(req, res, next) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authentication required." });
  }

  const token = header.slice(7);
  try {
    const payload = verifyAccessToken(token);
    // Attach user info to request for downstream handlers
    req.user = {
      id: payload.sub,
      badgeHash: payload.badgeHash,
      name: payload.name,
      role: payload.role,
    };
    next();
  } catch (err) {
    if (err.name === "TokenExpiredError") {
      return res.status(401).json({ error: "Token expired. Please refresh." });
    }
    return res.status(401).json({ error: "Invalid token." });
  }
}

// ── Authorize — check user role ──────────────────────────────────
export function authorize(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: "Authentication required." });
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: "Insufficient permissions." });
    }
    next();
  };
}

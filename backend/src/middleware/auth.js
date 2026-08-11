const jwt = require("jsonwebtoken");
const config = require("../config/env");

if (!config.jwtSecret) {
  throw new Error("JWT_SECRET must be set in environment variables before using auth middleware.");
}

function getTokenFromHeader(req) {
  const auth = req.headers.authorization || req.headers.Authorization || "";
  if (!auth.toLowerCase().startsWith("bearer ")) return null;
  return auth.slice(7).trim();
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
    },
    config.jwtSecret,
    { expiresIn: "7d" }
  );
}

function authenticate(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) {
    return res.status(401).json({ error: "Authentication required" });
  }

  try {
    const payload = jwt.verify(token, config.jwtSecret);
    req.user = payload;
    return next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ error: "Authentication required" });
  }
  if (req.user.role !== "ADMIN") {
    return res.status(403).json({ error: "Admin access required" });
  }
  return next();
}

function optionalAuth(req, res, next) {
  const token = getTokenFromHeader(req);
  if (!token) return next();

  try {
    req.user = jwt.verify(token, config.jwtSecret);
  } catch {
    // ignore invalid token for optional auth routes
  }
  return next();
}

module.exports = { authenticate, requireAdmin, optionalAuth, signToken };

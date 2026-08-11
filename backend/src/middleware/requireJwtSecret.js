const config = require("../config/env");

if (!config.jwtSecret) {
  throw new Error("JWT_SECRET must be set in environment variables before starting the backend.");
}

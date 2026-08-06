const logger = require("../utils/logger");

// eslint-disable-next-line no-unused-vars
module.exports = function errorHandler(err, req, res, next) {
  logger.error(`Unhandled error on ${req.method} ${req.path}`, err);
  res.status(500).json({ error: "Something went wrong. Please try again." });
};

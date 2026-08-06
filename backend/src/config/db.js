const { PrismaClient } = require("@prisma/client");

// Reuse a single PrismaClient instance across the app (avoids exhausting
// DB connections, especially important with nodemon hot-reloads in dev).
const prisma = new PrismaClient();

module.exports = prisma;

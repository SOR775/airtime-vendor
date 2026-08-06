const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const paymentRoutes = require("./routes/payment.routes");
const errorHandler = require("./middleware/errorHandler");

const app = express();

app.use(helmet());
app.use(cors()); // tighten this to your actual frontend origin before production
app.use(morgan("dev"));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/payments", paymentRoutes);

app.use(errorHandler);

module.exports = app;

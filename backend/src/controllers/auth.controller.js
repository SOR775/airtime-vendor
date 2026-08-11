const bcrypt = require("bcrypt");
const prisma = require("../config/db");
const { signToken } = require("../middleware/auth");
const nodemailer = require("nodemailer");
const config = require("../config/env");

const MIN_PASSWORD_LENGTH = 8;

// In-memory OTP store: email -> { code, passwordHash, expiresAt }
// Note: ephemeral and resets on server restart. For production, persist in DB.
const otpStore = new Map();

function generateOtp() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

function makeTransporter() {
  if (!config.smtpHost || !config.smtpUser || !config.smtpPass) {
    return null;
  }
  return nodemailer.createTransport({
    host: config.smtpHost,
    port: config.smtpPort || 587,
    secure: config.smtpSecure || false,
    auth: { user: config.smtpUser, pass: config.smtpPass },
  });
}

const transporter = makeTransporter();

async function initiateRegister(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username (email) and password are required" });
  }
  if (typeof password !== "string" || password.length < MIN_PASSWORD_LENGTH) {
    return res.status(400).json({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` });
  }

  const email = username.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { username: email } });
  if (existing) {
    return res.status(409).json({ error: "Username is already in use" });
  }

  const code = generateOtp();
  const passwordHash = await bcrypt.hash(password, 10);
  const expiresAt = Date.now() + 1000 * 60 * 10; // 10 minutes
  otpStore.set(email, { code, passwordHash, expiresAt });

  if (!transporter) {
    // If SMTP not configured, return the code in response for local dev convenience
    return res.json({ message: "OTP (dev) sent", otp: code });
  }

  try {
    await transporter.sendMail({
      from: config.smtpUser,
      to: email,
      subject: "Your Air-timee registration code",
      text: `Your Air-timee verification code is: ${code} (expires in 10 minutes)`,
      html: `
        <div style="font-family: Arial, sans-serif; background-color:#f4fbf6; padding:24px;">
          <div style="max-width:600px; margin:0 auto; background:#ffffff; border:1px solid #dcefe1; border-radius:16px; overflow:hidden;">
            <div style="background:linear-gradient(135deg, #0f766e 0%, #16a34a 100%); padding:24px 32px;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:44px; height:44px; border-radius:50%; background:#ffffff; display:flex; align-items:center; justify-content:center; font-weight:700; color:#0f766e; font-size:20px;">A</div>
                <div>
                  <div style="color:#ffffff; font-size:20px; font-weight:700;">Air-timee</div>
                  <div style="color:#ddfce7; font-size:12px;">Secure account verification</div>
                </div>
              </div>
            </div>
            <div style="padding:32px;">
              <h2 style="margin:0 0 12px; color:#0f172a; font-size:24px;">Verify your registration</h2>
              <p style="margin:0 0 16px; color:#475569; line-height:1.6;">Use the code below to complete your account setup. This code expires in 10 minutes.</p>
              <div style="display:inline-block; padding:14px 20px; border-radius:12px; background:#f0fdf4; border:1px solid #bbf7d0; font-size:28px; letter-spacing:4px; font-weight:700; color:#166534;">${code}</div>
              <p style="margin:16px 0 0; color:#64748b; font-size:13px;">If you did not create an account, you can safely ignore this message.</p>
            </div>
          </div>
        </div>
      `,
    });
    return res.json({ message: "OTP sent" });
  } catch (err) {
    console.error("Failed to send OTP email", err);
    return res.status(500).json({ error: "Failed to send OTP email" });
  }
}

async function verifyRegister(req, res) {
  const { username, code } = req.body;
  if (!username || !code) return res.status(400).json({ error: "username and code required" });
  const email = username.trim().toLowerCase();
  const record = otpStore.get(email);
  if (!record) return res.status(400).json({ error: "No pending registration for this email" });
  if (Date.now() > record.expiresAt) {
    otpStore.delete(email);
    return res.status(400).json({ error: "OTP expired" });
  }
  if (record.code !== String(code).trim()) return res.status(400).json({ error: "Invalid OTP code" });

  // All good — create user
  try {
    const user = await prisma.user.create({ data: { username: email, email: email, passwordHash: record.passwordHash, role: "USER" } });
    otpStore.delete(email);
    const token = signToken({ id: user.id, username: user.username, role: user.role });
    return res.status(201).json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: "Failed to create user" });
  }
}

async function login(req, res) {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: "Username and password are required" });
  }
  const normalizedUsername = username.trim().toLowerCase();
  const user = await prisma.user.findUnique({ where: { username: normalizedUsername } });
  if (!user) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const passwordMatch = await bcrypt.compare(password, user.passwordHash);
  if (!passwordMatch) {
    return res.status(401).json({ error: "Invalid username or password" });
  }

  const token = signToken({ id: user.id, username: user.username, role: user.role });
  return res.json({ token, user: { id: user.id, username: user.username, email: user.email, role: user.role } });
}

module.exports = { initiateRegister, verifyRegister, login };

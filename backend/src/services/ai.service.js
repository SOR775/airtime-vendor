const axios = require("axios");
const mpesa = require("../services/mpesa.service");
const config = require("../config/env");

const CLAUDE_API_URL = "https://api.anthropic.com/v1/complete";

function buildParsePrompt(mpesaText, phone, amount) {
  let prompt = "Human: You are an assistant that extracts M-Pesa payment details from an SMS receipt. " +
    "Return only valid JSON with these keys: amount, receipt, phone, timestamp, note. " +
    "Use null for missing values and do not include any explanation outside the JSON.\n\n";
  prompt += `SMS: ${mpesaText}\n`;
  if (phone) prompt += `Phone: ${phone}\n`;
  if (amount != null) prompt += `Amount: ${amount}\n`;
  prompt += "Assistant:";
  return prompt;
}

function buildChatPrompt(message, transaction) {
  let prompt = `Human: You are an AI assistant for an airtime vendor platform. Answer support questions clearly and safely, and do not perform any transaction authorization. If a transaction is provided, use its status and details to answer accurately. Do not guess or invent transaction state.\n\n`;
  if (transaction) {
    prompt += `Context: Transaction ID ${transaction.id}, status ${transaction.status}, amount ${transaction.amount}, phone ${transaction.phoneNumber}${transaction.failureReason ? `, failureReason ${transaction.failureReason}` : ""}.\n`;
  }
  prompt += `User: ${message}\nAssistant:`;
  return prompt;
}

function normalizeClaudeOutput(text) {
  if (!text || typeof text !== "string") return null;
  const jsonStart = text.indexOf("{");
  const jsonEnd = text.lastIndexOf("}");
  if (jsonStart === -1 || jsonEnd === -1 || jsonEnd <= jsonStart) {
    return null;
  }
  try {
    return JSON.parse(text.slice(jsonStart, jsonEnd + 1));
  } catch (err) {
    return null;
  }
}

async function queryClaude(prompt, stopSequences = ["\n\nHuman:"]) {
  if (!config.claudeApiKey) {
    const error = new Error("CLAUDE_API_KEY is not configured");
    error.status = 503;
    throw error;
  }

  try {
    const response = await axios.post(
      CLAUDE_API_URL,
      {
        model: config.claudeModel,
        prompt,
        max_tokens_to_sample: 500,
        temperature: 0.2,
        stop_sequences: stopSequences,
      },
      {
        headers: {
          Authorization: `Bearer ${config.claudeApiKey}`,
          "Content-Type": "application/json",
        },
      }
    );

    return response.data?.completion ?? response.data?.output_text ?? null;
  } catch (err) {
    const status = err.response?.status;
    const responseData = err.response?.data;
    console.warn("Claude request failed", status, responseData || err.message || err);
    if (status === 401) {
      const authError = new Error("AI support cannot connect to Claude: check your CLAUDE_API_KEY and model configuration.");
      authError.status = 502;
      throw authError;
    }
    throw err;
  }
}

async function parseSmsSuggestion(mpesaText, phone, amount) {
  if (config.claudeApiKey) {
    try {
      const prompt = buildParsePrompt(mpesaText, phone, amount);
      const completion = await queryClaude(prompt);
      const suggestion = normalizeClaudeOutput(completion);
      if (suggestion) {
        return {
          model: config.claudeModel,
          suggestion,
          raw: completion,
          note: "AI suggestion from Claude. Always validate via Daraja/Stratum.",
        };
      }
    } catch (err) {
      console.warn("Claude parse failed, falling back to heuristic parser:", err.message || err);
    }
  }

  try {
    const parsed = mpesa.parseMpesaSms(mpesaText);
    return {
      model: config.claudeModel || "mock",
      suggestion: {
        amount: parsed.amount,
        receipt: parsed.receipt,
        phone: parsed.phone,
      },
      raw: null,
      note: "This is an AI-style suggestion using local heuristics. Always validate via Daraja/Stratum.",
    };
  } catch (err) {
    return { model: config.claudeModel || "mock", suggestion: null, raw: null, error: err.message };
  }
}

async function chat(message) {
  if (!config.claudeApiKey) {
    return "This is a placeholder support reply. Set CLAUDE_API_KEY in your environment to enable real AI responses.";
  }

  try {
    const prompt = buildChatPrompt(message);
    const completion = await queryClaude(prompt, ["\n\nHuman:", "\n\nUser:"]);
    return completion?.trim() || "I’m sorry, I couldn’t generate a response. Please try again.";
  } catch (err) {
    const status = err.response?.status ?? err.status;
    const responseData = err.response?.data;
    console.warn("Claude chat failed", status, responseData || err.message || err);
    if (status === 401 || status === 502) {
      return err.message || "AI support cannot connect to Claude: check your CLAUDE_API_KEY and model configuration.";
    }
    return "I’m sorry, something went wrong while generating a response.";
  }
}

module.exports = { parseSmsSuggestion, chat };

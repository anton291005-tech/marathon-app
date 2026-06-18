"use strict";

/** Strips Markdown fences and extracts the outermost JSON object from a string. */
function extractJson(raw) {
  const text = typeof raw === "string" ? raw : String(raw ?? "");
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) return fenceMatch[1].trim();
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start !== -1 && end !== -1 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

module.exports = { extractJson };

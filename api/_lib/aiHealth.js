"use strict";

const {
  AI_RESPONSE_SCHEMA,
  collectSchemaAdditionalPropertiesViolations,
  collectSchemaRequiredCoverageViolations,
  getSchemaStrictnessSummary,
} = require("./aiSchema");

function readEnvTrimmed(name) {
  const raw = process.env[name];
  if (typeof raw !== "string") return "";
  const value = raw.trim();
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1).trim();
  }
  return value;
}

function getAiHealthPayload() {
  const apiKey = readEnvTrimmed("OPENAI_API_KEY");
  const project = readEnvTrimmed("OPENAI_PROJECT");
  const defaultModel = process.env.OPENAI_MODEL || "gpt-4o-mini";
  const schemaViolations = collectSchemaAdditionalPropertiesViolations(AI_RESPONSE_SCHEMA);
  const requiredCoverageViolations = collectSchemaRequiredCoverageViolations(AI_RESPONSE_SCHEMA);

  return {
    ok: true,
    openaiConfigured: Boolean(apiKey),
    keyPrefix: apiKey ? apiKey.slice(0, 7) : null,
    model: defaultModel,
    projectConfigured: Boolean(project),
    schemaStrictObjects: schemaViolations.length === 0,
    schemaViolations,
    schemaRequiredCoverageOk: requiredCoverageViolations.length === 0,
    schemaRequiredCoverageViolations: requiredCoverageViolations,
    schemaSummary: getSchemaStrictnessSummary(),
  };
}

module.exports = { getAiHealthPayload };

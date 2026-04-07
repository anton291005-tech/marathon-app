const ALLOWED_ACTIONS = [
  "adjust_plan_for_illness",
  "replace_bike_with_run",
  "shift_race_date",
  "shift_plan_start_date",
  "navigate_to_screen",
  "explain_feature",
];

const PREVIEW_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["title", "items", "confirmLabel", "cancelLabel", "secondaryLabel", "openLabel"],
  properties: {
    title: { type: "string" },
    items: {
      type: "array",
      items: { type: "string" },
    },
    confirmLabel: { type: ["string", "null"] },
    cancelLabel: { type: ["string", "null"] },
    secondaryLabel: { type: ["string", "null"] },
    openLabel: { type: ["string", "null"] },
  },
};

const AI_RESPONSE_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["mode", "message", "action"],
  properties: {
    mode: { type: "string", enum: ["coach", "navigator", "support"] },
    message: { type: "string" },
    action: {
      anyOf: [
        {
          type: "null",
        },
        {
          type: "object",
          additionalProperties: false,
          required: ["type", "payload", "preview"],
          properties: {
            type: { type: "string", enum: ALLOWED_ACTIONS },
            payload: {
              type: "object",
              additionalProperties: false,
              required: [
                "reason",
                "severity",
                "bikeSessionId",
                "shiftDays",
                "requestedStartOffsetDays",
                "requestedStartDateLabel",
                "targetScreen",
                "targetScreenLabel",
                "section",
                "sectionLabel",
                "topic",
              ],
              properties: {
                reason: { type: ["string", "null"] },
                severity: { type: ["string", "null"] },
                bikeSessionId: { type: ["string", "null"] },
                shiftDays: { type: ["number", "null"] },
                requestedStartOffsetDays: { type: ["number", "null"] },
                requestedStartDateLabel: { type: ["string", "null"] },
                targetScreen: { type: ["string", "null"] },
                targetScreenLabel: { type: ["string", "null"] },
                section: { type: ["string", "null"] },
                sectionLabel: { type: ["string", "null"] },
                topic: { type: ["string", "null"] },
              },
            },
            preview: {
              anyOf: [
                { type: "null" },
                PREVIEW_SCHEMA,
              ],
            },
          },
        },
      ],
    },
  },
};

function isValidAiResponse(candidate) {
  if (!candidate || typeof candidate !== "object") return false;
  if (!["coach", "navigator", "support"].includes(candidate.mode)) return false;
  if (typeof candidate.message !== "string" || !candidate.message.trim()) return false;
  if (!candidate.action) return true;
  if (!candidate.action || typeof candidate.action !== "object") return false;
  if (!ALLOWED_ACTIONS.includes(candidate.action.type)) return false;
  if (!candidate.action.payload || typeof candidate.action.payload !== "object") return false;
  return true;
}

function collectSchemaAdditionalPropertiesViolations(schema, path = []) {
  const violations = [];
  if (!schema || typeof schema !== "object") return violations;

  if (schema.type === "object" && schema.additionalProperties !== false) {
    violations.push(path.join(".") || "root");
  }
  if (schema.properties && typeof schema.properties === "object") {
    Object.entries(schema.properties).forEach(([key, value]) => {
      violations.push(...collectSchemaAdditionalPropertiesViolations(value, [...path, "properties", key]));
    });
  }
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((entry, index) => {
      violations.push(...collectSchemaAdditionalPropertiesViolations(entry, [...path, "oneOf", String(index)]));
    });
  }
  if (schema.items && typeof schema.items === "object") {
    violations.push(...collectSchemaAdditionalPropertiesViolations(schema.items, [...path, "items"]));
  }
  return violations;
}

function collectSchemaRequiredCoverageViolations(schema, path = []) {
  const violations = [];
  if (!schema || typeof schema !== "object") return violations;

  if (schema.type === "object" && schema.properties && typeof schema.properties === "object") {
    const propertyKeys = Object.keys(schema.properties);
    const required = Array.isArray(schema.required) ? schema.required : [];
    const missing = propertyKeys.filter((key) => !required.includes(key));
    if (missing.length > 0) {
      violations.push({ path: path.join(".") || "root", missing });
    }
  }

  if (schema.properties && typeof schema.properties === "object") {
    Object.entries(schema.properties).forEach(([key, value]) => {
      violations.push(...collectSchemaRequiredCoverageViolations(value, [...path, "properties", key]));
    });
  }
  if (Array.isArray(schema.oneOf)) {
    schema.oneOf.forEach((entry, index) => {
      violations.push(...collectSchemaRequiredCoverageViolations(entry, [...path, "oneOf", String(index)]));
    });
  }
  if (Array.isArray(schema.anyOf)) {
    schema.anyOf.forEach((entry, index) => {
      violations.push(...collectSchemaRequiredCoverageViolations(entry, [...path, "anyOf", String(index)]));
    });
  }
  if (schema.items && typeof schema.items === "object") {
    violations.push(...collectSchemaRequiredCoverageViolations(schema.items, [...path, "items"]));
  }
  return violations;
}

function getSchemaStrictnessSummary() {
  const actionObjectSchema = AI_RESPONSE_SCHEMA?.properties?.action?.anyOf?.find(
    (entry) => entry && entry.type === "object"
  );
  const payloadSchema = actionObjectSchema?.properties?.payload || null;
  const previewSchema = actionObjectSchema?.properties?.preview?.anyOf?.find(
    (entry) => entry && entry.type === "object"
  ) || null;

  return {
    rootRequired: AI_RESPONSE_SCHEMA.required || [],
    actionRequired: actionObjectSchema?.required || [],
    payloadRequired: payloadSchema?.required || [],
    previewRequired: previewSchema?.required || [],
    nullableFields: {
      action: true,
      actionPreview: true,
      previewConfirmLabel: true,
      previewCancelLabel: true,
      previewSecondaryLabel: true,
      previewOpenLabel: true,
    },
    payloadAdditionalProperties: payloadSchema?.additionalProperties,
    previewAdditionalProperties: previewSchema?.additionalProperties,
    actionAdditionalProperties: actionObjectSchema?.additionalProperties,
    rootAdditionalProperties: AI_RESPONSE_SCHEMA.additionalProperties,
  };
}

module.exports = {
  ALLOWED_ACTIONS,
  AI_RESPONSE_SCHEMA,
  isValidAiResponse,
  collectSchemaAdditionalPropertiesViolations,
  collectSchemaRequiredCoverageViolations,
  getSchemaStrictnessSummary,
};

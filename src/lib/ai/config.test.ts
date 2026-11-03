import fs from "fs";
import path from "path";
import { getAiConfig } from "./config";

const AI_ENV_KEYS = [
  "REACT_APP_AI_PROVIDER",
  "REACT_APP_AI_ENABLED",
  "REACT_APP_AI_TIMEOUT_MS",
  "REACT_APP_AI_API_BASE",
  "REACT_APP_AI_API_BASE_URL",
  "REACT_APP_AI_MODEL",
] as const;

describe("getAiConfig", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    for (const key of AI_ENV_KEYS) delete process.env[key];
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  test("liest apiBaseUrl aus REACT_APP_AI_API_BASE", () => {
    process.env.REACT_APP_AI_API_BASE = "  https://plan-api.example.test  ";
    expect(getAiConfig().apiBaseUrl).toBe("https://plan-api.example.test");
  });

  test("REACT_APP_AI_API_BASE hat Vorrang vor REACT_APP_AI_API_BASE_URL", () => {
    process.env.REACT_APP_AI_API_BASE = "https://primary.example.test";
    process.env.REACT_APP_AI_API_BASE_URL = "https://secondary.example.test";
    expect(getAiConfig().apiBaseUrl).toBe("https://primary.example.test");

    delete process.env.REACT_APP_AI_API_BASE;
    expect(getAiConfig().apiBaseUrl).toBe("https://secondary.example.test");
  });

  test("übernimmt provider/enabled/model/timeout aus der Env", () => {
    process.env.REACT_APP_AI_PROVIDER = "openai";
    process.env.REACT_APP_AI_ENABLED = "false";
    process.env.REACT_APP_AI_MODEL = "custom-model";
    process.env.REACT_APP_AI_TIMEOUT_MS = "15000";
    expect(getAiConfig()).toEqual({
      provider: "openai",
      enabled: false,
      model: "custom-model",
      apiBaseUrl: "",
      requestTimeoutMs: 15000,
    });
  });

  test("Defaults ohne Env", () => {
    expect(getAiConfig()).toEqual({
      provider: "mock",
      enabled: false,
      model: "gpt-4.1-mini",
      apiBaseUrl: "",
      requestTimeoutMs: 8000,
    });
  });

  // Regression: CRA inlined nur statische `process.env.REACT_APP_X`-Ausdrücke. Ein `typeof process`-Guard
  // oder ein dynamischer `process.env[name]`-Zugriff liefert im Browser-Build immer "" — in Jest (wo
  // `process` existiert) fiele das nicht auf, darum zusätzlich die Quelle prüfen.
  test("Quelle nutzt nur statische process.env-Zugriffe (CRA-Inlining)", () => {
    const source = fs.readFileSync(path.join(__dirname, "config.ts"), "utf8");
    const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
    expect(code).not.toMatch(/typeof\s+process/);
    expect(code).not.toMatch(/process\.env\s*\[/);
    for (const key of AI_ENV_KEYS) {
      expect(code).toContain(`process.env.${key}`);
    }
  });
});

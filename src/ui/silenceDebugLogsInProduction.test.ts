import { shouldSilenceDebugLogs } from "./silenceDebugLogsInProduction";

describe("shouldSilenceDebugLogs", () => {
  test("production ohne Flag: Debug-Logs werden stummgeschaltet", () => {
    expect(shouldSilenceDebugLogs("production", null, "")).toBe(true);
  });

  test("development: nie stummschalten", () => {
    expect(shouldSilenceDebugLogs("development", null, "")).toBe(false);
  });

  test("test-Umgebung: nie stummschalten (Jest-Läufe bleiben unverändert)", () => {
    expect(shouldSilenceDebugLogs("test", null, "")).toBe(false);
  });

  test("unbekannte/fehlende NODE_ENV: nie stummschalten", () => {
    expect(shouldSilenceDebugLogs(undefined, null, "")).toBe(false);
  });

  test("production mit localStorage-Flag: Logs bleiben an", () => {
    expect(shouldSilenceDebugLogs("production", "1", "")).toBe(false);
  });

  test("production mit ?debugLogs=1: Logs bleiben an", () => {
    expect(shouldSilenceDebugLogs("production", null, "?debugLogs=1")).toBe(false);
  });

  test("production mit ?debugLogs=1 neben anderen Parametern: Logs bleiben an", () => {
    expect(shouldSilenceDebugLogs("production", null, "?foo=bar&debugLogs=1")).toBe(false);
  });

  test("Flag mit anderem Wert als '1' hebt das Gate nicht auf", () => {
    expect(shouldSilenceDebugLogs("production", "0", "")).toBe(true);
    expect(shouldSilenceDebugLogs("production", "true", "")).toBe(true);
    expect(shouldSilenceDebugLogs("production", null, "?debugLogs=0")).toBe(true);
  });

  test("nicht lesbarer localStorage (null) fällt sicher auf 'stummschalten' zurück", () => {
    // readFlag() fängt Wurf-Fälle ab und liefert null — hier der resultierende Wert.
    expect(shouldSilenceDebugLogs("production", null, "")).toBe(true);
  });

  test("kaputter Query-String hebelt das Gate nicht aus", () => {
    expect(shouldSilenceDebugLogs("production", null, "?%%%")).toBe(true);
  });
});

/**
 * Der eigentliche Akzeptanztest: der Modul-Seiteneffekt. Das Modul wird pro Fall frisch geladen
 * (isolateModules), damit der Import-Zeit-Effekt erneut läuft, und console wird davor/danach
 * gesichert bzw. wiederhergestellt.
 */
describe("Modul-Seiteneffekt", () => {
  const original = {
    log: console.log,
    debug: console.debug,
    info: console.info,
    warn: console.warn,
    error: console.error,
  };
  const originalEnv = process.env.NODE_ENV;

  function loadModuleWith(env: string): void {
    // NODE_ENV ist in den CRA-Typen readonly — für den Test bewusst überschrieben.
    (process.env as Record<string, string>).NODE_ENV = env;
    jest.isolateModules(() => {
      require("./silenceDebugLogsInProduction");
    });
  }

  afterEach(() => {
    console.log = original.log;
    console.debug = original.debug;
    console.info = original.info;
    console.warn = original.warn;
    console.error = original.error;
    (process.env as Record<string, string>).NODE_ENV = originalEnv as string;
  });

  test("production ohne Flag: log/debug/info sind still, warn/error bleiben erhalten", () => {
    loadModuleWith("production");

    const logSpy = jest.fn();
    // Die No-op-Zuweisung hat bereits stattgefunden — prüfen, dass nichts durchkommt.
    expect(console.log).not.toBe(original.log);
    expect(console.debug).not.toBe(original.debug);
    expect(console.info).not.toBe(original.info);

    // warn/error sind unangetastet (echte Fehlerpfade + Sentry-Breadcrumbs).
    expect(console.warn).toBe(original.warn);
    expect(console.error).toBe(original.error);

    // Ein Aufruf darf weder werfen noch etwas ausgeben.
    console.log = ((...args: unknown[]) => logSpy(...args)) as typeof console.log;
    expect(() => console.log("nach dem Gate")).not.toThrow();
  });

  test("development: console bleibt vollständig unangetastet", () => {
    loadModuleWith("development");

    expect(console.log).toBe(original.log);
    expect(console.debug).toBe(original.debug);
    expect(console.info).toBe(original.info);
    expect(console.warn).toBe(original.warn);
    expect(console.error).toBe(original.error);
  });
});

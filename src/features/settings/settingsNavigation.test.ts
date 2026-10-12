import {
  SETTINGS_NAV_ROOT,
  SETTINGS_PAGE_TITLES,
  SETTINGS_SECTION_IDS,
  SETTINGS_SUBPAGE_PARENT,
  currentSettingsPage,
  isSettingsDetailOpen,
  settingsBackLabel,
  settingsNavReducer,
  type SettingsNavState,
  type SettingsPageId,
} from "./settingsNavigation";

const open = (state: SettingsNavState, page: SettingsPageId) => settingsNavReducer(state, { type: "open", page });
const back = (state: SettingsNavState) => settingsNavReducer(state, { type: "back" });
const reset = (state: SettingsNavState) => settingsNavReducer(state, { type: "reset" });

describe("settingsNavReducer", () => {
  test("Wurzel: keine Seite offen", () => {
    expect(currentSettingsPage(SETTINGS_NAV_ROOT)).toBeNull();
    expect(isSettingsDetailOpen(SETTINGS_NAV_ROOT)).toBe(false);
  });

  test("open(Bereich) öffnet genau diesen Bereich", () => {
    for (const section of SETTINGS_SECTION_IDS) {
      const state = open(SETTINGS_NAV_ROOT, section);
      expect(state.stack).toEqual([section]);
      expect(state.motion).toBe(1);
      expect(isSettingsDetailOpen(state)).toBe(true);
    }
  });

  test("open(Unterseite) legt sie über ihren Bereich — auch direkt von der Wurzel", () => {
    expect(open(SETTINGS_NAV_ROOT, "healthAssignment").stack).toEqual(["connections", "healthAssignment"]);
    expect(open(open(SETTINGS_NAV_ROOT, "privacy"), "dataUsage").stack).toEqual(["privacy", "dataUsage"]);
  });

  test("open(anderer Bereich) ersetzt den Stapel, statt ihn wachsen zu lassen", () => {
    const state = open(open(SETTINGS_NAV_ROOT, "healthAssignment"), "training");
    expect(state.stack).toEqual(["training"]);
  });

  test("open der sichtbaren Seite ändert nichts (gleiches Objekt)", () => {
    const state = open(SETTINGS_NAV_ROOT, "training");
    expect(open(state, "training")).toBe(state);
  });

  test("open mit unbekannter Seite ändert nichts", () => {
    const state = open(SETTINGS_NAV_ROOT, "app");
    expect(open(state, "gibt-es-nicht" as SettingsPageId)).toBe(state);
  });

  test("back(): Unterseite → Bereich → Wurzel, auf der Wurzel wirkungslos", () => {
    const sub = open(SETTINGS_NAV_ROOT, "dataUsage");
    const section = back(sub);
    expect(section.stack).toEqual(["privacy"]);
    expect(section.motion).toBe(-1);
    const root = back(section);
    expect(root.stack).toEqual([]);
    expect(root.motion).toBe(-1);
    expect(back(root)).toBe(root);
    expect(back(SETTINGS_NAV_ROOT)).toBe(SETTINGS_NAV_ROOT);
  });

  test("reset(): von jeder Tiefe zur Wurzel ohne Animation, auf der Wurzel wirkungslos", () => {
    expect(reset(open(SETTINGS_NAV_ROOT, "healthAssignment"))).toBe(SETTINGS_NAV_ROOT);
    expect(reset(open(SETTINGS_NAV_ROOT, "account"))).toBe(SETTINGS_NAV_ROOT);
    expect(reset(SETTINGS_NAV_ROOT)).toBe(SETTINGS_NAV_ROOT);
  });

  test("der Eingangs-State wird nicht verändert", () => {
    const state = open(SETTINGS_NAV_ROOT, "dataUsage");
    const snapshot = JSON.stringify(state);
    back(state);
    open(state, "profile");
    reset(state);
    expect(JSON.stringify(state)).toBe(snapshot);
  });
});

describe("Seiten-Metadaten", () => {
  test("jede Seite hat einen Titel, jede Unterseite einen Bereich als Eltern", () => {
    for (const section of SETTINGS_SECTION_IDS) {
      expect(SETTINGS_PAGE_TITLES[section]).toBeTruthy();
    }
    for (const [sub, parent] of Object.entries(SETTINGS_SUBPAGE_PARENT)) {
      expect(SETTINGS_PAGE_TITLES[sub as SettingsPageId]).toBeTruthy();
      expect(SETTINGS_SECTION_IDS).toContain(parent);
    }
  });

  test("Werkzeuge sind keine Einstellungsseiten mehr", () => {
    expect(Object.keys(SETTINGS_SUBPAGE_PARENT).sort()).toEqual(["dataUsage", "healthAssignment"]);
    const state = open(SETTINGS_NAV_ROOT, "app");
    expect(open(state, "raceCalculator" as SettingsPageId)).toBe(state);
    expect(open(state, "share" as SettingsPageId)).toBe(state);
  });

  test("genau sechs Bereiche in der vereinbarten Reihenfolge", () => {
    expect(SETTINGS_SECTION_IDS.map((id) => SETTINGS_PAGE_TITLES[id])).toEqual([
      "Profil",
      "Training",
      "Verbindungen",
      "App",
      "Datenschutz & Daten",
      "Konto & Hilfe",
    ]);
  });

  test("Zurück-Beschriftung: Wurzeltitel auf der ersten Ebene, sonst der Bereich", () => {
    expect(settingsBackLabel(open(SETTINGS_NAV_ROOT, "training"), "Einstellungen")).toBe("Einstellungen");
    expect(settingsBackLabel(open(SETTINGS_NAV_ROOT, "healthAssignment"), "Einstellungen")).toBe("Verbindungen");
    expect(settingsBackLabel(SETTINGS_NAV_ROOT, "Einstellungen")).toBe("Einstellungen");
  });
});

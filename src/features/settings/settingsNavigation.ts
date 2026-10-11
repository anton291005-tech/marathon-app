/**
 * Seiten-State des Einstellungen-Tabs (UI only — no business logic).
 *
 * Wurzel = Profilkarte + Bereichsliste. Darüber liegt ein Stapel aus höchstens zwei Seiten:
 * ein Bereich und ggf. eine seiner Unterseiten. Kein Router, keine Browser-History.
 */

export const SETTINGS_SECTION_IDS = ["profile", "training", "connections", "app", "privacy", "account"] as const;
export type SettingsSectionId = (typeof SETTINGS_SECTION_IDS)[number];

/** Unterseite → Bereich, zu dem „Zurück" führt. */
export const SETTINGS_SUBPAGE_PARENT = {
  healthAssignment: "connections",
  dataUsage: "privacy",
  raceCalculator: "app",
  share: "app",
} as const;
export type SettingsSubPageId = keyof typeof SETTINGS_SUBPAGE_PARENT;

export type SettingsPageId = SettingsSectionId | SettingsSubPageId;

export const SETTINGS_PAGE_TITLES: Record<SettingsPageId, string> = {
  profile: "Profil",
  training: "Training",
  connections: "Verbindungen",
  app: "App",
  privacy: "Datenschutz & Daten",
  account: "Konto & Hilfe",
  healthAssignment: "Aktivitäten zuordnen",
  raceCalculator: "Race Calculator",
  share: "Teilen",
  dataUsage: "Datennutzung",
};

export type SettingsNavState = {
  /** Leer = Wurzel; letzter Eintrag = sichtbare Seite. */
  readonly stack: readonly SettingsPageId[];
  /** Richtung des letzten Wechsels für die Seitenanimation: 1 = tiefer, -1 = zurück, 0 = keine. */
  readonly motion: -1 | 0 | 1;
};

export type SettingsNavAction =
  | { type: "open"; page: SettingsPageId }
  | { type: "back" }
  | { type: "reset" };

export const SETTINGS_NAV_ROOT: SettingsNavState = { stack: [], motion: 0 };

function isSubPage(page: SettingsPageId): page is SettingsSubPageId {
  return Object.prototype.hasOwnProperty.call(SETTINGS_SUBPAGE_PARENT, page);
}

function isKnownPage(page: unknown): page is SettingsPageId {
  return typeof page === "string" && Object.prototype.hasOwnProperty.call(SETTINGS_PAGE_TITLES, page);
}

/** Der Stapel einer Seite ist eindeutig: Bereich allein, Unterseite immer über ihrem Bereich. */
function stackFor(page: SettingsPageId): SettingsPageId[] {
  return isSubPage(page) ? [SETTINGS_SUBPAGE_PARENT[page], page] : [page];
}

/**
 * Gibt bei einem Wechsel ohne Wirkung dasselbe Objekt zurück (kein Re-Render):
 * `open` der sichtbaren Seite, `back`/`reset` auf der Wurzel, unbekannte Seite.
 */
export function settingsNavReducer(state: SettingsNavState, action: SettingsNavAction): SettingsNavState {
  switch (action.type) {
    case "open": {
      if (!isKnownPage(action.page)) return state;
      if (currentSettingsPage(state) === action.page) return state;
      return { stack: stackFor(action.page), motion: 1 };
    }
    case "back": {
      if (state.stack.length === 0) return state;
      return { stack: state.stack.slice(0, -1), motion: -1 };
    }
    case "reset": {
      if (state.stack.length === 0) return state;
      return SETTINGS_NAV_ROOT;
    }
    default:
      return state;
  }
}

/** Sichtbare Seite; `null` = Wurzel. */
export function currentSettingsPage(state: SettingsNavState): SettingsPageId | null {
  return state.stack.length > 0 ? state.stack[state.stack.length - 1] : null;
}

export function isSettingsDetailOpen(state: SettingsNavState): boolean {
  return state.stack.length > 0;
}

/** Beschriftung des Zurück-Buttons: Titel der Seite darunter, auf der ersten Ebene der Wurzeltitel. */
export function settingsBackLabel(state: SettingsNavState, rootTitle: string): string {
  if (state.stack.length < 2) return rootTitle;
  return SETTINGS_PAGE_TITLES[state.stack[state.stack.length - 2]];
}

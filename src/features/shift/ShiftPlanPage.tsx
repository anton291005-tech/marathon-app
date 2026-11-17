import { useMemo, useState } from "react";
import { ChevronLeft, Copy, Info, Repeat } from "lucide-react";
import { ICON_SIZE_S, ICON_STROKE } from "../../ui/icons";
import { addDays, diffDays, mondayOf } from "../../planCore/dates";
import { CONFIG } from "../../readinessCore/config";
import type { ShiftEntryKind, StoredShiftEntry } from "../../lib/supabase/services/shiftEntriesService";
import type { ShiftDefaultTimes } from "../../lib/supabase/services/shiftProfileService";
import { applyRotation, copyWeek, daysBetween, defaultTimesFor, entryOfKind, parseRotationPattern, ROTATION_MAX_WEEKS } from "../../shift/rotation";
import { SHIFT_KIND_LABEL, SHIFT_UNAVAILABLE_NOTE, dayLabelDe, formatShiftTimes } from "../../shift/shiftText";
import { saveShiftChanges, setShiftDefaults, setWorksShifts, type SaveShiftEntriesResult } from "../../shift/shiftStore";
import { useShiftState } from "../../shift/useShiftMode";
import "./shift.css";

const CHIP_KINDS: readonly ShiftEntryKind[] = ["early", "late", "night", "off", "custom"];
const DEFAULT_KINDS = ["early", "late", "night"] as const;
const MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

export type ShiftSaveOutcome = {
  /** `true`: der Aufrufer hat übernommen (z. B. Vorschlag im Woche-Tab gezeigt) und schließt die Seite. */
  handled: boolean;
  /** Satz unter dem Speichern-Knopf, wenn die Seite offen bleibt. */
  message?: string | null;
};

type Props = {
  todayYmd: string;
  onClose: () => void;
  /** Nach erfolgreichem lokalen Speichern (Wochen-Scan); ohne Handler bleibt die Seite mit „Gespeichert.“ offen. */
  onSaved?: (result: SaveShiftEntriesResult) => ShiftSaveOutcome | void;
};

function rangeLabel(fromYmd: string, toYmd: string): string {
  const fm = MONTHS[Number(fromYmd.slice(5, 7)) - 1];
  const tm = MONTHS[Number(toYmd.slice(5, 7)) - 1];
  const fd = Number(fromYmd.slice(8, 10));
  const td = Number(toYmd.slice(8, 10));
  return fm === tm ? `${fd}.–${td}. ${tm}` : `${fd}. ${fm} – ${td}. ${tm}`;
}

function weekTitle(index: number): string {
  if (index === 0) return "Diese Woche";
  if (index === 1) return "Nächste Woche";
  return `In ${index} Wochen`;
}

function entrySummary(entry: StoredShiftEntry | null | undefined): string {
  if (!entry) return "—";
  if (entry.kind === "off") return "Frei";
  const times = formatShiftTimes(entry);
  return `${SHIFT_KIND_LABEL[entry.kind]}${times ? ` · ${times}` : ""}`;
}

function sameEntry(a: StoredShiftEntry | null | undefined, b: StoredShiftEntry | null | undefined): boolean {
  if (!a || !b) return !a && !b;
  return a.kind === b.kind && a.start === b.start && a.end === b.end;
}

/**
 * Dienstplan-Seite (Schicht-Modus): 28 Tage ab heute, je Tag ein Tipp (Früh · Spät · Nacht · Frei · Eigene Zeit),
 * Rotationsmuster und „Woche kopieren“ für vier Wochen in unter einer Minute. Gespeichert wird in einem Bulk-Upsert.
 */
export function ShiftPlanPage({ todayYmd, onClose, onSaved }: Props) {
  const state = useShiftState();
  const horizon = CONFIG.shift.horizonDays.value;
  const lastYmd = addDays(todayYmd, horizon - 1);
  const days = useMemo(() => daysBetween(todayYmd, lastYmd), [todayYmd, lastYmd]);
  const [draft, setDraft] = useState<Record<string, StoredShiftEntry | null>>({});
  const [pattern, setPattern] = useState("");
  const [patternStart, setPatternStart] = useState(todayYmd);
  const [patternWeeks, setPatternWeeks] = useState(4);
  const [copySource, setCopySource] = useState(mondayOf(todayYmd));
  const [quickOpen, setQuickOpen] = useState(false);
  const [defaultsOpen, setDefaultsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; error?: boolean } | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const defaults: ShiftDefaultTimes | null = state.defaults;

  const effective = (ymd: string): StoredShiftEntry | null =>
    Object.prototype.hasOwnProperty.call(draft, ymd) ? draft[ymd] : state.entriesByDate[ymd] ?? null;

  const changedDates = Object.keys(draft).filter((d) => !sameEntry(draft[d], state.entriesByDate[d] ?? null));

  const weeks = useMemo(() => {
    const groups: Array<{ monday: string; days: string[] }> = [];
    days.forEach((d) => {
      const monday = mondayOf(d);
      const last = groups[groups.length - 1];
      if (last && last.monday === monday) last.days.push(d);
      else groups.push({ monday, days: [d] });
    });
    return groups;
  }, [days]);

  const close = () => {
    if (changedDates.length > 0 && !confirmDiscard) {
      setConfirmDiscard(true);
      setStatus({ text: "Noch nicht gespeichert. Tippe noch einmal auf „Schließen“, um die Änderungen zu verwerfen." });
      return;
    }
    onClose();
  };

  const setDay = (ymd: string, entry: StoredShiftEntry | null) => {
    setStatus(null);
    setConfirmDiscard(false);
    setDraft((prev) => ({ ...prev, [ymd]: entry }));
  };

  const pickKind = (ymd: string, kind: ShiftEntryKind) => {
    const current = effective(ymd);
    if (current && current.kind === kind) {
      setDay(ymd, null);
      return;
    }
    const custom = current && current.kind !== "off" && current.start && current.end ? { start: current.start, end: current.end } : undefined;
    setDay(ymd, entryOfKind(ymd, kind, defaults, custom));
  };

  const setCustomTime = (ymd: string, which: "start" | "end", value: string) => {
    const current = effective(ymd);
    if (!current || current.kind !== "custom" || !/^\d{2}:\d{2}$/.test(value)) return;
    setDay(ymd, { ...current, [which]: value });
  };

  const parsed = parseRotationPattern(pattern);
  const applyPattern = () => {
    if (!parsed.ok) return;
    const entries = applyRotation({ kinds: parsed.kinds, startYmd: patternStart, weeks: patternWeeks, defaults, untilYmd: lastYmd });
    setDraft((prev) => {
      const next = { ...prev };
      entries.forEach((e) => (next[e.dateYmd] = e));
      return next;
    });
    setStatus({ text: `${entries.length} Tage eingetragen – noch nicht gespeichert.` });
  };

  const applyCopy = () => {
    const byDate: Record<string, StoredShiftEntry> = {};
    for (let i = 0; i < 7; i += 1) {
      const d = addDays(copySource, i);
      const e = effective(d);
      if (e) byDate[d] = e;
    }
    // Ziele: alle Tage der folgenden Wochen im Fenster (auch bisher leere, damit gelöscht werden kann).
    daysBetween(addDays(copySource, 7), lastYmd).forEach((d) => {
      const e = effective(d);
      if (e) byDate[d] = e;
    });
    const times = Math.ceil((diffDays(lastYmd, copySource) + 1) / 7) - 1;
    const { upserts, deletes } = copyWeek({ entriesByDate: byDate, sourceStartYmd: copySource, times: Math.max(1, Math.min(ROTATION_MAX_WEEKS, times)), untilYmd: lastYmd });
    setDraft((prev) => {
      const next = { ...prev };
      upserts.forEach((e) => (next[e.dateYmd] = e));
      deletes.forEach((d) => (next[d] = null));
      return next;
    });
    setStatus({ text: `Woche auf ${upserts.length + deletes.length} Tage übertragen – noch nicht gespeichert.` });
  };

  const insertKey = (token: string) => setPattern((p) => (p.trim() ? `${p.trim()} ${token}` : token));

  const save = async () => {
    if (saving || changedDates.length === 0) return;
    setSaving(true);
    const upserts: StoredShiftEntry[] = [];
    const deletes: string[] = [];
    changedDates.forEach((d) => {
      const e = draft[d];
      if (e) upserts.push(e);
      else deletes.push(d);
    });
    if (state.worksShifts !== true) void setWorksShifts(true);
    const result = await saveShiftChanges({ upserts, deletes });
    setSaving(false);
    setDraft({});
    const outcome = onSaved ? onSaved(result) : undefined;
    if (outcome && outcome.handled) return;
    const base =
      result.remote === "ok"
        ? "Gespeichert."
        : result.remote === "unavailable"
          ? "Auf diesem Gerät gespeichert."
          : "Auf diesem Gerät gespeichert. Ins Konto übertragen wir es beim nächsten Öffnen.";
    setStatus({ text: outcome && outcome.message ? `${base} ${outcome.message}` : base });
  };

  const updateDefault = (kind: (typeof DEFAULT_KINDS)[number], which: "start" | "end", value: string) => {
    if (!/^\d{2}:\d{2}$/.test(value)) return;
    const current = defaultTimesFor(kind, defaults);
    const next: ShiftDefaultTimes = { ...(defaults ?? {}), [kind]: { ...current, [which]: value } };
    void setShiftDefaults(next);
  };

  const weekOptions = weeks.map((w, i) => ({ value: w.monday, label: `${weekTitle(i)} (${rangeLabel(w.monday, addDays(w.monday, 6))})` }));

  return (
    <div className="mr-sheet-scrim" role="dialog" aria-modal="true" aria-label="Dienstplan">
      <div className="mr-sheet mr-shift-page" data-testid="shift-plan-page">
        <div className="mr-shift-page__head">
          <button type="button" className="mr-icon-btn" onClick={close} aria-label="Zurück">
            <ChevronLeft aria-hidden size={22} strokeWidth={ICON_STROKE} />
          </button>
          <div className="mr-shift-page__titles">
            <h1 className="mr-shift-page__title">Dienstplan</h1>
            <div className="mr-shift-page__meta">Die nächsten {Math.round(horizon / 7)} Wochen · ein Tipp je Tag</div>
          </div>
        </div>

        <div className="mr-shift-page__body">
          {state.entriesStatus === "unavailable" ? (
            <div className="mr-shift-hint" role="status">
              <Info aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
              <span>{SHIFT_UNAVAILABLE_NOTE}</span>
            </div>
          ) : null}

          <section className="mr-shift-section" aria-label="Schnell eintragen">
            <div className="mr-action-list">
              <button type="button" className="mr-action-row" aria-expanded={quickOpen} onClick={() => setQuickOpen((v) => !v)}>
                <span className="mr-action-row__icon">
                  <Repeat aria-hidden size={18} strokeWidth={ICON_STROKE} />
                </span>
                <span className="mr-action-row__label">Rotation oder Woche übernehmen</span>
                <span className="mr-action-row__value">{quickOpen ? "Schließen" : "Öffnen"}</span>
              </button>
            </div>
            {quickOpen ? (
              <div className="mr-shift-panel">
                <label className="mr-shift-field" htmlFor="shift-pattern">
                  Rotationsmuster (F = Früh, S = Spät, N = Nacht, – = frei)
                  <input
                    id="shift-pattern"
                    className="mr-shift-pattern"
                    value={pattern}
                    onChange={(e) => setPattern(e.target.value)}
                    placeholder="F F S S N N – – –"
                    autoCapitalize="characters"
                    autoCorrect="off"
                    spellCheck={false}
                  />
                </label>
                <div className="mr-shift-keys" role="group" aria-label="Muster eingeben">
                  {[
                    ["F", "Früh"],
                    ["S", "Spät"],
                    ["N", "Nacht"],
                    ["–", "Frei"],
                  ].map(([token, label]) => (
                    <button key={token} type="button" className="mr-shift-key" aria-label={`${label} anhängen`} onClick={() => insertKey(token)}>
                      {token}
                    </button>
                  ))}
                  <button type="button" className="mr-shift-key" aria-label="Letzten Tag entfernen" onClick={() => setPattern((p) => p.trim().split(/\s+/).slice(0, -1).join(" "))}>
                    Zurück
                  </button>
                </div>
                {pattern.trim() && !parsed.ok ? (
                  <p className="mr-shift-status mr-shift-status--error" role="alert">
                    {parsed.invalid.length > 0 ? `Unbekannt: ${parsed.invalid.join(", ")}. Erlaubt sind F, S, N und –.` : "Das Muster ist zu lang."}
                  </p>
                ) : null}
                <div className="mr-shift-row2">
                  <label className="mr-shift-field">
                    Ab
                    <select className="mr-shift-select" value={patternStart} onChange={(e) => setPatternStart(e.target.value)}>
                      {days.map((d) => (
                        <option key={d} value={d}>
                          {dayLabelDe(d)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="mr-shift-field">
                    Für
                    <select className="mr-shift-select" value={patternWeeks} onChange={(e) => setPatternWeeks(Number(e.target.value))}>
                      {[1, 2, 3, 4].map((n) => (
                        <option key={n} value={n}>
                          {n} {n === 1 ? "Woche" : "Wochen"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <button type="button" className="mr-btn mr-btn--secondary mr-btn--small" onClick={applyPattern} disabled={!parsed.ok}>
                  Muster eintragen
                </button>
                <div aria-hidden style={{ height: 1, background: "var(--line)" }} />
                <label className="mr-shift-field">
                  Woche kopieren
                  <select className="mr-shift-select" value={copySource} onChange={(e) => setCopySource(e.target.value)}>
                    {weekOptions.slice(0, -1).map((o) => (
                      <option key={o.value} value={o.value}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
                <button type="button" className="mr-btn mr-btn--secondary mr-btn--small" onClick={applyCopy}>
                  <Copy aria-hidden size={ICON_SIZE_S} strokeWidth={ICON_STROKE} />
                  Auf die folgenden Wochen übertragen
                </button>
              </div>
            ) : null}
          </section>

          {weeks.map((w, index) => (
            <section key={w.monday} className="mr-shift-week" aria-label={weekTitle(index)}>
              <div className="mr-shift-week__head">
                <span className="mr-shift-week__title">{weekTitle(index)}</span>
                <span className="mr-shift-week__meta">{rangeLabel(w.days[0], w.days[w.days.length - 1])}</span>
              </div>
              {w.days.map((ymd) => {
                const entry = effective(ymd);
                const changed = changedDates.indexOf(ymd) >= 0;
                const label = dayLabelDe(ymd);
                return (
                  <div key={ymd} className={`mr-shift-day${ymd === todayYmd ? " is-today" : ""}`} role="group" aria-label={label} data-testid={`shift-day-${ymd}`}>
                    <div className="mr-shift-day__top">
                      <span className="mr-shift-day__date">
                        {label.slice(0, 2)} <small>{Number(ymd.slice(8, 10))}.</small>
                      </span>
                      <span className={`mr-shift-day__value${entry ? " is-set" : ""}`}>{entrySummary(entry)}</span>
                      {changed ? <span className="mr-shift-day__changed">geändert</span> : null}
                    </div>
                    <div className="mr-shift-chips">
                      {CHIP_KINDS.map((kind) => (
                        <button
                          key={kind}
                          type="button"
                          className={`mr-shift-chip${entry?.kind === kind ? " is-on" : ""}`}
                          aria-pressed={entry?.kind === kind}
                          onClick={() => pickKind(ymd, kind)}
                        >
                          {SHIFT_KIND_LABEL[kind]}
                        </button>
                      ))}
                    </div>
                    {entry?.kind === "custom" ? (
                      <div className="mr-shift-custom">
                        <input
                          type="time"
                          className="mr-shift-time"
                          aria-label={`Beginn am ${label}`}
                          value={entry.start ?? ""}
                          onChange={(e) => setCustomTime(ymd, "start", e.target.value)}
                        />
                        <span aria-hidden className="mr-shift-defaults__dash">
                          –
                        </span>
                        <input
                          type="time"
                          className="mr-shift-time"
                          aria-label={`Ende am ${label}`}
                          value={entry.end ?? ""}
                          onChange={(e) => setCustomTime(ymd, "end", e.target.value)}
                        />
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </section>
          ))}

          <section className="mr-shift-section" aria-label="Standardzeiten">
            <div className="mr-action-list">
              <button type="button" className="mr-action-row" aria-expanded={defaultsOpen} onClick={() => setDefaultsOpen((v) => !v)}>
                <span className="mr-action-row__label">Standardzeiten</span>
                <span className="mr-action-row__value">{defaultsOpen ? "Schließen" : "Ändern"}</span>
              </button>
            </div>
            {defaultsOpen ? (
              <div className="mr-shift-panel">
                <div className="mr-shift-defaults">
                  {DEFAULT_KINDS.map((kind) => {
                    const t = defaultTimesFor(kind, defaults);
                    return (
                      <div key={kind} className="mr-shift-defaults__row">
                        <span className="mr-shift-defaults__label">{SHIFT_KIND_LABEL[kind]}</span>
                        <input type="time" className="mr-shift-time" aria-label={`${SHIFT_KIND_LABEL[kind]} Beginn`} value={t.start} onChange={(e) => updateDefault(kind, "start", e.target.value)} />
                        <span aria-hidden className="mr-shift-defaults__dash">
                          –
                        </span>
                        <input type="time" className="mr-shift-time" aria-label={`${SHIFT_KIND_LABEL[kind]} Ende`} value={t.end} onChange={(e) => updateDefault(kind, "end", e.target.value)} />
                      </div>
                    );
                  })}
                </div>
                <p className="mr-caption">Gilt für neue Einträge. Endet ein Dienst vor seinem Beginn, endet er am nächsten Morgen.</p>
              </div>
            ) : null}
          </section>
        </div>

        <div className="mr-shift-foot">
          {status ? (
            <p className={`mr-shift-status${status.error ? " mr-shift-status--error" : ""}`} role="status">
              {status.text}
            </p>
          ) : null}
          <div className="mr-shift-foot__buttons">
            <button type="button" className="mr-btn mr-btn--primary" onClick={() => void save()} disabled={saving || changedDates.length === 0}>
              {saving ? "Speichert …" : changedDates.length > 0 ? `Speichern (${changedDates.length})` : "Speichern"}
            </button>
            <button type="button" className="mr-btn mr-btn--secondary" onClick={close}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

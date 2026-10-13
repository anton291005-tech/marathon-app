import { useState, type ReactNode } from "react";
import { CalendarDays, Check, ChevronRight, List, MessageCircle, PencilLine, X } from "lucide-react";
import { ICON_STROKE } from "../../ui/icons";
import { formatKmDe } from "../../ui/formatDe";
import { feelingLabel, formatClock, normalizeFeeling, type SessionFlow } from "./sessionDetailModel";

export type SessionDetailPlan = {
  /** Geplante Distanz; `null` bei Einheiten ohne Distanz (Kraft, Rad nach Zeit). */
  distanceKm: number | null;
  /** „ca. 55 min" — nur wenn aus Distanz und Plan-Tempo berechenbar. */
  durationMin: number | null;
  /** Plan-Tempo; ohne Wert entfällt die Kachel. */
  pace: string | null;
  /** „min/km", wenn das Tempo als Zahl vorliegt; bei Freitext `null`. */
  paceUnit: string | null;
  zone: string | null;
  hrRange: { min: number; max: number } | null;
};

export type SessionDetailResult = {
  actualKm: number | null;
  plannedKm: number | null;
  durationSec: number | null;
  paceSecPerKm: number | null;
  hrBpm: number | null;
  /** Kurzurteil aus dem Health-Abgleich („Im Zielkorridor"). */
  verdict: string | null;
  verdictGood: boolean;
  /** „Apple Health", wenn ein Health-Lauf verknüpft ist. */
  source: string | null;
  feeling: number | null;
  notes: string | null;
};

type SessionDetailSheetProps = {
  /** „Mi, 14. Okt · Woche 1 · Grundlage" */
  meta: string;
  title: string;
  status: "open" | "done" | "skipped";
  /** `null` bei Einheiten ohne Kennzahlen. */
  plan: SessionDetailPlan | null;
  /** Plan-Beschreibung der Einheit. */
  purpose: string | null;
  flow: SessionFlow | null;
  fuelingHints: string[];
  /** Gesetzt, sobald die Einheit erledigt ist: Ist-Werte statt Plan-Ansicht. */
  result: SessionDetailResult | null;
  onClose: () => void;
  /** Ohne Handler keine Zeile „An Kalender anpassen". */
  onAdjustToCalendar?: () => void;
  onDiscussWithCoach: () => void;
  /** Öffnet das Eintragen-Sheet (neu oder zum Bearbeiten). */
  onEnter: () => void;
  onToggleSkip: () => void;
};

const ROW_ICON = { size: 20, strokeWidth: ICON_STROKE, "aria-hidden": true } as const;

function ActionRow({ icon, label, value, expanded, onClick }: {
  icon: ReactNode;
  label: string;
  value?: string | null;
  expanded?: boolean;
  onClick: () => void;
}) {
  return (
    <button type="button" className="mr-action-row" aria-expanded={expanded} onClick={onClick}>
      <span className="mr-action-row__icon">{icon}</span>
      <span className="mr-action-row__label">{label}</span>
      {value ? <span className="mr-action-row__value">{value}</span> : null}
      <span className={expanded ? "mr-action-row__chev is-open" : "mr-action-row__chev"}>
        <ChevronRight aria-hidden size={16} strokeWidth={ICON_STROKE} />
      </span>
    </button>
  );
}

function FlowCard({ flow }: { flow: SessionFlow }) {
  return (
    <div className="mr-flow">
      {flow.rows.map((row) => (
        <div key={row.key} className={row.key === "main" ? "mr-flow__row is-main" : "mr-flow__row"}>
          <span className="mr-flow__dot" aria-hidden />
          <div className="mr-flow__text">
            <div className="mr-flow__name">{row.name}</div>
            {row.sub ? <div className="mr-flow__sub">{row.sub}</div> : null}
          </div>
          <span className="mr-flow__km">{formatKmDe(row.km)} km</span>
        </div>
      ))}
    </div>
  );
}

function ResultCard({ result }: { result: SessionDetailResult }) {
  const { actualKm, plannedKm, durationSec, paceSecPerKm, hrBpm } = result;
  const stats = [
    durationSec != null ? { label: "Zeit", value: formatClock(durationSec), unit: null } : null,
    paceSecPerKm != null ? { label: "Ø Pace", value: formatClock(paceSecPerKm), unit: "/km" } : null,
    hrBpm != null ? { label: "Ø Puls", value: String(Math.round(hrBpm)), unit: "bpm" } : null,
  ].filter(Boolean) as Array<{ label: string; value: string; unit: string | null }>;
  const hasValues = actualKm != null || stats.length > 0;

  if (!hasValues) {
    return (
      <section className="mr-result">
        <p className="mr-caption" style={{ margin: 0 }}>Als erledigt markiert, ohne aufgezeichnete Werte.</p>
      </section>
    );
  }

  const progressPct =
    actualKm != null && plannedKm != null && plannedKm > 0 ? Math.max(0, Math.min(100, (actualKm / plannedKm) * 100)) : null;

  return (
    <section className="mr-result" data-testid="session-result">
      {actualKm != null ? (
        <div className="mr-result__head">
          <div className="mr-result__km">
            {formatKmDe(actualKm)}
            <small> km</small>
          </div>
          {plannedKm != null ? <span className="mr-caption">Plan {formatKmDe(plannedKm)} km</span> : null}
        </div>
      ) : null}
      {progressPct != null ? (
        <div className="mr-progress" style={{ marginTop: 14 }}>
          <div className="mr-progress__bar mr-progress__bar--good" style={{ width: `${progressPct}%` }} />
        </div>
      ) : null}
      {stats.length > 0 ? (
        <div className="mr-result__stats" style={{ gridTemplateColumns: `repeat(${stats.length}, minmax(0, 1fr))`, marginTop: actualKm != null ? 18 : 0 }}>
          {stats.map((stat) => (
            <div key={stat.label}>
              <div className="mr-result__stat-label">{stat.label}</div>
              <div className="mr-result__stat-value">
                {stat.value}
                {stat.unit ? <small> {stat.unit}</small> : null}
              </div>
            </div>
          ))}
        </div>
      ) : null}
      {result.verdict || result.source ? (
        <div className="mr-result__foot">
          {result.verdict && result.verdictGood ? <Check aria-hidden size={16} strokeWidth={2} color="var(--status-good)" /> : null}
          <span style={{ flex: 1 }}>{result.verdict}</span>
          {result.source ? <span className="mr-result__source">{result.source}</span> : null}
        </div>
      ) : null}
    </section>
  );
}

/**
 * Detailansicht einer Einheit: geplant (docs/design-system/mockups/Einheit.dc.html) oder
 * erledigt (Einheit_Erledigt.dc.html). Abschnitte ohne Daten entfallen.
 */
export function SessionDetailSheet({
  meta,
  title,
  status,
  plan,
  purpose,
  flow,
  fuelingHints,
  result,
  onClose,
  onAdjustToCalendar,
  onDiscussWithCoach,
  onEnter,
  onToggleSkip,
}: SessionDetailSheetProps) {
  const [flowOpen, setFlowOpen] = useState(false);
  const done = status === "done" && result != null;
  const feeling = done ? normalizeFeeling(result.feeling) : null;
  const notes = done ? result.notes : null;
  const hasPace = !!plan?.pace;

  return (
    <div onClick={onClose} className="mr-sheet-scrim">
      <div onClick={(e) => e.stopPropagation()} className="mr-sheet" role="dialog" aria-modal="true" aria-label={title}>
        <div className="mr-sheet__grabber" aria-hidden><span /></div>
        <div className={done ? "mr-sheet__body mr-sheet__body--flush" : "mr-sheet__body"}>
          <header className="mr-sheet__head">
            <div style={{ minWidth: 0 }}>
              <div className="mr-sheet__meta">
                <span>{meta}</span>
                {done ? (
                  <span className="mr-chip mr-chip--plain mr-chip--small mr-chip--good">
                    <Check aria-hidden size={12} strokeWidth={2.5} />
                    Erledigt
                  </span>
                ) : status === "skipped" ? (
                  <span className="mr-chip mr-chip--plain mr-chip--small">Ausgelassen</span>
                ) : null}
              </div>
              <h1 className="mr-sheet__title">{title}</h1>
            </div>
            <button type="button" className="mr-icon-btn" aria-label="Schließen" onClick={onClose}>
              <X aria-hidden size={18} strokeWidth={2} />
            </button>
          </header>

          {done ? (
            <>
              <ResultCard result={result} />

              {feeling != null || notes ? (
                <section>
                  <h2 className="mr-sheet__h2">Dein Eintrag</h2>
                  <div className="mr-entry" data-testid="session-entry">
                    {feeling != null ? (
                      <div className="mr-entry__row">
                        <span>Gefühl</span>
                        <span className="mr-entry__value">
                          {feeling}
                          <small> / 5 · {feelingLabel(feeling)}</small>
                        </span>
                      </div>
                    ) : null}
                    {notes ? <p className="mr-entry__notes">{notes}</p> : null}
                  </div>
                </section>
              ) : null}

              {flow && flowOpen ? <FlowCard flow={flow} /> : null}

              <div className="mr-action-list">
                {flow ? (
                  <ActionRow
                    icon={<List {...ROW_ICON} />}
                    label="Geplanter Ablauf"
                    value={flow.summary}
                    expanded={flowOpen}
                    onClick={() => setFlowOpen((open) => !open)}
                  />
                ) : null}
                <ActionRow icon={<MessageCircle {...ROW_ICON} />} label="Mit Coach besprechen" onClick={onDiscussWithCoach} />
                <ActionRow icon={<PencilLine {...ROW_ICON} />} label="Eintrag bearbeiten" onClick={onEnter} />
              </div>
            </>
          ) : (
            <>
              {plan ? (
                <div className={hasPace ? "mr-sheet__tiles mr-sheet__tiles--3" : "mr-sheet__tiles"}>
                  {plan.distanceKm != null ? (
                    <div className="mr-sheet__tile">
                      <span className="mr-label">Distanz</span>
                      <span className="mr-sheet__tile-value">
                        {formatKmDe(plan.distanceKm)}
                        <small> km</small>
                      </span>
                      {plan.durationMin != null ? <span className="mr-sheet__tile-foot">ca. {plan.durationMin} min</span> : null}
                    </div>
                  ) : null}
                  {plan.pace ? (
                    <div className="mr-sheet__tile">
                      <span className="mr-label">Tempo</span>
                      <span className="mr-sheet__tile-value mr-sheet__tile-value--word">{plan.pace}</span>
                      {plan.paceUnit ? <span className="mr-sheet__tile-foot">{plan.paceUnit}</span> : null}
                    </div>
                  ) : null}
                  {plan.zone ? (
                    <div className="mr-sheet__tile">
                      <span className="mr-label">Intensität</span>
                      <span className="mr-sheet__tile-value mr-sheet__tile-value--word">{plan.zone}</span>
                      {plan.hrRange ? <span className="mr-sheet__tile-foot">{plan.hrRange.min}–{plan.hrRange.max} bpm</span> : null}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {purpose ? (
                <section>
                  <h2 className="mr-sheet__h2">Worum es geht</h2>
                  <p className="mr-sheet__text">{purpose}</p>
                </section>
              ) : null}

              {flow ? (
                <section>
                  <h2 className="mr-sheet__h2">Ablauf</h2>
                  <FlowCard flow={flow} />
                </section>
              ) : null}

              {fuelingHints.length > 0 ? (
                <section>
                  <h2 className="mr-sheet__h2">Verpflegung</h2>
                  {fuelingHints.map((hint) => (
                    <p key={hint} className="mr-sheet__text mr-sheet__text--stacked">{hint}</p>
                  ))}
                </section>
              ) : null}

              <div className="mr-action-list">
                {onAdjustToCalendar ? (
                  <ActionRow icon={<CalendarDays {...ROW_ICON} />} label="An Kalender anpassen" onClick={onAdjustToCalendar} />
                ) : null}
                <ActionRow icon={<MessageCircle {...ROW_ICON} />} label="Mit Coach besprechen" onClick={onDiscussWithCoach} />
              </div>
            </>
          )}
        </div>

        {done ? null : (
          <div className="mr-sheet__foot">
            <button type="button" className="mr-btn mr-btn--primary" onClick={onEnter}>
              <Check aria-hidden size={18} strokeWidth={2} />
              Eintragen
            </button>
            <button type="button" className="mr-btn mr-btn--secondary" onClick={onToggleSkip}>
              {status === "skipped" ? "Rückgängig" : "Auslassen"}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

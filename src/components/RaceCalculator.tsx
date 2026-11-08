import { useMemo, useState } from "react";
import { parseTargetTimeToSeconds } from "../appSmartFeatures";
import { HALF_MARATHON_KM, canonicalRaceDistanceKm, raceDistanceKind, raceDistanceName, splitMarksKm, targetTimeExample } from "../raceDistance";
import SurfaceCard from "./SurfaceCard";

function formatRaceTime(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function formatPacePerKm(secondsPerKm: number): string {
  const m = Math.floor(secondsPerKm / 60);
  const s = Math.round(secondsPerKm % 60);
  return `${m}:${String(s).padStart(2, "0")}/km`;
}

type Props = {
  /** Renndistanz des aktiven Plans; ohne Angabe rechnet der Rechner nicht (neutraler Hinweis). */
  raceDistanceKm?: number | null;
  /** Zielzeit des aktiven Plans (hh:mm:ss) als Startwert; leer = „Nur finishen" / kein Ziel. */
  initialTime?: string | null;
};

/** Rechenergebnis für eine Zielzeit über `distanceKm` — pure, damit testbar. */
export function computeRaceSplits(totalSeconds: number, distanceKm: number) {
  const paceSec = totalSeconds / distanceKm;
  const splits = splitMarksKm(distanceKm).map((km) => ({ km, cumulative: formatRaceTime(paceSec * km) }));
  splits.push({ km: distanceKm, cumulative: formatRaceTime(totalSeconds) });
  return {
    pacePerKm: formatPacePerKm(paceSec),
    // Halbmarathon-Zwischenzeit nur im Marathon sinnvoll.
    halfMarathon: raceDistanceKind(distanceKm) === "marathon" ? formatRaceTime(paceSec * HALF_MARATHON_KM) : null,
    splits,
    totalFormatted: formatRaceTime(totalSeconds),
  };
}

/** Parent setzt `key` auf Plan-ID + Distanz, damit ein Planwechsel Eingabe und Splits neu startet. */
export default function RaceCalculator({ raceDistanceKm, initialTime }: Props) {
  const distanceKm = canonicalRaceDistanceKm(raceDistanceKm);
  const distanceName = raceDistanceName(distanceKm);
  const [input, setInput] = useState(initialTime?.trim() ?? "");

  const result = useMemo(() => {
    if (distanceKm == null) return null;
    const total = parseTargetTimeToSeconds(input);
    if (total == null || total <= 0) return null;
    return computeRaceSplits(total, distanceKm);
  }, [input, distanceKm]);

  const hasInput = input.trim() !== "";
  const splitStepLabel = distanceKm != null && distanceKm <= 10.5 ? "1-km-Splits" : "5-km-Splits";

  return (
    <SurfaceCard>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 12 }}>Race Calculator</div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700, marginBottom: 6 }}>
        {distanceName ? `Zielzeit ${distanceName}` : "Zielzeit"}
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder={targetTimeExample(distanceKm)}
        disabled={distanceKm == null}
        style={{
          width: "100%",
          background: "#070b16",
          border: "1px solid rgba(148,163,184,0.14)",
          borderRadius: 12,
          padding: "11px 12px",
          color: "#e2e8f0",
          fontSize: 15,
          fontWeight: 700,
          boxSizing: "border-box",
          marginBottom: 16,
        }}
      />

      {distanceKm == null ? (
        <div style={{ fontSize: 12, color: "#94a3b8" }}>Im Plan fehlt die Renndistanz.</div>
      ) : !result ? (
        hasInput ? (
          <div style={{ fontSize: 12, color: "#f87171" }}>Ungültige Zeit</div>
        ) : (
          <div style={{ fontSize: 12, color: "#94a3b8" }}>Zielzeit eingeben, um Pace und Zwischenzeiten zu sehen.</div>
        )
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ textAlign: "center", padding: "14px 12px", borderRadius: 16, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)" }}>
            <div style={{ fontSize: 11, color: "#7c8aa5", fontWeight: 700, marginBottom: 6 }}>Pace pro km</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#38bdf8", letterSpacing: "-0.02em" }}>{result.pacePerKm}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Gesamt {result.totalFormatted}</div>
          </div>
          {result.halfMarathon ? (
            <div>
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700, marginBottom: 8 }}>Halbmarathon</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#a855f7" }}>{result.halfMarathon}</div>
              <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>bei {HALF_MARATHON_KM} km</div>
            </div>
          ) : null}
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700, marginBottom: 8 }}>{splitStepLabel}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {result.splits.map((row) => (
                <div
                  key={row.km}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    fontSize: 13,
                    color: "#cbd5e1",
                    padding: "8px 10px",
                    borderRadius: 10,
                    background: "rgba(15,23,42,0.6)",
                  }}
                >
                  <span style={{ color: "#94a3b8" }}>{row.km === distanceKm ? "Ziel" : `${row.km} km`}</span>
                  <span style={{ fontWeight: 700 }}>{row.cumulative}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </SurfaceCard>
  );
}

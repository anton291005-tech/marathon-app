import { useMemo, useState } from "react";
import { parseTargetTimeToSeconds } from "../appSmartFeatures";
import SurfaceCard from "./SurfaceCard";

const MARATHON_KM = 42.195;
const HALF_KM = 21.0975;

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

export default function RaceCalculator() {
  const [input, setInput] = useState("2:50:00");

  const result = useMemo(() => {
    const total = parseTargetTimeToSeconds(input);
    if (total == null || total <= 0) {
      return null;
    }
    const paceSec = total / MARATHON_KM;
    const halfTime = (total / MARATHON_KM) * HALF_KM;
    const splits: { km: number; cumulative: string }[] = [];
    for (let km = 5; km < MARATHON_KM; km += 5) {
      const cumSec = paceSec * km;
      splits.push({ km, cumulative: formatRaceTime(cumSec) });
    }
    splits.push({ km: MARATHON_KM, cumulative: formatRaceTime(total) });
    return {
      pacePerKm: formatPacePerKm(paceSec),
      halfMarathon: formatRaceTime(halfTime),
      splits,
      totalFormatted: formatRaceTime(total),
    };
  }, [input]);

  return (
    <SurfaceCard>
      <div style={{ fontSize: 16, fontWeight: 800, color: "#fff", marginBottom: 12 }}>Race Calculator</div>
      <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700, marginBottom: 6 }}>
        Zielzeit
      </div>
      <input
        type="text"
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="2:50:00"
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

      {!result ? (
        <div style={{ fontSize: 12, color: "#f87171" }}>Ungültige Zeit</div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div style={{ textAlign: "center", padding: "14px 12px", borderRadius: 16, background: "rgba(56,189,248,0.08)", border: "1px solid rgba(56,189,248,0.2)" }}>
            <div style={{ fontSize: 11, color: "#7c8aa5", fontWeight: 700, marginBottom: 6 }}>Pace pro km</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#38bdf8", letterSpacing: "-0.02em" }}>{result.pacePerKm}</div>
            <div style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>Gesamt {result.totalFormatted}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700, marginBottom: 8 }}>Halbmarathon</div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#a855f7" }}>{result.halfMarathon}</div>
            <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>bei {HALF_KM} km</div>
          </div>
          <div>
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: "0.08em", color: "#7c8aa5", fontWeight: 700, marginBottom: 8 }}>5-km-Splits</div>
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
                  <span style={{ color: "#94a3b8" }}>{row.km === MARATHON_KM ? "Ziel" : `${row.km} km`}</span>
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

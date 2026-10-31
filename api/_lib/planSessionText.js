"use strict";

/**
 * Bausteine und Nutzertext einer Einheit. Die km einer Intervall-/Tempo-Einheit sind die Summe ihrer Bausteine
 * (Aufwärmen, Wiederholungen, Trabpausen, Tempoblock, Auslaufen), und Titel/Beschreibung werden daraus erzeugt —
 * nie aus Claudes Freitext. Das Textformat entspricht dem, was der Client lesen kann
 * (src/sessionDistance.ts parseStructuredWorkoutSpecFromDesc), die Struktur steht zusätzlich in `structured`
 * (StructuredWorkoutSpec).
 *
 * Eine Zonensprache: Zone 1–5 wie in der App. Kein GA1/GA2, keine %HFmax, keine bpm im Nutzertext.
 */

const round1 = (x) => Math.round(x * 10) / 10;

// Trabpause zwischen Intervall-Wiederholungen: 90 s bei ~5:00/km, wie der Client-Parser sie umrechnet
// (RECOVERY_JOG_PACE_SEC_PER_KM = 300 in src/sessionDistance.ts).
const PAUSE_SECONDS = 90;
const PAUSE_KM = PAUSE_SECONDS / 300;

/** Zone je Einheitentyp; Entlastungswochen: lockere Läufe in Zone 1. */
const ZONE_FOR_SESSION = {
  easy: "Zone 2",
  long: "Zone 2",
  tempo: "Zone 3–4",
  interval: "Zone 4–5",
  race: "Zone 4–5",
};
const RECOVERY_ZONE = "Zone 1";

function zoneForSession(sessionType, isRecoveryWeek) {
  if (sessionType === "easy" && isRecoveryWeek) return RECOVERY_ZONE;
  return ZONE_FOR_SESSION[sessionType] ?? null;
}

/** Begriffe, die nicht in Nutzertext gehören (GA-Sprache, Prozent-HFmax, bpm, Pulsbereich). */
const BANNED_TEXT = /GA\s?[12]|\bGA\b|HF\s?max|HFmax|bpm|%|Puls|Herzfrequenz|Schl[äa]ge/i;

function fmtKm(km) {
  const value = round1(km);
  return Number.isInteger(value) ? String(value) : String(value).replace(".", ",");
}

/**
 * Dezimalpunkt statt -komma für den parsebaren Text von Intervall/Tempo: src/sessionDistance.ts trennt die
 * Beschreibung an Kommas auf, "5,5 km Tempo" würde zu "5" und "5 km Tempo". Der Parser liest beide Schreibweisen.
 */
function fmtKmParsable(km) {
  return String(round1(km));
}

function structureKm(spec) {
  if (!spec || typeof spec !== "object") return 0;
  let sum = 0;
  if (spec.warmupKm > 0) sum += spec.warmupKm;
  if (spec.cooldownKm > 0) sum += spec.cooldownKm;
  for (const block of spec.intervals ?? []) {
    if (block.reps > 0 && block.distanceKm > 0) sum += block.reps * block.distanceKm;
  }
  if (spec.recoveryJogKm > 0) sum += spec.recoveryJogKm;
  for (const block of spec.steadyBlocksKm ?? []) {
    if (block > 0) sum += block;
  }
  return round1(sum);
}

function repCandidates(raceKm) {
  if (raceKm <= 5) return [0.4, 0.6, 0.8, 1];
  if (raceKm <= 10) return [0.6, 0.8, 1, 1.2, 1.6];
  if (raceKm <= 21.2) return [0.8, 1, 1.6, 2];
  return [1, 1.6, 2, 3];
}

/** Standardstruktur für eine harte Einheit mit etwa `km` Kilometern. */
function buildStructure(sessionType, km, raceKm) {
  const small = km < 9;
  const warmupKm = small ? 1.5 : 2;
  const cooldownKm = small ? 1 : 1.5;
  const work = Math.max(1.5, km - warmupKm - cooldownKm);

  if (sessionType === "tempo") {
    return { warmupKm, cooldownKm, steadyBlocksKm: [round1(work)] };
  }

  const candidates = repCandidates(raceKm);
  let pick = null;
  for (const distanceKm of candidates) {
    const reps = Math.floor((work + PAUSE_KM) / (distanceKm + PAUSE_KM));
    if (reps >= 4 && reps <= 10) pick = { distanceKm, reps };
  }
  if (!pick) {
    const distanceKm = candidates[0];
    const reps = Math.max(2, Math.min(12, Math.floor((work + PAUSE_KM) / (distanceKm + PAUSE_KM))));
    pick = { distanceKm, reps };
  }
  return {
    warmupKm,
    cooldownKm,
    intervals: [{ reps: pick.reps, distanceKm: pick.distanceKm }],
    recoveryJogKm: round1((pick.reps - 1) * PAUSE_KM),
  };
}

/** Setzt Struktur und km einer harten Einheit: die km sind die Summe der Bausteine. */
function shapeHardSession(workout, km, ctx) {
  const structured = buildStructure(workout.sessionType, km, ctx.raceKm);
  return { ...workout, km: structureKm(structured), structured };
}

function isValidStructure(spec, km) {
  return spec && typeof spec === "object" && Math.abs(structureKm(spec) - km) <= 0.05 && structureKm(spec) > 0;
}

const DEFAULT_TITLE = {
  easy: "Lockerer Dauerlauf",
  recovery: "Regenerationslauf",
  long: "Langer Lauf",
  tempo: "Tempodauerlauf",
};

/** Claudes Titel nur übernehmen, wenn er reiner, deutscher Text ohne Zahlen/Pulsbegriffe ist. */
function cleanTitle(title, sessionType) {
  if (!["easy", "long", "tempo"].includes(sessionType)) return null;
  const t = String(title ?? "").trim();
  if (!t || t.length > 40) return null;
  if (!/^[A-Za-zÄÖÜäöüß][A-Za-zÄÖÜäöüß \-&]*$/.test(t)) return null;
  if (BANNED_TEXT.test(t) || /\b(easy|run|taper|long|tempo ?run|ruhetag)\b/i.test(t)) return null;
  return t;
}

/**
 * Titel und Beschreibung einer Einheit aus Typ, km, Struktur und Zone.
 * Rückgabe: { title, desc, structured } — `structured` nur für Intervall/Tempo.
 */
function renderSession(workout, { isRecoveryWeek = false, raceTitle = "Rennen" } = {}) {
  const type = workout.sessionType;
  const zone = zoneForSession(type, isRecoveryWeek);

  if (type === "interval") {
    const spec = workout.structured;
    const block = spec.intervals[0];
    const reps = block.reps;
    return {
      title: `${reps} × ${fmtKm(block.distanceKm)} km Intervalle`,
      desc:
        `${fmtKmParsable(spec.warmupKm)} km WU · ${reps} × ${fmtKmParsable(block.distanceKm)} km (${PAUSE_SECONDS} s Pause) · ` +
        `${fmtKmParsable(spec.cooldownKm)} km CD. ${zone}.`,
      structured: spec,
    };
  }
  if (type === "tempo") {
    const spec = workout.structured;
    return {
      title: cleanTitle(workout.title, "tempo") ?? DEFAULT_TITLE.tempo,
      desc:
        `${fmtKmParsable(spec.warmupKm)} km WU · ${fmtKmParsable(spec.steadyBlocksKm[0])} km Tempo · ` +
        `${fmtKmParsable(spec.cooldownKm)} km CD. ${zone}.`,
      // Bewusst kein `structured`: der Client führt `structured` und die geparste Beschreibung zusammen und
      // hängt dabei steadyBlocksKm aneinander (mergeStructuredWorkoutSpecs) — der Tempoblock würde doppelt zählen.
      // Die Beschreibung ist hier die einzige Quelle, ihr Format liest der Client-Parser exakt zurück.
      structured: null,
    };
  }
  if (type === "long") {
    return {
      title: cleanTitle(workout.title, "long") ?? DEFAULT_TITLE.long,
      desc: `Langer, ruhiger Lauf über ${fmtKm(workout.km)} km in ${zone}.`,
      structured: null,
    };
  }
  if (type === "race") {
    return {
      title: raceTitle,
      desc: `Renntag: ${fmtKm(workout.km)} km. Starte kontrolliert und teile das Rennen ein. Im ersten Drittel eher verhalten.`,
      structured: null,
    };
  }
  if (type === "easy") {
    const recovery = isRecoveryWeek;
    return {
      title: recovery ? DEFAULT_TITLE.recovery : (cleanTitle(workout.title, "easy") ?? DEFAULT_TITLE.easy),
      desc: `Lockerer Dauerlauf über ${fmtKm(workout.km)} km in ${zone}. Du kannst dich dabei noch gut unterhalten.`,
      structured: null,
    };
  }
  return { title: workout.title, desc: workout.desc, structured: workout.structured ?? null };
}

/** Summe der Bausteine laut Beschreibungstext (WU, CD, Tempoblock, Wiederholungen, Trabpausen). */
function kmFromDesc(desc) {
  const num = (v) => Number.parseFloat(String(v).replace(",", "."));
  let sum = 0;
  for (const m of String(desc ?? "").matchAll(/(\d+(?:[.,]\d+)?)\s*km\s*(?:WU|CD|Tempo)\b/g)) sum += num(m[1]);
  for (const m of String(desc ?? "").matchAll(/(\d+)\s*×\s*(\d+(?:[.,]\d+)?)\s*km(?:\s*\((\d+)\s*s\s*Pause\))?/g)) {
    const reps = Number(m[1]);
    sum += reps * num(m[2]);
    if (m[3]) sum += ((reps - 1) * Number(m[3])) / 300;
  }
  return round1(sum);
}

/** Nur eine messbare Pace-Angabe (z. B. "5:30–5:50") bleibt erhalten, Freitext wie "locker" nicht. */
function cleanPace(pace) {
  const p = String(pace ?? "").trim();
  return /^\d{1,2}:\d{2}(\s*[–-]\s*\d{1,2}:\d{2})?(\s*min\/km)?$/.test(p) ? p : null;
}

module.exports = {
  PAUSE_KM,
  PAUSE_SECONDS,
  ZONE_FOR_SESSION,
  RECOVERY_ZONE,
  BANNED_TEXT,
  zoneForSession,
  fmtKm,
  structureKm,
  kmFromDesc,
  buildStructure,
  shapeHardSession,
  isValidStructure,
  renderSession,
  cleanPace,
};

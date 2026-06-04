/**
 * Deterministische Antworten zu App-/Support-/Troubleshooting-Fragen.
 * Reihenfolge aufrufend nach Plan-Mutations (`tryDeterministicCoachResponse`).
 */

import { normalizeText } from "../../ai/intents/resolveSwap";
import { buildActionPreview } from "./actions";
import type { AiAssistantAction, AiAssistantResponse, AiContext } from "./types";

function n(raw: string): string {
  return normalizeText(raw);
}

function navigierenSettingsRace(ctx: AiContext): AiAssistantResponse {
  const action: AiAssistantAction = {
    type: "navigate_to_screen",
    payload: {
      targetScreen: "settings",
      targetScreenLabel: "Einstellungen",
      section: "race_goal",
      sectionLabel: "Zielzeit / Rennziel",
    },
  };
  return {
    mode: "support",
    message:
      "Zielzeit und Renn-Bezug stellst du unter «Einstellungen» ein (Tab unten oder Navigation). Dort findest du das Feld «Zielzeit» (hh:mm:ss) sowie optionale Max-HF. " +
      "Den strukturierten Trainingsplan mit Renn-Datum passt du über den AI Coach an (z. B. neuer Marathon-Termin) — immer mit Bestätigungskarte.",
    action: { ...action, preview: buildActionPreview(action, ctx) },
  };
}

function navigierenPerformance(ctx: AiContext): AiAssistantResponse {
  const action: AiAssistantAction = {
    type: "navigate_to_screen",
    payload: {
      targetScreen: "performance",
      targetScreenLabel: "Leistung",
    },
  };
  return {
    mode: "navigator",
    message: "Unter «Leistung» siehst du Distanzen, Trends und die Zuordnung zu Apple-Health-Läufen (wenn verbunden).",
    action: { ...action, preview: buildActionPreview(action, ctx) },
  };
}

function formatDataSummary(ctx: AiContext): string {
  const snap = ctx.coachSnapshot;
  const logKeys = ctx.logs && typeof ctx.logs === "object" ? Object.keys(ctx.logs).length : 0;
  const planSessions = ctx.plan.reduce((a, w) => a + (w.s?.length ?? 0), 0);
  const target = ctx.goals?.targetTime?.trim() || "—";
  const mhr = ctx.maxHeartRateBpm != null && Number.isFinite(ctx.maxHeartRateBpm) ? `${ctx.maxHeartRateBpm} bpm` : "nicht gesetzt";
  const race = ctx.raceDateIso ? new Date(ctx.raceDateIso).toLocaleDateString("de-DE") : "kein Renn-Datum im Plan erkannt";
  const lines = [
    `**Lokal gespeicherte Übersicht**`,
    `- Trainingsplan: ${ctx.plan.length} Wochen, ${planSessions} Einheiten (SSOT: training_plan_v2 + optionale Patches).`,
    `- Session-Logs: ${logKeys} Einträge (marathonLogs).`,
    `- Zielzeit: ${target} · optionale Max-HF: ${mhr}.`,
    `- Renn-Datum (aus Plan): ${race}.`,
  ];
  if (snap) {
    lines.push(
      `- Letzte 30 Tage: ${snap.last30Days.completedPlanSessions} Plan-Einheiten als erledigt markiert; ${snap.last30Days.healthRunsRunning} Lauf-Workouts aus Health, ca. ${snap.last30Days.healthRunningKmRounded} km Lauf-Distanz aus Health in diesem Fenster.`,
      `- Apple Health: verbunden=${snap.appleHealth.connected ? "ja" : "nein"}, HealthKit verfügbar=${snap.appleHealth.kitAvailable === null ? "unbekannt" : snap.appleHealth.kitAvailable ? "ja" : "nein"}.`,
      `- Plattform: ${snap.platform}.`,
    );
    if (snap.adherence) {
      lines.push(`- Plan & Umsetzung (nur fällige Einheiten bis heute): ${snap.adherence.score}% — ${snap.adherence.band}.`);
    }
    lines.push(`- Typische Speicher-Keys: ${snap.localStorageKeysHint.slice(0, 8).join(", ")} …`);
  } else {
    lines.push(`- Hinweis: Momentaufnahme der Laufzeit konnte nicht gebaut werden — siehe Liste oben.`);
  }
  lines.push(
    `Es gibt **kein Cloud-Kundenkonto** in dieser Version: deine Daten liegen auf dem Gerät (und optional verteiltes Log-Backing, falls aktiviert).`,
  );
  return lines.join("\n");
}

/** Erkennung Support-vs-Training: keine Überlagerung bei klaren Swap-/Injury-Keywords. */
function looksPureTrainingMutation(t: string): boolean {
  if (/\b(tausch|vertausch|swap|streich\w*|entfern.*rad|injury|verletz\w*|volumen.*\d|prozent|\b taper\b)\b/.test(t)) return true;
  if (/\b(neuer plan|marathon.*(sep|okt|nov|dez|jan|\d{4}))\b/.test(t)) return true;
  return false;
}

export function trySupportCoachResponse(raw: string, ctx: AiContext): AiAssistantResponse | null {
  const t = n(raw);
  if (!t || looksPureTrainingMutation(t)) return null;

  // --- Navigation & Kontoebene ---
  if (
    (/\b(zielzeit|rennziel|ziel renne|race goal)\b/.test(t) && /\b(ander|andern|einstellen|wie| wo )\b/.test(t)) ||
    /\bzielzeit\s+einstellen\b/.test(t)
  ) {
    return navigierenSettingsRace(ctx);
  }

  // --- Daten & Export ---
  if (
    (/\b(meine daten|gespeicherten daten|daten gespeicher|welche daten|datenubersicht|was speicher)\b/.test(t) ||
      (/\bdaten\b/.test(t) && /\b(ubersicht|uberblick|alles zeig)\b/.test(t))) &&
    /\b(datenschutz|privacy)\b/.test(t) === false
  ) {
    return { mode: "support", message: formatDataSummary(ctx) };
  }

  if (/\bdatenschutz\b/.test(t) || /\bprivacy\b/.test(t) || /\b(personenbezogene daten)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Datenschutz:** Trainings-, Log- und Plandaten werden **primär lokal** gehalten (Gerät oder diese WebApp). " +
        "Wenn eine Cloud-KI aktiv ist, werden strukturierte Coach-Kontextpakete an den Konfigurations-Server geschickt, damit Antworten personalisiert sind — ohne dass du Daten manuell weiterleiten musst. **Export:** Einstellungen → Backup JSON; **alles entfernen:** App-Daten leeren oder App deinstallieren (je nach Plattform).",
    };
  }

  if (/\b(export|backup|json)\b/.test(t) && /\b(trainings|training|logs|daten)\b/.test(t)) {
    const actionEx: AiAssistantAction = {
      type: "navigate_to_screen",
      payload: { targetScreen: "settings", targetScreenLabel: "Einstellungen" },
    };
    return {
      mode: "support",
      message:
        "**Export:** Einstellungen → Backup-Bereich → JSON exportieren — darin sind die Session-Logs. Der strukturierte Plan liegt separat unter `training_plan_v2` im Gerätespeicher. " +
        "Einen **native PDF-Export** gibt es nicht (Workaround: Wochenansicht Screenshots oder selbst aus JSON drucken).",
      action: { ...actionEx, preview: buildActionPreview(actionEx, ctx) },
    };
  }

  if (/\bpdf\b/.test(t) && /\b(export|plan|train)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "Es gibt keinen eingebauten PDF-Export. Nutze Backup JSON für Logs oder die Wochen-/Übersicht-Ansicht visuell (Screenshot/Drucken aus dem Browser).",
    };
  }

  // --- Konto / Abo (truthful for this codebase) ---
  if (/\b(email|e-mail|passwort|login|nutzerkonto|account)\b/.test(t) && /\b(ander|andern|zurucksetz|loschen|reset)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Konto / Profil:** Es gibt **kein klassisches Login** und keine zentrale Passwort-Verwaltung in dieser App — keine Server-Kontodaten zum Zurücksetzen. Alles liegt **auf dem Gerät**. Profilfelder setzt du hier im Coach zurück (Aktion «Profil zurücksetzen» bestätigen) oder du leerst die Einstellungen manuell. Vor einem vollständigen Daten-Sweep: **Einstellungen → Backup JSON** exportieren.",
    };
  }

  if (/\b(abo|abonnement|subscription|premium|zahlung|kundig|kuendig|kündig)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Abo / Käufe:** Diese Coaching-Oberfläche hat **keine eingebaute Abo- oder Kaufverwaltung** — ich kann hier weder Zahlungen anzeigen noch Käufe kündigen oder ändern. Training, Plan-Struktur und alle Einstellungen steuerst du weiter vollständig **in dieser App**. Technisch liegen Kauf- und Abo-Status außerhalb dieses Screens; ich kann dir trotzdem beim Plan, bei Einheiten und bei Daten-Export weiterhelfen — sag einfach, was du erreichen willst.",
    };
  }

  if (/\bprofil\b/.test(t) && (/\bzurucksetz/.test(t) || /\breset\b/.test(t) || /\bwerkseinstellung\b/.test(t) || /\bstandard\b/.test(t))) {
    const action: AiAssistantAction = {
      type: "update_user_preferences",
      payload: { resetProfile: true },
    };
    return {
      mode: "support",
      message:
        "Ich kann deine **profilbezogenen Einstellungen** (Zielzeit + optionale Max-HF) hier auf Standard zurücksetzen — bitte kurz bestätigen. Hinweis: Trainingsplan und Logs bleiben unberührt.",
      action: { ...action, preview: buildActionPreview(action, ctx) },
    };
  }

  // --- Apple Health ---
  if (/\b(apple health|healthkit|gesundheit|health synch|sync)\b/.test(t) && /\b(geht nicht|nicht sync|problem|kaputt|warum nicht| keine daten)\b/.test(t)) {
    const snap = ctx.coachSnapshot;
    const ios = snap?.platform === "ios";
    const connected = snap?.appleHealth.connected;
    const kit = snap?.appleHealth.kitAvailable;
    const tail =
      !ios
        ? "Apple Health ist nur auf **iOS** relevant — im Web nutzt du Import/Logs ohne HealthKit."
        : kit === false
          ? "**HealthKit** meldet hier «nicht verfügbar» — nur echtes iPhone, kein Simulator-Limit umgehen."
          : connected
            ? "Laut dieser App ist die Verbindung **gesetzt** — tippe unter Einstellungen auf «Aktivitäten aktualisieren». Prüfe, ob Workouts als **Lauf** typisiert sind; Rad/Cross wirken anders im Filter."
            : "Noch **nicht verbunden** — Einstellungen → «Apple Health verbinden», Berechtigungen für Workouts/Distanz erteilen, dann Aktualisieren.";
    const actionAh: AiAssistantAction = {
      type: "navigate_to_screen",
      payload: { targetScreen: "settings", targetScreenLabel: "Einstellungen" },
    };
    return {
      mode: "support",
      message: `**Apple Health / Sync**\n${tail}\n\nÜber «Einstellungen» kannst du verbinden und Aktivitäten aktualisieren; unter «Leistung» siehst du die Zuordnung und Trends.`,
      action: { ...actionAh, preview: buildActionPreview(actionAh, ctx) },
    };
  }

  // --- Kilometer / Leistung ---
  if (
    (/\b(kilometer|km|distanz|gelaufen)\b/.test(t) && /\b(letzt|vergang|monat|30 tag|dreißig)\b/.test(t)) ||
    (/\b(wie viel|wie viele)\b/.test(t) && /\b(km|kilometer)\b/.test(t))
  ) {
    const snap = ctx.coachSnapshot;
    const km = snap?.last30Days.healthRunningKmRounded ?? 0;
    const runs = snap?.last30Days.healthRunsRunning ?? 0;
    const done = snap?.last30Days.completedPlanSessions ?? 0;
    const perf = navigierenPerformance(ctx);
    return {
      mode: "support",
      message:
        `In den **letzten 30 Kalendertagen** (lokal): **${km} km** aus Apple-Health-**Lauf**-Workouts (${runs} Workouts), dazu **${done}** geplante Einheiten im Plan als erledigt markiert. ` +
        `Exakter Monatsfilter ist Geräte-kalenderbasiert — für Details öffne «Leistung».`,
      action: perf.action,
    };
  }

  if (/\b(wo finde|wo sehe|zeig mir).*\b(km|kilometer|distanz|gelaufen)\b/.test(t) && !/\bletzt|monat\b/.test(t)) {
    return navigierenPerformance(ctx);
  }

  // --- Zonen / Methodik ---
  if (/\b(zone\s*2|zone2|zwei)\b/.test(t) && /\b(zone|training|herz|hf)\b/.test(t)) {
    const mhr = ctx.maxHeartRateBpm;
    const z2 =
      mhr != null && Number.isFinite(mhr)
        ? `Mit deiner hinterlegten Max-HF **${mhr} bpm** gilt grob **Zone 2 ≈ ${Math.round(mhr * 0.65)}–${Math.round(mhr * 0.75)} bpm** (Daumenregel 65–75 %).`
        : "Ohne Max-HF in den Einstellungen: **Zone 2** ist typisch **leichtes Gesprächstempo** / ca. **65–75 % HFmax** — trage optional deine Max-HF ein für konkretere Zonen.";
    return {
      mode: "coach",
      message:
        `${z2} Zone 2 baut aerobe Basis und Erholung; harte Einheiten nicht «in Zone 2 reindrücken».`,
    };
  }

  if (/\b(wie werden|berechn).*\b(zonen|hf|herzfrequenz)\b/.test(t)) {
    const mhr = ctx.maxHeartRateBpm;
    return {
      mode: "support",
      message:
        (mhr != null && Number.isFinite(mhr)
          ? `Du hast **${mhr} bpm** Max-HF hinterlegt — daraus leiten die App und der Coach prozentuale Zielbereiche ab (u. a. Session-Hinweise). `
          : "Ohne Max-HF arbeitet die App mit **qualitativen Tempo-Hinweisen** statt fester HF-Zonen. ") +
        "Es ersetzt kein Leistungsdiagnostik-Labor — für enge Zonen nutze Feldtest oder Laborsport.",
    };
  }

  // --- Troubleshooting ---
  if (/\b(absturz|crash|schliesst|schließt|hängt)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Abstürze:** App komplett beenden und neu öffnen, WebView/OS aktuell halten, freien Speicher prüfen. Tritt der Absturz beim Loggen eines Laufs auf: zuerst **Einstellungen → Backup JSON** sichern, dann neu starten. Wenn das wiederkehrt: Tab wechseln, erneut versuchen, und schreib mir, **welcher Button** oder **welche Liste** vor dem Crash aktiv war — ich schlage dir den nächsten sicheren Workflow Schritt für Schritt vor, alles hier im Chat.",
    };
  }
  if (/\b(gps)\b/.test(t) && /\b(falsch|kaputt|ging nicht|kein)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**GPS:** Die App selbst ist **kein primärer GPS-Recorder** — Distanz/Tempo kommen aus **Apple Health** (andere Apps) oder manueller Eingabe beim Log. Wenn Garmin/Apple Maps abweichen: andere App verwenden oder Werte nachbearbeiten im Session-Log.",
    };
  }
  if (/\b(pace|tempo)\b/.test(t) && /\b(falsch|stimmt nicht|komisch)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Tempo-Anzeige:** Prüfe, ob die Distanz aus Health stammt und zur Plan-Session passt (Leistung → Zuordnung). Manuell geloggte km überschreiben die Berechnung. Rundungs-Unterschiede sind normal.",
    };
  }
  if (/\b(benachrichtig|notification|push)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Benachrichtigungen:** Diese Codebasis enthält **keine Push-Infrastruktur** — es gibt keine app-internen Erinnerungen per Push. Für Erinnerungen nutze Kalender-/Watch-Apps parallel.",
    };
  }
  if (/\b(plan)\b/.test(t) && /\b(weg|verschwunden|leer|reload)\b/.test(t)) {
    return {
      mode: "support",
      message:
        "**Trainingsplan fehlt:** Der Plan liegt in `training_plan_v2`. Leere Daten (Browser-Private-Modus, anderer Browser, Daten gelöscht) zeigen einen leeren Stand — restore nur wenn du Backup/Export hast. Prüfe, ob ein **Coach-Neuplan** zuletzt bestätigt wurde.",
    };
  }

  return null;
}

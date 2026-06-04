/**
 * Static app knowledge for the AI Coach (derived from this codebase). Keeps answers self-contained inside the product.
 */

export const COACH_APP_KNOWLEDGE_VERSION = "2026-05-03";

/** Full reference (local coach / tests). */
export const COACH_APP_KNOWLEDGE_MARKDOWN = `
# Marathon App — interne Wissensbasis (${COACH_APP_KNOWLEDGE_VERSION})

## Navigation & Hauptfunktionen
- **Start (Home)**: Tagesfokus, nächste Einheit, Recovery-/Coach-Kurzinfos, Link zum AI Coach.
- **Woche**: Wochenplan mit allen Sessions (Typ, Distanz, Beschreibung); Tap auf Einheit öffnet Details/Log.
- **Leistung**: Auswertungen, Kilometer, Trends, Zuordnung zu Apple-Health-Läufen wo vorhanden.
- **Übersicht**: Phasen-/Wochenüberblick über den gesamten Plan.
- **AI Coach** (Tab „Coach“): Chat für Training, App-Hilfe, Datenübersicht und strukturierte Plan-Aktionen (immer mit Bestätigung bei Planänderungen).
- **Einstellungen**: Zielzeit (Marathon), optionale Max-Herzfrequenz, Apple Health verbinden/aktualisieren, Health-Laufliste, Backup Import/Export.

## Trainingsplan — Speicher & Logik
- Der Plan liegt als **training_plan_v2** (localStorage, persistiert) mit Workouts + Wochenmeta (Phasen wie BASE, BUILD, TAPER …).
- **KI-/Coach-Patches** (**marathonAiPlanPatches**): optionale Überlagerungen auf den Plan (z. B. Verletzungsanpassung). Bei „komplett neuem Plan“ werden Patches verworfen.
- **Logs** (**marathonLogs**): erledigte Einheiten, Feeling, manuelle km, Notes, Verknüpfung zu Health-Workouts (**mwaw26-logs** Remote-Storage wo verfügbar).

## Apple Health (iOS / Capacitor)
- **Verbinden**: Einstellungen → „Apple Health verbinden“ → Berechtigungen für u. a. Workouts, Distanz, Rad-Distanz, Puls, Aktivenergie (siehe App-Code: APPLE_HEALTH_READ_TYPES).
- **Synchronisieren**: Button „Aktivitäten aktualisieren“ lädt Läufe (letzte 7 Tage bzw. erzwungene 3-Tage-Neuabfrage).
- **Typische Probleme**: HealthKit nicht verfügbar (Simulator/ältere Geräte) → nur echtes iOS-Gerät; Berechtigung verweigert → erneut in iOS-Einstellungen erlauben; Workout-Typ nicht „Laufen“ → Zuordnung nur für Lauf-Sessions.
- **Kein integrierter Live-GPS-Recorder**: Distanz/Tempo kommen aus Health-Workouts oder manueller Eingabe im Session-Log.

## Backup, Export, Datenhoheit
- **Export**: Einstellungen → Backup JSON (Download). Enthält aktuell die **Session-Logs** (kein vollständiger Plan im Standard-Backup-Widget — Plan separat in localStorage **training_plan_v2**).
- **Import**: JSON-Backup einspielen → überschreibt Logs (mit Bestätigung durch Dateiauswahl).
- **PDF**: Es gibt **keinen nativen PDF-Export** des Plans. Workaround: Wochen-/Übersichtsansicht anzeigen und Screenshot nutzen, oder Inhalt aus dem JSON-Backup in einem Editor öffnen und von dort drucken — alles ohne separaten Support-Kanal.
- **Account / Anmeldung / Passwort**: Diese App-Version hat **kein Nutzerkonto mit klassischem Login**. Identifikation nur lokal optional (**marathonUserId** in localStorage).
- **Abo / Zahlung**: **Keine integrierte Abo- oder Kaufverwaltung** in dieser Codebasis — es gibt nichts zu kündigen innerhalb der App.
- **Daten löschen**: App deinstallieren oder Browser-/WebView-Daten löschen entfernt localStorage-Einträge. Konkrete Keys u. a.: marathonLogs, marathonPreferences, training_plan_v2, marathonAiPlanPatches, healthRuns, Recovery-Daily, Apple-Health-Flag.

## Datenschutz (kurz, technisch)
- Daten werden **primär lokal** auf dem Gerät gehalten (localStorage; optional Capacitor Remote Storage für Logs).
- Cloud-KI (wenn aktiviert): es werden **strukturierte Kontextpakete** (u. a. Recovery und Plan-/Log-Auszüge je nach Build) an den Konfigurations-Server geschickt, damit Antworten personalisiert sind; lokale Aktionen bleiben weiter im Client.

## Trainingszonen & Prognose
- Optionale **Max-HF** in Einstellungen → HF-Hinweise in Session-Targets (siehe sessionPlanTargets).
- **Zone 2**: typisch ca. 65–75 % HFmax, Gesprächstempo, Grundlage für lange Läufe und aerobe Blöcke.
- **Marathon-Prognose / Zielzeit**: Leistungskarte nutzt Trainingshistorie und Zielzeit aus den Einstellungen — keine medizinische Garantie.

## Bekannte Grenzen
- Keine Push-Benachrichtigungen in dieser Codebasis implementiert.
- Kein separates Ticketsystem — Fragen zur App löst der AI Coach bevorzugt **hier im Chat** mit Navigation und klaren Schritten.
`.trim();

/** Short digest injected into prompts (German). */
export const COACH_KNOWLEDGE_DIGEST = `
APP-KONTEXT (${COACH_APP_KNOWLEDGE_VERSION}): Tabs Home·Woche·Leistung·Übersicht·Coach·Einstellungen.
Plan: localStorage training_plan_v2 + optionale AI-Patches marathonAiPlanPatches. Logs: marathonLogs.
Backup JSON unter Einstellungen (Logs); kein PDF-Export. Kein Login/Abo in dieser Version.
Apple Health: Einstellungen verbinden, dann Aktualisieren; Workouts müssen als Lauf erkannt werden.
Keine Push-Benachrichtigungen. Daten löschen = App/WebView-Daten löschen.
Regeln für dich als Coach: Immer Navigation, konkrete In-App-Schritte oder strukturierte Coach-Aktionen — keine Verweise auf externe Hilfe-Kanäle.
Bei Planänderungen immer erst Bestätigungskarte; bei reinen Fragen keine Action.
`.trim();

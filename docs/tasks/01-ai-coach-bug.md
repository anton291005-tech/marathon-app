# Task 01: AI Coach antwortet nicht

## Status: offen

## Ziel
Diagnostizieren und fixen, warum der AI Coach Chat in der App nicht antwortet.

## Diagnose (zuerst, keine Code-Änderungen)
1. getAiConfig() prüfen — ist OPENAI_API_KEY gesetzt (lokal .env, Vercel Prod Env), 
   REACT_APP_AI_PROVIDER korrekt?
2. generateCoachResponse() in coachBrain.ts — läuft try/catch um openAiGenerate 
   korrekt, wirft was davor eine Exception?
3. mockBrainGenerate() — liefert der Fallback zuverlässig eine message zurück?
4. Frontend-Rendering der Coach-Antwort — Promise nie aufgelöst, State nie gesetzt?
5. Live-Check: npm run start:full starten, per Chrome-Extension localhost:3000 
   öffnen, Coach-Tab öffnen, eine Testfrage stellen, Konsole + Netzwerk-Tab lesen.

Ergebnis: priorisierte Liste der Ursachen mit Datei+Zeile, bevor irgendwas gefixt wird.

## Fix (erst nach Freigabe der Diagnose)
[wird nach Diagnose ergänzt]

## Verifikation
- CI=false npm run build muss grün sein
- Live-Test im Browser: Coach antwortet auf mind. 3 verschiedene Testfragen 
  (Training, App-Hilfe, Datenübersicht)
- git commit + push nicht vergessen

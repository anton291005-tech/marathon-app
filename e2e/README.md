# E2E-Rauchtest (Playwright)

Klickt die echte App im Browser durch (Chromium headless, 390×844): Registrieren → Wizard → Schicht-Modus →
Nutzungsdaten → Feedback → Abmelden/Anmelden → Konto löschen.

```bash
npx playwright install chromium   # einmalig
npm run test:e2e                  # nutzt eine laufende App auf :3000 oder startet `npm run start:full`
```

- Nicht Teil von `npm test` (Jest sieht nur `src/**`) und nicht Teil des Builds.
- Braucht `.env.local` wie die lokale API (`REACT_APP_SUPABASE_URL`, `REACT_APP_SUPABASE_ANON_KEY`,
  `SUPABASE_SERVICE_ROLE_KEY`). Der Service-Role-Schlüssel wird **nur zum Lesen** benutzt (Zeilen prüfen).
- Jeder vollständige Lauf legt **ein** Konto `myrace-e2e-<zeitstempel>@example.com` in dieser Supabase an und
  löscht es im letzten Ablauf über die App. Nach einem Abbruch nutzt der nächste Lauf dasselbe Konto weiter
  (`e2e/.state/`, gitignoriert); `E2E_FRESH=1` erzwingt ein neues. Am Ende listet die Suite übrig gebliebene
  Testkonten mit ID auf.
- `e2e/.state/created-accounts.json` protokolliert alle je angelegten Testkonten. Test 1 legt kein sechstes an
  (Grenze aus dem Auftrag vom 18.11.); wer das Kontingent bewusst neu beginnt, löscht die Datei.
- KI-Einwilligung wird überall abgelehnt, außer im Test „KI-Coach“ (genau eine Frage an den Coach).
- Die Abläufe bauen aufeinander auf (ein Worker, Dateireihenfolge). Einzelne Abläufe: `npm run test:e2e -- -g "7 Einheit"`.
- Konsolenfehler und fehlgeschlagene Netzwerkaufrufe landen in `e2e/.results/findings.json` und in der Ausgabe.
- API-Pfade im Browser: `/api/ai` und `DELETE /api/account` laufen same-origin über den Dev-Proxy an die lokale API
  (`server/index.js`, Code dieses Branches) — `getApiBaseUrl()` ist im Web leer, auch wenn `.env.local`
  `REACT_APP_AI_API_BASE` setzt. Nur die Plan-Erstellung nutzt `REACT_APP_AI_API_BASE` (sonst Production) und fällt
  ohne Antwort auf den lokalen Plan-Kern zurück. Test 11 prüft, dass das Löschen wirklich an die lokale API geht.
- Test 12 prüft den iPhone-Pfad für „Konto löschen“ (CORS der Production-API) und ist als erwarteter Fehler
  markiert, bis der Fix in Production ist.

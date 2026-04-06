# Marathon App

Marathon-/Training-App mit AI Coach, Action Cards und lokalem/mockbasiertem sowie OpenAI-faehigem Antwortpfad.

## Scripts

- `npm start` - nur Frontend (CRA)
- `npm run start:api` - lokaler API-Server (`POST /api/ai`) auf Port `8787` (oder `AI_SERVER_PORT`)
- `npm run start:full` - startet Frontend + API parallel
- `npm test` - Tests
- `npm run build` - Produktionsbuild

## AI Architektur (kurz)

- `src/lib/ai/generateAiResponse.ts` entscheidet zwischen:
  - `mockBrain` (lokal)
  - `openaiBrain` (via `/api/ai`)
- `src/lib/ai/openaiBrain.ts` spricht nur den lokalen API-Endpunkt an
- `server/index.js` ruft OpenAI Responses API serverseitig auf (Key bleibt im Backend)
- `src/lib/ai/actions.ts` fuehrt Aenderungen weiterhin lokal und erst nach User-Bestaetigung aus

## Env Konfiguration

Lege im Projektroot eine `.env` an.

### Frontend (CRA)

- `REACT_APP_AI_PROVIDER=mock` oder `openai`
- `REACT_APP_AI_ENABLED=true|false`
- `REACT_APP_AI_API_BASE=` (optional, Default: leer -> gleicher Host, nutzt Proxy)
- `REACT_APP_AI_MODEL=gpt-4.1-mini` (optional model hint)
- `REACT_APP_AI_TIMEOUT_MS=8000` (optional)

### Backend (`server/index.js`)

- `OPENAI_API_KEY=...` (Pflicht fuer echten OpenAI-Pfad)
- `OPENAI_MODEL=gpt-4.1-mini` (optional, serverseitiger Default)
- `AI_SERVER_PORT=8787` (optional)

## Mock vs OpenAI umstellen

1. **Mock aktiv**:
   - `REACT_APP_AI_PROVIDER=mock`
2. **OpenAI aktiv**:
   - `REACT_APP_AI_PROVIDER=openai`
   - `REACT_APP_AI_ENABLED=true`
   - `OPENAI_API_KEY` gesetzt
   - `npm run start:full`

## Wo der echte OpenAI-Aufruf passiert

- Endpoint: `POST /api/ai`
- Datei: `server/index.js`
- Responses API Aufruf: `client.responses.create(...)`

Du kannst das spaeter 1:1 in ein separates Backend verschieben; Frontend bleibt unveraendert, solange `/api/ai` dasselbe Schema liefert.

## Wie pruefen, ob wirklich OpenAI genutzt wird

1. `REACT_APP_AI_PROVIDER=openai` setzen
2. `OPENAI_API_KEY` setzen
3. `npm run start:full`
4. Health pruefen: `GET http://localhost:8787/api/ai/health`
5. Im Chat testen, z. B.:
   - "Ich kann erst naechsten Donnerstag anfangen"
   - "Ich bin krank"
   - "Mein Rennen wurde verschoben"
   - "Wo finde ich die Einstellungen?"

## Fallback-Verhalten

Wenn OpenAI fehlschlaegt (kein Key, Endpoint down, Parse-Fehler), faellt `generateAiResponse(...)` automatisch auf `mockBrain` zurueck.

Im Chattext wird der Hinweis angehaengt:

- `(Cloud-Antwort war nicht verfuegbar, lokaler Coach aktiv.)`

So bleibt die App immer benutzbar.

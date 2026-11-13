// Supabase-Admin-Mock für `profiles`-Abfragen der KI-Einwilligung (api/_lib/aiConsent.js, Migration 015).
// `consentFrom({ granted })` liefert die `from`-Funktion für `createClient`-Mocks der API-Tests.

const GRANTED_ROW = { ai_consent_at: "2026-11-11T21:00:00.000Z", ai_consent_version: 2 };
const DENIED_ROW = { ai_consent_at: null, ai_consent_version: null };

function consentFrom({ granted = true, row, error = null, throws = false } = {}) {
  const data = row !== undefined ? row : granted ? GRANTED_ROW : DENIED_ROW;
  return jest.fn(() => {
    const chain = {
      select: jest.fn(() => chain),
      eq: jest.fn(() => chain),
      maybeSingle: jest.fn(() => (throws ? Promise.reject(new Error("db down")) : Promise.resolve({ data, error }))),
    };
    return chain;
  });
}

module.exports = { consentFrom, GRANTED_ROW, DENIED_ROW };

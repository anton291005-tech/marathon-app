import { createClient } from "@supabase/supabase-js";

/** CRA (webpack) exposes only `REACT_APP_*` via `process.env` at build time — not `import.meta.env` / `VITE_*`. */
const url = (process.env.REACT_APP_SUPABASE_URL ?? "").trim();
const anonKey = (process.env.REACT_APP_SUPABASE_ANON_KEY ?? "").trim();

/** Avoid hard crash when iOS bundle was built without Supabase env (createClient throws on empty url). */
export const isSupabaseConfigured = url.length > 0 && anonKey.length > 0;

export const supabase = createClient(
  url || "https://localhost.invalid",
  anonKey || "missing-anon-key",
  {
    auth: {
      storage: localStorage,
      persistSession: true,
      autoRefreshToken: true,
    },
  },
);

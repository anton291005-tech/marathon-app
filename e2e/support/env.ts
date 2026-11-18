import path from "path";
import dotenv from "dotenv";

// Dieselbe Umgebung wie die lokale API (`server/index.js` liest `.env`/`.env.local`). Keine Secrets im Repo.
const root = path.resolve(__dirname, "..", "..");
dotenv.config({ path: path.join(root, ".env.local"), quiet: true } as dotenv.DotenvConfigOptions);
dotenv.config({ path: path.join(root, ".env"), quiet: true } as dotenv.DotenvConfigOptions);

function read(name: string): string {
  return (process.env[name] ?? "").trim().replace(/^["']|["']$/g, "");
}

export const ENV = {
  supabaseUrl: read("REACT_APP_SUPABASE_URL").replace(/\/$/, ""),
  anonKey: read("REACT_APP_SUPABASE_ANON_KEY"),
  /** Nur zum LESEN (Prüfungen). Die Suite löscht oder ändert damit nichts. */
  serviceRoleKey: read("SUPABASE_SERVICE_ROLE_KEY"),
  /** API-Basis, die das Frontend nutzt (leer = relativer Pfad über den CRA-Proxy). */
  apiBase: read("REACT_APP_AI_API_BASE").replace(/\/$/, ""),
};

export const HAS_ADMIN_READ = ENV.supabaseUrl !== "" && ENV.serviceRoleKey !== "";

import fs from "fs";
import path from "path";

/** Lauf-Zustand (gitignoriert): Testkonto und Browser-Speicher, damit ein Abbruch kein neues Konto braucht. */
export const STATE_DIR = path.resolve(__dirname, "..", ".state");
export const RESULTS_DIR = path.resolve(__dirname, "..", ".results");
const ACCOUNT_FILE = path.join(STATE_DIR, "account.json");
export const STORAGE_FILE = path.join(STATE_DIR, "storage.json");
const FINDINGS_FILE = path.join(RESULTS_DIR, "findings.json");
const CREATED_FILE = path.join(STATE_DIR, "created-accounts.json");

export type Account = { email: string; password: string; userId?: string; createdAt: string; raceDate?: string; planStart?: string; patternStart?: string; hardDay?: string; movedDay?: string };

function readJson<T>(file: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return fallback;
  }
}
function writeJson(file: string, value: unknown): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

export const loadAccount = (): Account | null => readJson<Account | null>(ACCOUNT_FILE, null);
export const saveAccount = (a: Account): void => writeJson(ACCOUNT_FILE, a);
export function clearAccount(): void {
  for (const f of [ACCOUNT_FILE, STORAGE_FILE]) if (fs.existsSync(f)) fs.rmSync(f);
}
export const hasStorage = (): boolean => fs.existsSync(STORAGE_FILE);

/** Protokoll aller je angelegten Testkonten (höchstens 5 je Auftrag) — nie automatisch gelöscht. */
export function noteCreatedAccount(email: string): void {
  const list = readJson<string[]>(CREATED_FILE, []);
  if (!list.includes(email)) writeJson(CREATED_FILE, [...list, email]);
}
export const createdAccounts = (): string[] => readJson<string[]>(CREATED_FILE, []);

export type Finding = { test: string; kind: "console" | "pageerror" | "requestfailed" | "http"; text: string };
export function appendFindings(items: Finding[]): void {
  if (items.length === 0) return;
  const all = readJson<Finding[]>(FINDINGS_FILE, []);
  writeJson(FINDINGS_FILE, [...all, ...items]);
}
export function resetFindings(): void {
  writeJson(FINDINGS_FILE, []);
}
export const readFindings = (): Finding[] => readJson<Finding[]>(FINDINGS_FILE, []);

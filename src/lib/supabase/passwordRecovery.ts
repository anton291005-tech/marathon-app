function hasRecoveryType(params: URLSearchParams): boolean {
  return params.get("type") === "recovery";
}

function hashParamsFromUrlString(urlString: string): URLSearchParams | null {
  try {
    const urlObj = new URL(urlString);
    const hash = urlObj.hash.replace(/^#/, "");
    if (!hash) return null;
    return new URLSearchParams(hash);
  } catch {
    return null;
  }
}

function recoveryTypeFromUrlString(urlString: string): boolean {
  try {
    const urlObj = new URL(urlString);
    if (hasRecoveryType(urlObj.searchParams)) return true;
    const hashParams = hashParamsFromUrlString(urlString);
    if (hashParams && hasRecoveryType(hashParams)) return true;
  } catch {
    return false;
  }
  return false;
}

/** Tokens from implicit-flow redirect: `#access_token=...&refresh_token=...&type=recovery`. */
export function parseAuthTokensFromUrl(urlString: string): {
  access_token: string;
  refresh_token: string;
  isRecovery: boolean;
} | null {
  const hashParams = hashParamsFromUrlString(urlString);
  if (!hashParams) return null;
  const access_token = hashParams.get("access_token");
  const refresh_token = hashParams.get("refresh_token");
  if (!access_token || !refresh_token) return null;
  return {
    access_token,
    refresh_token,
    isRecovery: hasRecoveryType(hashParams),
  };
}

/** Deep link or browser URL indicates Supabase password recovery (query or hash). */
export function isPasswordRecoveryFromUrl(urlString?: string): boolean {
  if (urlString) return recoveryTypeFromUrlString(urlString);
  if (typeof window === "undefined") return false;
  if (hasRecoveryType(new URLSearchParams(window.location.search))) return true;
  return isPasswordRecoveryHash();
}

/** Supabase recovery links include `#...&type=recovery` or `?type=recovery` in the redirect. */
export function isPasswordRecoveryHash(): boolean {
  if (typeof window === "undefined") return false;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return false;
  return hasRecoveryType(new URLSearchParams(hash));
}

export function clearPasswordRecoveryHash(): void {
  if (typeof window === "undefined") return;
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
}

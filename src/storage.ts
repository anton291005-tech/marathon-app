export type AppStorageValue = {
  value: string;
};

export type AppStorageAPI = {
  get?: (key: string) => Promise<AppStorageValue | null | undefined>;
  set?: (key: string, value: string) => Promise<void>;
};

declare global {
  interface Window {
    storage?: AppStorageAPI;
  }
}

export async function readRemoteStorage(key: string) {
  try {
    return (await window.storage?.get?.(key)) ?? null;
  } catch {
    return null;
  }
}

export async function writeRemoteStorage(key: string, value: string) {
  try {
    await window.storage?.set?.(key, value);
    return true;
  } catch {
    return false;
  }
}

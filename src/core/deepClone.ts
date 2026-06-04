export function deepClone<T>(value: T): T {
  // Plan objects are plain JSON-like data; this is deterministic and works in Jest/older runtimes.
  return JSON.parse(JSON.stringify(value)) as T;
}


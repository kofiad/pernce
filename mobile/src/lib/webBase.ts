/** The path the web export is served under, without a trailing slash: ""
 * at the site root, "/app" on pernce.com (WEB_BASE_URL at build time, which
 * Expo inlines as `process.env.EXPO_BASE_URL`; app.config.ts). Pure so it
 * can be tested; `webBase()` below reads the real value. */
export function normalizeBase(raw: string | undefined): string {
  const trimmed = (raw ?? "").trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
}

/** Where the service worker lives and what it controls. */
export function serviceWorkerPaths(base: string): { url: string; scope: string } {
  return { url: `${base}/sw.js`, scope: `${base}/` };
}

export function webBase(): string {
  return normalizeBase(process.env.EXPO_BASE_URL);
}

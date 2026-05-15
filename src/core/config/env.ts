import Constants from "expo-constants";

function read(key: string, fallback: string): string {
  const fromProc = process.env[key];
  if (fromProc && fromProc.length > 0) return fromProc;
  const fromExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const val = fromExtra[key];
  if (typeof val === "string" && val.length > 0) return val;
  return fallback;
}

// Production URLs as the HARDCODED fallback. We used to fall back to
// `http://10.0.2.2:8000` (Android emulator loopback) which made every
// installed APK throw "Network Error" on every request because:
//   • 10.0.2.2 is unreachable from a real phone
//   • cleartext http:// is blocked by Android's release network policy
// EAS Build runs in the cloud and doesn't read the local `.env`, so
// without the env var being injected (eas.json `env` block / EAS dashboard
// variables) Metro's `process.env.EXPO_PUBLIC_API_URL` is `undefined`
// and the fallback wins. Hardcoding the production host below means a
// fresh APK install hits api.setupfx.io even before any OTA / rebuild —
// the env var, when present (`.env` for local dev, `eas.json` env block
// for cloud builds), still overrides this for non-prod environments.
const FALLBACK_API_URL = "https://api.setupfx.io";
const FALLBACK_WS_URL = "wss://api.setupfx.io";

export const env = {
  API_URL: read("EXPO_PUBLIC_API_URL", FALLBACK_API_URL),
  WS_URL: read("EXPO_PUBLIC_WS_URL", FALLBACK_WS_URL),
  APP_NAME: read("EXPO_PUBLIC_APP_NAME", "SetupFX"),
  ENV: read("EXPO_PUBLIC_ENV", "production"),
} as const;

export const isProd = env.ENV === "production";
export const isDev = env.ENV === "development";

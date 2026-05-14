import Constants from "expo-constants";

function read(key: string, fallback: string): string {
  const fromProc = process.env[key];
  if (fromProc && fromProc.length > 0) return fromProc;
  const fromExtra = (Constants.expoConfig?.extra ?? {}) as Record<string, unknown>;
  const val = fromExtra[key];
  if (typeof val === "string" && val.length > 0) return val;
  return fallback;
}

export const env = {
  API_URL: read("EXPO_PUBLIC_API_URL", "http://10.0.2.2:8000"),
  WS_URL: read("EXPO_PUBLIC_WS_URL", "ws://10.0.2.2:8000"),
  APP_NAME: read("EXPO_PUBLIC_APP_NAME", "SetupFX"),
  ENV: read("EXPO_PUBLIC_ENV", "development"),
} as const;

export const isProd = env.ENV === "production";
export const isDev = env.ENV === "development";

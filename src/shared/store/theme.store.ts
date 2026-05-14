import { Appearance } from "react-native";
import { create } from "zustand";
import { mmkv } from "@core/storage/mmkv";
import { STORAGE_KEYS } from "@core/storage/keys";
import {
  applyPalette,
  darkPalette,
  lightPalette,
  type Palette,
} from "@shared/theme/colors";

export type ThemeMode = "dark" | "light" | "system";

interface ThemeState {
  mode: ThemeMode;
  resolved: "dark" | "light";
  hydrated: boolean;
  setMode: (mode: ThemeMode) => void;
  hydrate: () => void;
}

function resolveMode(mode: ThemeMode): "dark" | "light" {
  if (mode === "system") {
    const sys = Appearance.getColorScheme();
    return sys === "light" ? "light" : "dark";
  }
  return mode;
}

function paletteFor(resolved: "dark" | "light"): Palette {
  return resolved === "light" ? lightPalette : darkPalette;
}

export const useThemeStore = create<ThemeState>((set, get) => ({
  mode: "dark",
  resolved: "dark",
  hydrated: false,

  setMode: (mode) => {
    const resolved = resolveMode(mode);
    applyPalette(paletteFor(resolved));
    mmkv.setString(STORAGE_KEYS.theme, mode);
    set({ mode, resolved });
  },

  hydrate: () => {
    if (get().hydrated) return;
    const stored = (mmkv.getString(STORAGE_KEYS.theme) ?? "dark") as ThemeMode;
    const mode: ThemeMode = stored === "light" || stored === "system" ? stored : "dark";
    const resolved = resolveMode(mode);
    applyPalette(paletteFor(resolved));
    set({ mode, resolved, hydrated: true });
  },
}));

Appearance.addChangeListener(() => {
  const s = useThemeStore.getState();
  if (s.mode !== "system") return;
  const resolved = resolveMode("system");
  // Bail when nothing actually changed — Android can fire this listener
  // multiple times during boot with the same color scheme, and an
  // unconditional setState used to bounce the Stack key and remount the
  // login screen. Only mutate when the value flips.
  if (resolved === s.resolved) return;
  applyPalette(paletteFor(resolved));
  useThemeStore.setState({ resolved });
});

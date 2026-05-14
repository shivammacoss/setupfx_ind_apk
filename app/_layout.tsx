import "../global.css";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { AppProviders } from "@core/providers/AppProviders";
import { ErrorBoundary } from "@shared/components/ErrorBoundary";
import { bootstrapStorage } from "@core/storage/mmkv";
import { useThemeStore } from "@shared/store/theme.store";
import { colors } from "@shared/theme";
import { preloadSounds, setSoundSource } from "@shared/services/sounds";

// Default trade-action tones. Public CDN-hosted short MP3s — small (~5 KB
// each), free, and load instantly. Swap these for `require()`'d bundled
// assets once `assets/sounds/{buy,sell,close}.mp3` exist (then preload at
// boot still gives instant first-tap playback).
const DEFAULT_BUY_SOUND =
  "https://cdn.pixabay.com/download/audio/2022/03/15/audio_2c2c0a0e08.mp3?filename=notification-sound-7062.mp3";
const DEFAULT_SELL_SOUND =
  "https://cdn.pixabay.com/download/audio/2022/03/24/audio_1cb02c34cb.mp3?filename=notification-3-126507.mp3";
const DEFAULT_CLOSE_SOUND =
  "https://cdn.pixabay.com/download/audio/2022/03/15/audio_8cb749cee0.mp3?filename=interface-124464.mp3";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void bootstrapStorage().then(() => {
      hydrateTheme();
      // Register the default trade-action tone URLs and pre-warm the
      // audio players so the first BUY/SELL/close tap plays its tone on
      // the same frame as the press (no decode/setAudioMode latency
      // paid by the user). Safe to call before `setReady` — runs in
      // background; if any URL fails, that kind silently degrades to
      // haptic-only.
      setSoundSource("buy", DEFAULT_BUY_SOUND);
      setSoundSource("sell", DEFAULT_SELL_SOUND);
      setSoundSource("close", DEFAULT_CLOSE_SOUND);
      preloadSounds();
      setReady(true);
    });
  }, [hydrateTheme]);

  if (!ready) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  return (
    // No `key={resolved}` anywhere — it used to force-remount the whole
    // provider/Stack tree on every Appearance change, which on Android
    // fired during boot and tore down the active screen. Made the login
    // page look like it was refreshing in a loop. The Settings → Theme
    // flow now repaints by re-rendering subscribers directly (see
    // `applyPalette` in shared/theme/colors.ts).
    <AppProviders>
      <ErrorBoundary>
        <Stack
          screenOptions={{
            headerShown: false,
            // Native fast slide on push — "fade" was a 300 ms cross-fade
            // that felt like a load spinner. Slide animation is ~180 ms
            // and feels instant.
            animation: "slide_from_right",
            animationDuration: 180,
            contentStyle: { backgroundColor: colors.bg },
          }}
        />
      </ErrorBoundary>
    </AppProviders>
  );
}

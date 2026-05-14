import "../global.css";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { Stack } from "expo-router";
import { AppProviders } from "@core/providers/AppProviders";
import { ErrorBoundary } from "@shared/components/ErrorBoundary";
import { bootstrapStorage } from "@core/storage/mmkv";
import { useThemeStore } from "@shared/store/theme.store";
import { colors } from "@shared/theme";

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const hydrateTheme = useThemeStore((s) => s.hydrate);

  useEffect(() => {
    void bootstrapStorage().then(() => {
      hydrateTheme();
      setReady(true);
    });
    // Trade-action tones are intentionally NOT preloaded here anymore.
    // Previously we kicked off three CDN fetches (Pixabay MP3s) on every
    // cold boot — in a release APK on a slow connection that blocked the
    // JS thread for seconds and produced the "login page bar bar load le
    // raha hai" symptom. Sounds now load lazily inside `sounds.play()`
    // the first time the user actually places a trade; the auth screens
    // never pay that cost.
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

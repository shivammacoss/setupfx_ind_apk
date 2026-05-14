import { useEffect, type ReactNode } from "react";
import { Alert, Pressable, ScrollView, View } from "react-native";
import { router } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Screen } from "@shared/components/Screen";
import { Header } from "@shared/components/Header";
import { Text } from "@shared/ui/Text";
import { Toggle } from "@shared/ui/Toggle";
import { colors, spacing } from "@shared/theme";
import { usePinStore } from "@features/auth/store/pin.store";
import { useAuthStore } from "@features/auth/store/auth.store";
import { useBiometric } from "@shared/hooks/useBiometric";
import { useUiStore } from "@shared/store/ui.store";
import { useThemeStore } from "@shared/store/theme.store";
import { LANGUAGES, useLanguageStore } from "@shared/store/language.store";
import { useNetworkState } from "@shared/hooks/useNetworkState";

const THEME_LABEL = { dark: "Dark", light: "Light", system: "System" } as const;

export function SettingsScreen() {
  const bioEnabled = usePinStore((s) => s.biometricEnabled);
  const setBio = usePinStore((s) => s.setBiometricEnabled);
  const { supported, prompt } = useBiometric();
  const pushToast = useUiStore((s) => s.pushToast);
  const themeMode = useThemeStore((s) => s.mode);
  const langCode = useLanguageStore((s) => s.code);
  const langHydrated = useLanguageStore((s) => s.hydrated);
  const hydrateLang = useLanguageStore((s) => s.hydrate);
  const signOut = useAuthStore((s) => s.signOut);
  const net = useNetworkState();

  useEffect(() => {
    if (!langHydrated) void hydrateLang();
  }, [langHydrated, hydrateLang]);

  const langLabel =
    LANGUAGES.find((l) => l.code === langCode)?.label ?? "English";
  const netOk = net.isConnected && net.isInternetReachable !== false;

  async function toggleBio(next: boolean) {
    if (next && !supported) {
      pushToast({
        kind: "warn",
        message: "Biometric not available on this device",
      });
      return;
    }
    if (next) {
      const ok = await prompt("Enable biometric login");
      if (!ok) return;
    }
    setBio(next);
    pushToast({
      kind: "success",
      message: next ? "Biometric login enabled" : "Biometric login disabled",
    });
  }

  function confirmLogout() {
    Alert.alert("Log out?", "You'll need to sign in again.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Log out",
        style: "destructive",
        onPress: async () => {
          await signOut();
          router.replace("/(auth)/login");
        },
      },
    ]);
  }

  return (
    <Screen padded={false}>
      <View style={{ paddingHorizontal: spacing.lg }}>
        <Header title="Settings" back />
      </View>
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: spacing["3xl"],
          paddingTop: spacing.sm,
        }}
        showsVerticalScrollIndicator={false}
      >
        <SettingRow
          icon="contrast-outline"
          title="Theme"
          value={THEME_LABEL[themeMode]}
          onPress={() => router.push("/settings/theme")}
        />
        <SettingRow
          icon="language-outline"
          title="Language"
          value={langLabel}
          onPress={() => router.push("/settings/language")}
        />
        <SettingRow
          icon="finger-print-outline"
          title="Biometric login"
          subtitle={supported ? undefined : "Not available on this device"}
          right={
            <Toggle
              value={bioEnabled}
              onChange={toggleBio}
              disabled={!supported}
            />
          }
        />
        <SettingRow
          icon="keypad-outline"
          title="Change PIN"
          onPress={() => router.push("/(auth)/pin-set")}
        />
        <SettingRow
          icon="notifications-outline"
          title="Notification preferences"
          onPress={() => router.push("/settings/notifications")}
        />
        <SettingRow
          icon="globe-outline"
          title="Check internet connectivity"
          value={netOk ? "Online" : "Offline"}
          valueTone={netOk ? "ok" : "danger"}
          onPress={() => router.push("/settings/network")}
        />
        <SettingRow
          icon="log-out-outline"
          iconTint={colors.sell}
          title="Log out"
          titleTone="sell"
          showChevron={false}
          onPress={confirmLogout}
        />

        <View style={{ alignItems: "center", marginTop: spacing.xl }}>
          <Text tone="dim" size="xs">
            SetupFX • v1.0.0
          </Text>
        </View>
      </ScrollView>
    </Screen>
  );
}

interface SettingRowProps {
  icon: keyof typeof Ionicons.glyphMap;
  iconTint?: string;
  title: string;
  subtitle?: string;
  value?: string;
  valueTone?: "default" | "ok" | "danger";
  titleTone?: "default" | "sell";
  right?: ReactNode;
  showChevron?: boolean;
  onPress?: () => void;
}

// IMPORTANT: styles are computed inline on every render — do NOT lift them
// to a module-level `const styles` because `colors` is mutated by
// applyPalette() on theme change. A captured constant would freeze the
// dark-palette values at module load, leaving the icon backgrounds dark
// even after switching to the light theme.
function SettingRow({
  icon,
  iconTint,
  title,
  subtitle,
  value,
  valueTone = "default",
  titleTone = "default",
  right,
  showChevron = true,
  onPress,
}: SettingRowProps) {
  const valueColor =
    valueTone === "ok"
      ? colors.buy
      : valueTone === "danger"
      ? colors.sell
      : colors.textMuted;
  const titleColor = titleTone === "sell" ? colors.sell : colors.text;

  return (
    <Pressable onPress={onPress} android_ripple={{ color: colors.bgSurface }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 14,
          paddingHorizontal: 4,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: colors.bgElevated,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
            marginRight: 14,
          }}
        >
          <Ionicons name={icon} size={18} color={iconTint ?? colors.textMuted} />
        </View>

        <View style={{ flex: 1, flexShrink: 1 }}>
          <Text
            style={{ fontSize: 15, fontWeight: "500", color: titleColor }}
            numberOfLines={1}
          >
            {title}
          </Text>
          {subtitle ? (
            <Text tone="muted" size="sm" style={{ marginTop: 2 }} numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>

        {right ? (
          right
        ) : (
          <>
            {value ? (
              <Text style={{ color: valueColor, fontSize: 14, fontWeight: "500" }}>
                {value}
              </Text>
            ) : null}
            {showChevron ? (
              <Ionicons
                name="chevron-forward"
                size={18}
                color={colors.textDim}
                style={{ marginLeft: 6 }}
              />
            ) : null}
          </>
        )}
      </View>
    </Pressable>
  );
}

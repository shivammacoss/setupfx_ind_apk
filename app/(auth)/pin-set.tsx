import { useEffect, useRef, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { Screen } from "@shared/components/Screen";
import { Header } from "@shared/components/Header";
import { Text } from "@shared/ui/Text";
import { PinDots } from "@shared/ui/PinDots";
import { GradientButton } from "@shared/ui/GradientButton";
import { usePinStore, PIN_LENGTH } from "@features/auth/store/pin.store";
import { useUiStore } from "@shared/store/ui.store";

export default function PinSetScreen() {
  const [stage, setStage] = useState<"enter" | "confirm">("enter");
  const [pin, setPin] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<TextInput>(null);
  const setStoredPin = usePinStore((s) => s.setPin);
  const pushToast = useUiStore((s) => s.pushToast);

  const current = stage === "enter" ? pin : confirm;
  const setCurrent = stage === "enter" ? setPin : setConfirm;

  useEffect(() => {
    const t = setTimeout(() => inputRef.current?.focus(), 200);
    return () => clearTimeout(t);
  }, [stage]);

  async function next() {
    if (stage === "enter" && pin.length === PIN_LENGTH) {
      setStage("confirm");
      return;
    }
    if (stage === "confirm" && confirm.length === PIN_LENGTH) {
      if (pin !== confirm) {
        pushToast({ kind: "error", message: "PINs do not match" });
        setConfirm("");
        return;
      }
      setBusy(true);
      try {
        await setStoredPin(pin);
        router.replace("/(tabs)");
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <Screen>
      <Header title="" back />
      <Pressable
        onPress={() => inputRef.current?.focus()}
        style={{ flex: 1, alignItems: "center", paddingTop: 64, gap: 28 }}
      >
        <View style={{ alignItems: "center", gap: 6 }}>
          <Text tone="muted">{stage === "enter" ? "Create a 4-digit PIN" : "Confirm your PIN"}</Text>
          <Text style={{ fontSize: 26, fontWeight: "700" }}>
            {stage === "enter" ? "Set up your PIN" : "Re-enter PIN"}
          </Text>
        </View>
        <PinDots length={PIN_LENGTH} filled={current.length} cursorAt={current.length} />
        <TextInput
          ref={inputRef}
          value={current}
          onChangeText={(v) => setCurrent(v.replace(/\D/g, "").slice(0, PIN_LENGTH))}
          keyboardType="number-pad"
          autoFocus
          caretHidden
          style={{ position: "absolute", opacity: 0, height: 1, width: 1 }}
        />
      </Pressable>
      <View style={{ paddingHorizontal: 4, paddingBottom: 16 }}>
        <GradientButton
          label={stage === "enter" ? "Continue" : "Set PIN"}
          loading={busy}
          disabled={current.length !== PIN_LENGTH}
          onPress={next}
        />
      </View>
    </Screen>
  );
}

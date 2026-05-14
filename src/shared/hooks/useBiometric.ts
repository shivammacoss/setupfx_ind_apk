import { useCallback, useEffect, useState } from "react";
import { authenticate, getBiometricKind, isBiometricSupported } from "@core/security/biometric";

type Kind = "face" | "fingerprint" | "iris" | "none";

export function useBiometric() {
  const [supported, setSupported] = useState(false);
  const [kind, setKind] = useState<Kind>("none");

  useEffect(() => {
    void (async () => {
      const [s, k] = await Promise.all([isBiometricSupported(), getBiometricKind()]);
      setSupported(s);
      setKind(k);
    })();
  }, []);

  const prompt = useCallback((label?: string) => authenticate(label), []);

  return { supported, kind, prompt };
}

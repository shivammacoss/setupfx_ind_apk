import * as LocalAuthentication from "expo-local-authentication";

export async function isBiometricSupported(): Promise<boolean> {
  const [hw, enrolled] = await Promise.all([
    LocalAuthentication.hasHardwareAsync(),
    LocalAuthentication.isEnrolledAsync(),
  ]);
  return hw && enrolled;
}

export async function getBiometricKind(): Promise<"face" | "fingerprint" | "iris" | "none"> {
  if (!(await LocalAuthentication.hasHardwareAsync())) return "none";
  const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
  if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) return "face";
  if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) return "fingerprint";
  if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) return "iris";
  return "none";
}

export async function authenticate(prompt = "Authenticate to continue"): Promise<boolean> {
  const ok = await isBiometricSupported();
  if (!ok) return false;
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage: prompt,
    disableDeviceFallback: false,
    cancelLabel: "Cancel",
  });
  return result.success;
}

import { Platform } from "react-native";

const family = Platform.select({ ios: "System", android: "sans-serif", default: "System" }) as string;
const familyMono = Platform.select({ ios: "Menlo", android: "monospace", default: "monospace" }) as string;

export const typography = {
  family,
  familyMono,
  size: {
    xs: 11,
    sm: 12,
    md: 14,
    lg: 16,
    xl: 18,
    "2xl": 20,
    "3xl": 24,
    "4xl": 30,
  },
  weight: {
    regular: "400",
    medium: "500",
    semibold: "600",
    bold: "700",
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.4,
    relaxed: 1.6,
  },
} as const;

export type FontSize = keyof typeof typography.size;
export type FontWeight = keyof typeof typography.weight;

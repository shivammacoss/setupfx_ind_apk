import { memo } from "react";
import { Text as RNText, TextProps as RNTextProps } from "react-native";
import { colors, typography, type FontSize, type FontWeight } from "@shared/theme";

type Variant = "body" | "heading" | "title" | "mono" | "caption";
type Tone = "default" | "muted" | "dim" | "buy" | "sell" | "warn" | "info";

interface TextProps extends RNTextProps {
  variant?: Variant;
  tone?: Tone;
  size?: FontSize;
  weight?: FontWeight;
  mono?: boolean;
}

const VARIANT_SIZE: Record<Variant, FontSize> = {
  body: "md",
  heading: "xl",
  title: "2xl",
  mono: "md",
  caption: "sm",
};

// `colors` is mutated in-place by applyPalette() on theme switch, so we MUST
// look up colors on every render (no module-level const cache). Otherwise
// switching from dark → light would leave Text painted in the originally-
// captured dark-theme colours (white on white = invisible).
function resolveTone(tone: Tone): string {
  switch (tone) {
    case "default":
      return colors.text;
    case "muted":
      return colors.textMuted;
    case "dim":
      return colors.textDim;
    case "buy":
      return colors.buy;
    case "sell":
      return colors.sell;
    case "warn":
      return colors.warn;
    case "info":
      return colors.info;
  }
}

function TextImpl({
  variant = "body",
  tone = "default",
  size,
  weight = "regular",
  mono,
  style,
  ...rest
}: TextProps) {
  const finalSize = size ?? VARIANT_SIZE[variant];
  const useMono = mono || variant === "mono";
  return (
    <RNText
      {...rest}
      style={[
        {
          includeFontPadding: false,
          color: resolveTone(tone),
          fontSize: typography.size[finalSize],
          fontWeight: typography.weight[weight] as "400" | "500" | "600" | "700",
          fontFamily: useMono ? typography.familyMono : typography.family,
        },
        style,
      ]}
    />
  );
}

export const Text = memo(TextImpl);

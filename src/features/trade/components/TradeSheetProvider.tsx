import { ReactNode, createContext, useContext, useMemo, useRef } from "react";
import { TradeSheet, type TradeSheetRef } from "./TradeSheet";

interface OpenArgs {
  token: string;
  symbol?: string;
  name?: string;
}

interface Ctx {
  open: (args: OpenArgs) => void;
  close: () => void;
}

const TradeSheetCtx = createContext<Ctx | null>(null);

// The TradeSheet is mounted EAGERLY (one-time, app-wide). Previously we
// lazy-mounted on first tap to save Gorhom / Reanimated init cost, but the
// trade-off was that the first tap opened the sheet at a tiny height stuck
// near the nav bar — the BottomSheet hadn't measured its container yet when
// `snapToIndex(0)` fired. Pre-mounting fixes that without any noticeable
// boot-time hit (Gorhom init is < 30 ms).
export function TradeSheetProvider({ children }: { children: ReactNode }) {
  const ref = useRef<TradeSheetRef>(null);

  const value = useMemo<Ctx>(
    () => ({
      open: (args) => {
        ref.current?.open(args);
      },
      close: () => ref.current?.close(),
    }),
    [],
  );

  return (
    <TradeSheetCtx.Provider value={value}>
      {children}
      <TradeSheet ref={ref} />
    </TradeSheetCtx.Provider>
  );
}

export function useTradeSheet(): Ctx {
  const ctx = useContext(TradeSheetCtx);
  if (!ctx) throw new Error("useTradeSheet must be used within TradeSheetProvider");
  return ctx;
}

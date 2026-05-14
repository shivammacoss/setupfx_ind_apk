import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { HoldingsAPI, PositionsAPI } from "@features/portfolio/api/positions.api";
import type {
  ActiveTrade,
  Holding,
  PnLSummary,
  Position,
} from "@features/portfolio/types/position.types";
import type { Order } from "@features/trade/types/order.types";
import { ApiError } from "@core/api/errors";
import { useUiStore } from "@shared/store/ui.store";
import { useAuthStore } from "@features/auth/store/auth.store";
import { sounds } from "@shared/services/sounds";

const OPEN_KEY = ["positions", "open"] as const;
const CLOSED_KEY = ["positions", "closed"] as const;
const PNL_KEY = ["positions", "pnl-summary"] as const;
const ACTIVE_KEY = ["positions", "active-trades"] as const;
const HOLDINGS_KEY = ["holdings"] as const;

// Module-level "freeze" timestamps — when a close mutation runs, we set
// these so background pollers (refetchInterval) skip firing during the
// freeze window. The optimistic clear stays on screen until the WS push
// from UserEventsProvider syncs the real state. Prevents the "row pops
// back for a split second" race when polling lands while the matching
// engine is still processing the close.
let _openPositionsFreezeUntil = 0;
let _activeTradesFreezeUntil = 0;
const CLOSE_FREEZE_MS = 2500;

// `keepPreviousData` is critical for the close-position UX — without it,
// after the user closes a row, the next scheduled poll briefly sets the
// query to "fetching" and the cached list is invalidated → the optimistic-
// ally cleared row pops back for a split second. With it, the previous
// list stays on screen until the new fetch resolves; the WS push from
// UserEventsProvider replaces it instantly when the matching engine syncs.
//
// Fast polling (3 s for live, 20 s for snapshots) — user wants the app to
// feel snappy, battery is secondary. WS push covers most updates already,
// REST poll is the safety net + reconciles drift.

export function useOpenPositions() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return useQuery<Position[]>({
    queryKey: OPEN_KEY,
    queryFn: () => PositionsAPI.open(),
    enabled: isAuth,
    staleTime: 2_000,
    // Returns `false` while a close mutation is settling so the
    // optimistically-cleared list isn't overwritten by a poll that lands
    // while the matching engine is still processing.
    refetchInterval: () =>
      Date.now() < _openPositionsFreezeUntil ? false : 3_000,
    placeholderData: keepPreviousData,
  });
}

export function useClosedPositions() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return useQuery<Position[]>({
    queryKey: CLOSED_KEY,
    queryFn: () => PositionsAPI.closed(),
    enabled: isAuth,
    staleTime: 10_000,
    refetchInterval: 20_000,
    placeholderData: keepPreviousData,
  });
}

export function usePnLSummary() {
  // CRITICAL: must be gated on auth — TradeSheet is pre-mounted globally
  // (see TradeSheetProvider in AppProviders) which means this hook runs on
  // the unauthenticated login/register screens too. Without the gate, the
  // 5-second refetchInterval hit /pnl-summary while logged out, got 401,
  // triggered notifyAuthFailure → router.replace("/(auth)/login") in a
  // loop — that's what made the login page look like it was refreshing.
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return useQuery<PnLSummary>({
    queryKey: PNL_KEY,
    queryFn: () => PositionsAPI.pnlSummary(),
    enabled: isAuth,
    staleTime: 3_000,
    refetchInterval: 5_000,
    placeholderData: keepPreviousData,
  });
}

export function useHoldings() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return useQuery<Holding[]>({
    queryKey: HOLDINGS_KEY,
    queryFn: () => HoldingsAPI.list(),
    enabled: isAuth,
    staleTime: 15_000,
    refetchInterval: 30_000,
    placeholderData: keepPreviousData,
  });
}

export function useActiveTrades() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  return useQuery<ActiveTrade[]>({
    queryKey: ACTIVE_KEY,
    queryFn: () => PositionsAPI.activeTrades(),
    enabled: isAuth,
    staleTime: 2_000,
    refetchInterval: () =>
      Date.now() < _activeTradesFreezeUntil ? false : 3_000,
    placeholderData: keepPreviousData,
  });
}

// Close mutations follow a single fast pattern:
//
//   onMutate  — cancel any in-flight position fetch and apply the optimistic
//               cleanup so the list empties on the same frame as the tap.
//   onSuccess — push one confirmation toast. Do NOT invalidate the positions
//               cache here. `/ws/user` "position" events (UserEventsProvider)
//               invalidate as soon as the matching engine actually flips the
//               rows to CLOSED — instant once backend is done. If the WS is
//               down, the 5 s scheduled refetchInterval reconciles. Invalidat-
//               ing inside onSuccess used to race the matching engine — the
//               refetch landed while the server still showed the row as OPEN
//               and the optimistically-cleared list "came back" for a second
//               (the flicker bug).
//   onError   — roll back the optimistic snapshot.

// Across every close-mutation below: the success toast fires in `onMutate`
// (the same frame as the tap), NOT in `onSuccess` — `onSuccess` waits for
// the HTTP roundtrip which can be 1-2 s on a slow connection. The
// optimistic UI + WS push handle the real-data sync, so the toast can
// confirm the user's action instantly. If the backend actually rejects,
// `onError` rolls back the cache and pushes a red error toast (which
// supersedes the green one visually since toasts stack).
//
// IMPORTANT — we DON'T `await` qc.cancelQueries before the optimistic
// setQueryData. The await blocks until any in-flight refetch finishes
// (could be ~500ms-1s on a slow connection) — exactly the "1-sec lag
// before the row disappears" bug the user reported. Firing cancel
// without awaiting still cancels any in-flight fetches; the freeze
// window prevents new ones from starting; and `setQueryData` runs
// synchronously so the optimistic update commits in the same frame.

// Deferred re-sync of the Closed-positions tab. The backend's matching
// engine takes ~500-1500 ms to actually flip a position to CLOSED and
// write it to /positions/closed. Refetching too early returns stale
// data; refetching too late looks broken. 2 s hits the sweet spot.
function scheduleClosedSync(qc: ReturnType<typeof useQueryClient>): void {
  setTimeout(() => {
    void qc.invalidateQueries({ queryKey: CLOSED_KEY });
    void qc.invalidateQueries({ queryKey: PNL_KEY });
  }, 2_000);
}

// Build a synthetic optimistic close order so the Orders tab shows the
// close request the moment the user taps Close — same way usePlaceOrder
// inserts an optimistic order for fresh BUY/SELL taps. Mutations call
// this from `onMutate` so the row appears on the same frame as the tap.
function makeOptimisticCloseOrder(input: {
  symbol: string;
  instrument_token: string;
  product_type: string;
  positionQty: number;
  lotsHint?: number;
}): Order {
  const now = new Date().toISOString();
  // Closing a LONG → SELL order. Closing a SHORT → BUY order.
  const closeAction: "BUY" | "SELL" = input.positionQty > 0 ? "SELL" : "BUY";
  const lots = input.lotsHint ?? (Math.abs(input.positionQty || 0) || 1);
  return {
    id: `tmp-close-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    user_id: "",
    symbol: input.symbol,
    token: input.instrument_token,
    action: closeAction,
    order_type: "MARKET",
    product_type: input.product_type as Order["product_type"],
    lots,
    quantity: 0,
    filled_quantity: 0,
    pending_quantity: 0,
    price: "0",
    trigger_price: "0",
    average_price: "0",
    status: "PENDING",
    created_at: now,
  };
}

// Insert an optimistic order row into every cached `["orders", ...]` page
// so the Orders tab paints it instantly. Returns a snapshot map for
// rollback on error.
function insertOptimisticOrder(
  qc: QueryClient,
  order: Order,
): Map<readonly unknown[], Order[] | undefined> {
  const allOrderPages = qc.getQueriesData<Order[]>({ queryKey: ["orders"] });
  const snapshot = new Map<readonly unknown[], Order[] | undefined>();
  for (const [key, value] of allOrderPages) {
    snapshot.set(key, value);
    if (Array.isArray(value)) {
      qc.setQueryData<Order[]>(key, [order, ...value]);
    }
  }
  return snapshot;
}

function rollbackOrders(
  qc: QueryClient,
  snapshot: Map<readonly unknown[], Order[] | undefined> | undefined,
): void {
  if (!snapshot) return;
  snapshot.forEach((value, key) => {
    qc.setQueryData(key, value);
  });
}

// Optimistically release the margin held by `positions` back into the
// wallet's available balance, so the LEDGER / MARGIN AVAILABLE / MARGIN
// USED KPIs on Portfolio repaint the same frame as the close tap.
// Mirrors what backend's wallet_service.release_margin does after the
// matching engine flips a position to CLOSED — the /ws/user `wallet`
// event arrives within ~200-500 ms with the precise number and replaces
// this estimate. Returns the previous wallet snapshot for rollback.
const WALLET_SUMMARY_KEY = ["wallet", "summary"] as const;
type WalletSummaryShape = {
  available_balance?: string;
  used_margin?: string;
  realized_pnl?: string;
  [k: string]: unknown;
};

function releaseMarginOptimistically(
  qc: QueryClient,
  positions: Position[],
): WalletSummaryShape | undefined {
  const prev = qc.getQueryData<WalletSummaryShape>(WALLET_SUMMARY_KEY);
  if (!prev || positions.length === 0) return prev;
  let releasedMargin = 0;
  let realizedPnl = 0;
  for (const p of positions) {
    releasedMargin += Number(p.margin_used) || 0;
    // Treat the unrealized P&L at close-time as realized — the actual
    // settled P&L only differs by a tiny commission delta which the WS
    // push will correct.
    realizedPnl += Number(p.unrealized_pnl) || 0;
  }
  if (releasedMargin <= 0 && realizedPnl === 0) return prev;
  const nextAvail =
    Number(prev.available_balance ?? 0) + releasedMargin + realizedPnl;
  const nextUsed = Math.max(0, Number(prev.used_margin ?? 0) - releasedMargin);
  const nextRealized = Number(prev.realized_pnl ?? 0) + realizedPnl;
  qc.setQueryData<WalletSummaryShape>(WALLET_SUMMARY_KEY, {
    ...prev,
    available_balance: String(nextAvail),
    used_margin: String(nextUsed),
    realized_pnl: String(nextRealized),
  });
  return prev;
}

export function useCloseActiveTrade() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (tradeId: string) => PositionsAPI.closeActiveTrade(tradeId),
    onMutate: (tradeId) => {
      // Fire-and-forget cancels on all caches we patch — Orders tab
      // refresh too, since we'll insert an optimistic close order.
      void qc.cancelQueries({ queryKey: ACTIVE_KEY });
      void qc.cancelQueries({ queryKey: OPEN_KEY });
      void qc.cancelQueries({ queryKey: ["orders"] });

      const activeSnap = qc.getQueryData<ActiveTrade[]>(ACTIVE_KEY);
      const openSnap = qc.getQueryData<Position[]>(OPEN_KEY);

      // Find the trade being closed BEFORE we mutate, so we can shrink
      // the matching position by its quantity AND build a properly-
      // labelled optimistic close order.
      const closingTrade = activeSnap?.find((t) => t.id === tradeId);

      // ─── Active trades cache ────────────────────────────────────────
      qc.setQueryData<ActiveTrade[]>(ACTIVE_KEY, (prev) =>
        prev ? prev.filter((t) => t.id !== tradeId) : prev,
      );

      // ─── Open positions cache ───────────────────────────────────────
      if (closingTrade) {
        qc.setQueryData<Position[]>(OPEN_KEY, (prev) => {
          if (!prev) return prev;
          return prev
            .map((p) => {
              if (
                p.instrument_token !== closingTrade.instrument_token ||
                p.product_type !== closingTrade.product_type
              ) {
                return p;
              }
              const direction = Math.sign(p.quantity || 0) || 1;
              const reducedQty = (closingTrade.quantity || 0) * direction;
              const next = (p.quantity ?? 0) - reducedQty;
              if (Math.abs(next) < 1e-9) return null;
              return { ...p, quantity: next };
            })
            .filter((p): p is Position => p != null);
        });
      }

      // ─── Orders cache ────────────────────────────────────────────────
      // Insert a synthetic close-order row so Orders → Open paints the
      // close request on the same frame as the tap. Backend MARKET fill
      // will move it to Executed within ~500 ms via WS push.
      let prevOrders: Map<readonly unknown[], Order[] | undefined> | undefined;
      if (closingTrade) {
        const optOrder = makeOptimisticCloseOrder({
          symbol: closingTrade.symbol,
          instrument_token: closingTrade.instrument_token,
          product_type: closingTrade.product_type,
          // Opposite direction of the trade we're closing.
          positionQty: closingTrade.action === "BUY"
            ? closingTrade.quantity
            : -closingTrade.quantity,
          lotsHint: closingTrade.lots,
        });
        prevOrders = insertOptimisticOrder(qc, optOrder);
      }

      // ─── Wallet cache ───────────────────────────────────────────────
      // Release the parent position's margin so MARGIN AVAILABLE jumps up
      // and MARGIN USED drops on the same frame as the tap.
      let prevWallet: WalletSummaryShape | undefined;
      if (closingTrade) {
        const parent = openSnap?.find(
          (p) =>
            p.instrument_token === closingTrade.instrument_token &&
            p.product_type === closingTrade.product_type,
        );
        if (parent) {
          prevWallet = releaseMarginOptimistically(qc, [parent]);
        } else {
          prevWallet = qc.getQueryData<WalletSummaryShape>(WALLET_SUMMARY_KEY);
        }
      }

      _activeTradesFreezeUntil = Date.now() + CLOSE_FREEZE_MS;
      _openPositionsFreezeUntil = Date.now() + CLOSE_FREEZE_MS;
      sounds.close();
      pushToast({ kind: "success", message: "Trade closed", ttlMs: 1500 });
      return { activeSnap, openSnap, prevOrders, prevWallet };
    },
    onSuccess: () => {
      // After the HTTP returns 200, the matching engine has flipped (or
      // is about to flip) the parent position to CLOSED. Give the engine
      // 2 s and then refetch the Closed tab + pnl-summary so the row
      // surfaces. WS push from UserEventsProvider usually beats this,
      // but the timer is the fallback for slow / disconnected WS.
      scheduleClosedSync(qc);
    },
    onError: (e: ApiError, _vars, ctx) => {
      // Restore ALL caches we patched.
      if (ctx?.activeSnap !== undefined) qc.setQueryData(ACTIVE_KEY, ctx.activeSnap);
      if (ctx?.openSnap !== undefined) qc.setQueryData(OPEN_KEY, ctx.openSnap);
      if (ctx?.prevWallet !== undefined) {
        qc.setQueryData(WALLET_SUMMARY_KEY, ctx.prevWallet);
      }
      rollbackOrders(qc, ctx?.prevOrders);
      _activeTradesFreezeUntil = 0;
      _openPositionsFreezeUntil = 0;
      pushToast({ kind: "error", message: e.message });
    },
  });
}

export function useSquareoffAll() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: () => PositionsAPI.squareoffAll(),
    onMutate: () => {
      void qc.cancelQueries({ queryKey: OPEN_KEY });
      void qc.cancelQueries({ queryKey: ACTIVE_KEY });
      void qc.cancelQueries({ queryKey: ["orders"] });
      const openSnap = qc.getQueryData<Position[]>(OPEN_KEY);
      const activeSnap = qc.getQueryData<ActiveTrade[]>(ACTIVE_KEY);
      const count = openSnap?.length ?? 0;
      qc.setQueryData<Position[]>(OPEN_KEY, []);
      qc.setQueryData<ActiveTrade[]>(ACTIVE_KEY, []);

      // ─── Orders cache ────────────────────────────────────────────────
      // Insert a synthetic close-order row for every position being
      // batch-closed so Orders → Open shows the in-flight close fleet.
      const allOrderPages = qc.getQueriesData<Order[]>({ queryKey: ["orders"] });
      const prevOrders = new Map<readonly unknown[], Order[] | undefined>();
      for (const [key, value] of allOrderPages) {
        prevOrders.set(key, value);
      }
      if (openSnap && openSnap.length > 0) {
        const closeOrders: Order[] = openSnap
          .filter((p) => Math.abs(p.quantity || 0) > 0)
          .map((p) =>
            makeOptimisticCloseOrder({
              symbol: p.symbol,
              instrument_token: p.instrument_token,
              product_type: p.product_type,
              positionQty: p.quantity,
            }),
          );
        if (closeOrders.length > 0) {
          for (const [key, value] of allOrderPages) {
            if (Array.isArray(value)) {
              qc.setQueryData<Order[]>(key, [...closeOrders, ...value]);
            }
          }
        }
      }

      // ─── Wallet cache ───────────────────────────────────────────────
      // Release the entire batch's margin so the user sees their full
      // MARGIN AVAILABLE jump back up the same frame as the Batch Close
      // tap. WS push reconciles the realized P&L within ~500 ms.
      const prevWallet = releaseMarginOptimistically(qc, openSnap ?? []);

      _openPositionsFreezeUntil = Date.now() + CLOSE_FREEZE_MS * 2;
      _activeTradesFreezeUntil = Date.now() + CLOSE_FREEZE_MS * 2;
      sounds.close();
      pushToast({
        kind: "success",
        message: count > 0 ? `Closing ${count} positions` : "Closing positions",
        ttlMs: 1500,
      });
      return { openSnap, activeSnap, prevOrders, prevWallet };
    },
    onSuccess: (res) => {
      const blocked = res.blocked_by_hold_time;
      if (blocked > 0) {
        pushToast({
          kind: "warn",
          message: `${blocked} blocked by hold-time`,
        });
      }
      // Defer-invalidate Closed + pnl-summary so newly-closed positions
      // surface in the Closed tab once the matching engine settles.
      scheduleClosedSync(qc);
    },
    onError: (e: ApiError, _vars, ctx) => {
      if (ctx?.openSnap !== undefined) qc.setQueryData(OPEN_KEY, ctx.openSnap);
      if (ctx?.activeSnap !== undefined) qc.setQueryData(ACTIVE_KEY, ctx.activeSnap);
      if (ctx?.prevWallet !== undefined) {
        qc.setQueryData(WALLET_SUMMARY_KEY, ctx.prevWallet);
      }
      rollbackOrders(qc, ctx?.prevOrders);
      _openPositionsFreezeUntil = 0;
      _activeTradesFreezeUntil = 0;
      pushToast({ kind: "error", message: e.message });
    },
  });
}

export function useSquareoffPosition() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: ({ id, lots }: { id: string; lots?: number }) =>
      PositionsAPI.squareoff(id, lots),
    onMutate: ({ id, lots }) => {
      // Fire-and-forget cancels on all 3 caches we patch.
      void qc.cancelQueries({ queryKey: OPEN_KEY });
      void qc.cancelQueries({ queryKey: ACTIVE_KEY });
      void qc.cancelQueries({ queryKey: ["orders"] });
      const openSnap = qc.getQueryData<Position[]>(OPEN_KEY);
      const activeSnap = qc.getQueryData<ActiveTrade[]>(ACTIVE_KEY);

      // Capture the closing position BEFORE we mutate so we can match its
      // related active trades by token + product + direction.
      const closingPos = openSnap?.find((p) => p.id === id);

      // ─── Open positions cache ───────────────────────────────────────
      qc.setQueryData<Position[]>(OPEN_KEY, (prev) => {
        if (!prev) return prev;
        if (lots == null) {
          return prev.filter((p) => p.id !== id);
        }
        return prev
          .map((p) => {
            if (p.id !== id) return p;
            const remaining = Math.max(0, (p.quantity ?? 0) - lots);
            if (remaining <= 0) return null;
            return { ...p, quantity: remaining };
          })
          .filter((p): p is Position => p != null);
      });

      // ─── Active trades cache ────────────────────────────────────────
      // On a FULL close (no `lots` arg) drop every active trade row for
      // the same instrument + product + direction. On a partial close
      // leave them — FIFO matching individual fills is fragile to
      // replicate optimistically; the WS push reconciles in ~200 ms.
      if (lots == null && closingPos) {
        const dirSign = Math.sign(closingPos.quantity || 0);
        const targetAction: "BUY" | "SELL" = dirSign >= 0 ? "BUY" : "SELL";
        qc.setQueryData<ActiveTrade[]>(ACTIVE_KEY, (prev) =>
          prev
            ? prev.filter(
                (t) =>
                  !(
                    t.instrument_token === closingPos.instrument_token &&
                    t.product_type === closingPos.product_type &&
                    t.action === targetAction
                  ),
              )
            : prev,
        );
      }

      // ─── Orders cache ────────────────────────────────────────────────
      // Insert a synthetic close-order row so Orders → Open paints the
      // close request on the same frame as the tap.
      let prevOrders: Map<readonly unknown[], Order[] | undefined> | undefined;
      if (closingPos) {
        const closeLots = lots ?? Math.abs(closingPos.quantity || 0);
        const optOrder = makeOptimisticCloseOrder({
          symbol: closingPos.symbol,
          instrument_token: closingPos.instrument_token,
          product_type: closingPos.product_type,
          positionQty: closingPos.quantity,
          lotsHint: closeLots,
        });
        prevOrders = insertOptimisticOrder(qc, optOrder);
      }

      // ─── Wallet cache ───────────────────────────────────────────────
      // Release margin proportionally:
      //   • Full close (no `lots` arg) → return the whole position's
      //     margin_used + unrealized_pnl to available.
      //   • Partial close → release a proportional slice (lots / |qty|).
      let prevWallet: WalletSummaryShape | undefined;
      if (closingPos) {
        const absQty = Math.abs(closingPos.quantity || 0);
        const fraction =
          lots == null || absQty === 0 ? 1 : Math.min(1, lots / absQty);
        const fakePos: Position = {
          ...closingPos,
          margin_used: String(Number(closingPos.margin_used || 0) * fraction),
          unrealized_pnl: String(
            Number(closingPos.unrealized_pnl || 0) * fraction,
          ),
        };
        prevWallet = releaseMarginOptimistically(qc, [fakePos]);
      }

      _openPositionsFreezeUntil = Date.now() + CLOSE_FREEZE_MS;
      _activeTradesFreezeUntil = Date.now() + CLOSE_FREEZE_MS;
      // Tone + haptic cue so the user knows the close press registered
      // before the network round-trip resolves. Same source-of-truth
      // for sounds as BUY/SELL — see shared/services/sounds.ts.
      sounds.close();
      pushToast({ kind: "success", message: "Position closed", ttlMs: 1500 });
      return { openSnap, activeSnap, prevOrders, prevWallet };
    },
    onSuccess: () => {
      // Defer-refetch Closed + PnL summary so the newly-closed position
      // shows up in the Closed tab once the matching engine writes it.
      scheduleClosedSync(qc);
    },
    onError: (e: ApiError, _vars, ctx) => {
      // Restore ALL caches we patched.
      if (ctx?.openSnap !== undefined) qc.setQueryData(OPEN_KEY, ctx.openSnap);
      if (ctx?.activeSnap !== undefined) qc.setQueryData(ACTIVE_KEY, ctx.activeSnap);
      if (ctx?.prevWallet !== undefined) {
        qc.setQueryData(WALLET_SUMMARY_KEY, ctx.prevWallet);
      }
      rollbackOrders(qc, ctx?.prevOrders);
      _openPositionsFreezeUntil = 0;
      _activeTradesFreezeUntil = 0;
      pushToast({ kind: "error", message: e.message });
    },
  });
}

// SL/TP edit on a Position. Backend accepts `null` / `0` to clear a leg.
// Optimistically patches OPEN_KEY so the new values render instantly on
// the position card — even before the HTTP returns.
export function useUpdatePositionSlTp() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (vars: {
      id: string;
      stop_loss?: number | null;
      target?: number | null;
    }) =>
      PositionsAPI.updateSlTp(vars.id, {
        stop_loss: vars.stop_loss,
        target: vars.target,
      }),
    onMutate: ({ id, stop_loss, target }) => {
      const snap = qc.getQueryData<Position[]>(OPEN_KEY);
      qc.setQueryData<Position[]>(OPEN_KEY, (prev) =>
        prev
          ? prev.map((p) =>
              p.id === id
                ? {
                    ...p,
                    stop_loss:
                      stop_loss == null || stop_loss === 0
                        ? null
                        : String(stop_loss),
                    target:
                      target == null || target === 0 ? null : String(target),
                  }
                : p,
            )
          : prev,
      );
      pushToast({ kind: "success", message: "SL / TP updated", ttlMs: 1500 });
      return { snap };
    },
    onError: (e: ApiError, _vars, ctx) => {
      if (ctx?.snap !== undefined) qc.setQueryData(OPEN_KEY, ctx.snap);
      pushToast({ kind: "error", message: e.message });
    },
  });
}

// SL/TP edit on an ActiveTrade. Backend delegates to the parent position's
// SL/TP (FIFO/avg accounting — no per-fill stops), so the optimistic patch
// updates both ACTIVE_KEY (so the trade card paints the new values) and
// OPEN_KEY (so the Position card stays in sync).
export function useUpdateActiveTradeSlTp() {
  const qc = useQueryClient();
  const pushToast = useUiStore((s) => s.pushToast);
  return useMutation({
    mutationFn: (vars: {
      tradeId: string;
      stop_loss?: number | null;
      target?: number | null;
    }) =>
      PositionsAPI.updateActiveTradeSlTp(vars.tradeId, {
        stop_loss: vars.stop_loss,
        target: vars.target,
      }),
    onMutate: ({ tradeId, stop_loss, target }) => {
      const activeSnap = qc.getQueryData<ActiveTrade[]>(ACTIVE_KEY);
      const openSnap = qc.getQueryData<Position[]>(OPEN_KEY);

      const sl =
        stop_loss == null || stop_loss === 0 ? null : String(stop_loss);
      const tp = target == null || target === 0 ? null : String(target);

      // Patch the trade row.
      const closingTrade = activeSnap?.find((t) => t.id === tradeId);
      qc.setQueryData<ActiveTrade[]>(ACTIVE_KEY, (prev) =>
        prev
          ? prev.map((t) =>
              t.id === tradeId ? { ...t, stop_loss: sl, target: tp } : t,
            )
          : prev,
      );

      // Also patch the parent position so Position tab agrees.
      if (closingTrade) {
        qc.setQueryData<Position[]>(OPEN_KEY, (prev) =>
          prev
            ? prev.map((p) =>
                p.instrument_token === closingTrade.instrument_token &&
                p.product_type === closingTrade.product_type
                  ? { ...p, stop_loss: sl, target: tp }
                  : p,
              )
            : prev,
        );
      }

      pushToast({ kind: "success", message: "SL / TP updated", ttlMs: 1500 });
      return { activeSnap, openSnap };
    },
    onError: (e: ApiError, _vars, ctx) => {
      if (ctx?.activeSnap !== undefined)
        qc.setQueryData(ACTIVE_KEY, ctx.activeSnap);
      if (ctx?.openSnap !== undefined) qc.setQueryData(OPEN_KEY, ctx.openSnap);
      pushToast({ kind: "error", message: e.message });
    },
  });
}

import { useQuery } from "@tanstack/react-query";
import { api } from "@core/api/client";
import { unwrap } from "@core/api/errors";
import { useAuthStore } from "@features/auth/store/auth.store";

export interface SupportContacts {
  whatsapp: string;
  email: string;
}

// Last-resort defaults so the Support section is visible from day one
// — even before the backend is restarted with the new `/user/support`
// route and the admin has set the platform settings. The moment admin
// edits `platform.support_whatsapp` / `platform.support_email`, the
// query overlay wins. The hardcoded email is the same default the
// seed inserts so behaviour is identical pre- and post-restart.
const FALLBACK_CONTACTS: SupportContacts = {
  whatsapp: "",
  email: "support@setupfx.com",
};

// Admin-managed WhatsApp + email exposed via `/user/support`. Cached
// generously since these change at most once a quarter — the profile
// page render shouldn't bounce a request every time the user re-opens
// the tab. Gated on auth so the unauthenticated splash doesn't issue
// a 401.
//
// Returns a `data` value EVEN ON ERROR (404 when backend not yet
// restarted, network blip, …) via the fallback constant above. That
// way the user always sees at least the default email row — far better
// UX than a blank Profile section because the new route hasn't shipped
// to the server yet.
export function useSupportContacts() {
  const isAuth = useAuthStore((s) => s.isAuthenticated);
  const q = useQuery<SupportContacts>({
    queryKey: ["support", "contacts"],
    queryFn: async () => {
      try {
        const result = await unwrap<SupportContacts>(api.get("/user/support"));
        return {
          whatsapp: result?.whatsapp ?? "",
          email: result?.email || FALLBACK_CONTACTS.email,
        };
      } catch {
        return FALLBACK_CONTACTS;
      }
    },
    enabled: isAuth,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: 0,
    // Seed first paint with the fallback so the section is on screen
    // the instant the Profile mounts, even before the network resolves.
    placeholderData: FALLBACK_CONTACTS,
  });
  return {
    ...q,
    data: q.data ?? FALLBACK_CONTACTS,
  };
}

/** Builds a wa.me URL from an admin-stored number — strips spaces /
 *  dashes / leading "+" since wa.me expects digits only. Returns null
 *  for blank or otherwise unusable input so callers can hide the link. */
export function buildWhatsappUrl(raw: string | undefined | null, prefill?: string): string | null {
  if (!raw) return null;
  const digits = String(raw).replace(/[^0-9]/g, "");
  if (digits.length < 8) return null; // shorter than the shortest country dial
  const text = prefill ? `?text=${encodeURIComponent(prefill)}` : "";
  return `https://wa.me/${digits}${text}`;
}

/** Builds a mailto: URL with optional subject + body. Returns null when
 *  the address is missing so the caller can hide the button. */
export function buildMailtoUrl(
  email: string | undefined | null,
  opts?: { subject?: string; body?: string },
): string | null {
  if (!email || !email.includes("@")) return null;
  const params: string[] = [];
  if (opts?.subject) params.push(`subject=${encodeURIComponent(opts.subject)}`);
  if (opts?.body) params.push(`body=${encodeURIComponent(opts.body)}`);
  const qs = params.length > 0 ? `?${params.join("&")}` : "";
  return `mailto:${email}${qs}`;
}

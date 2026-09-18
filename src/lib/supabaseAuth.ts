import { supabase } from "./db";
import type { Session } from "@supabase/supabase-js";

let inflightAuthPromise: Promise<Session> | null = null;

/**
 * Ensures an active Supabase authenticated session for the POS application.
 * - Inspects the current session via supabase.auth.getSession().
 * - Re-uses the active session if valid.
 * - Otherwise signs in using VITE_SUPABASE_POS_EMAIL and VITE_SUPABASE_POS_PASSWORD.
 * - Prevents multiple concurrent sign-in calls via inflight promise locking.
 * - Never hardcodes passwords or privileged service keys.
 */
export async function ensureSupabaseSession(): Promise<Session> {
  // 1. Check existing session
  try {
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();
    if (!sessionError && session?.access_token) {
      // Check token expiry if present (with 30s buffer)
      if (session.expires_at) {
        const expiresAtMs = session.expires_at * 1000;
        if (Date.now() < expiresAtMs - 30000) {
          return session;
        }
      } else {
        return session;
      }
    }
  } catch (err: any) {
    console.warn("[SupabaseAuth] getSession check encountered error:", err?.message || err);
  }

  // 2. Prevent concurrent sign-ins
  if (inflightAuthPromise) {
    return inflightAuthPromise;
  }

  inflightAuthPromise = (async () => {
    try {
      const anyMeta = import.meta as any;
      const email = (
        (typeof import.meta !== "undefined" && anyMeta.env?.VITE_SUPABASE_POS_EMAIL) ||
        (typeof process !== "undefined" && process.env?.VITE_SUPABASE_POS_EMAIL) ||
        ""
      ).trim();

      const password = (
        (typeof import.meta !== "undefined" && anyMeta.env?.VITE_SUPABASE_POS_PASSWORD) ||
        (typeof process !== "undefined" && process.env?.VITE_SUPABASE_POS_PASSWORD) ||
        ""
      ).trim();

      if (!email || !password) {
        throw new Error(
          "Supabase Auth requires POS credentials. Please configure VITE_SUPABASE_POS_EMAIL and VITE_SUPABASE_POS_PASSWORD in environment variables."
        );
      }

      console.log(`[SupabaseAuth] Authenticating POS terminal as '${email}'...`);
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error || !data.session) {
        const msg = error?.message || "No session returned from Supabase Auth";
        console.error("[SupabaseAuth] Authentication failed:", msg);
        throw new Error(`Failed to establish Supabase POS session: ${msg}`);
      }

      console.log(`[SupabaseAuth] POS terminal successfully authenticated (User: ${data.session.user.id})`);
      return data.session;
    } finally {
      inflightAuthPromise = null;
    }
  })();

  return inflightAuthPromise;
}

/**
 * Returns current Supabase session metadata without triggering sign-in
 */
export async function getSupabaseSessionStatus(): Promise<{
  isAuthenticated: boolean;
  email?: string;
  userId?: string;
  role?: string;
}> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (session?.user) {
      return {
        isAuthenticated: true,
        email: session.user.email,
        userId: session.user.id,
        role: session.user.role
      };
    }
  } catch {
    // Ignore error
  }
  return { isAuthenticated: false };
}

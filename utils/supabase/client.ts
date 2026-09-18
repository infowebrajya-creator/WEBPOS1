import { createBrowserClient } from "@supabase/ssr";

const anyMeta = typeof import.meta !== "undefined" ? (import.meta as any) : {};
const supabaseUrl =
  anyMeta.env?.NEXT_PUBLIC_SUPABASE_URL ||
  anyMeta.env?.VITE_SUPABASE_URL ||
  (typeof process !== "undefined" && (process.env?.NEXT_PUBLIC_SUPABASE_URL || process.env?.VITE_SUPABASE_URL || process.env?.SUPABASE_URL)) ||
  "https://jkkwrhywfpbitwvffkxx.supabase.co";

const supabaseKey =
  anyMeta.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  anyMeta.env?.VITE_SUPABASE_ANON_KEY ||
  anyMeta.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  (typeof process !== "undefined" && (process.env?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env?.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env?.VITE_SUPABASE_ANON_KEY || process.env?.SUPABASE_ANON_KEY)) ||
  "sb_publishable_D1rREhO08nd1vWNmxyugCg_Fff4X10Y";

export const createClient = () =>
  createBrowserClient(
    supabaseUrl!,
    supabaseKey!,
  );

export const supabase = createClient();

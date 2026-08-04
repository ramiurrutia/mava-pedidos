import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

type SupabaseGlobal = typeof globalThis & {
  __mavaSupabaseClient?: SupabaseClient;
};

const supabaseGlobal = globalThis as SupabaseGlobal;

export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL
    && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase no está configurado. Revisa las variables de entorno.");
  }

  supabaseGlobal.__mavaSupabaseClient ??= createSupabaseClient(url, key, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });

  return supabaseGlobal.__mavaSupabaseClient;
}

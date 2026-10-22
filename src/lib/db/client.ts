import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const envSchema = z.object({
  SUPABASE_URL: z.string().url(),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
});

let client: SupabaseClient | undefined;

/** Server-side client using the service role key. Never import this from client components. */
export function getDb(): SupabaseClient {
  if (!client) {
    const env = envSchema.parse(process.env);
    client = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    });
  }
  return client;
}

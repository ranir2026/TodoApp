// Refuses to deploy a build without Supabase config: it would silently fall back to
// local-only storage on every device and stop syncing.
import { loadEnv } from "vite";

const env = loadEnv("production", process.cwd(), ["VITE_", "NEXT_PUBLIC_"]);
const url = env.VITE_SUPABASE_URL || env.NEXT_PUBLIC_SUPABASE_URL;
const key = env.VITE_SUPABASE_ANON_KEY || env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

if (!url || !key) {
  console.error("Missing Supabase URL/key. Add them to .env.local (see .env.example) before deploying.");
  process.exit(1);
}

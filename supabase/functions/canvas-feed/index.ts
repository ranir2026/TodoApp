// Supabase Edge Function: fetches and parses a Canvas calendar feed for the signed-in user.
// All logic lives in ../_shared (tested under Node); this file only wires in Deno.
// Deployed with JWT checking done in the handler (verify_jwt = false), because the gateway
// check doesn't work with Supabase's newer signing keys; the handler asks Auth directly.
import { createCanvasFeedHandler } from "../_shared/canvasFeedHandler.js";

const resolveDns = typeof Deno.resolveDns === "function"
  ? (hostname: string, type: "A" | "AAAA") => Deno.resolveDns(hostname, type)
  : undefined;

Deno.serve(createCanvasFeedHandler({
  env: (name: string) => Deno.env.get(name),
  resolveDns,
  log: (message: string) => console.warn(message),
}));

// scripts/env-local.mjs
// Genera .env.local con los datos del Supabase local (`npx supabase start` tiene que estar corriendo).
import { execSync } from "node:child_process";
import { writeFileSync } from "node:fs";

const status = JSON.parse(
  execSync("npx supabase status -o json", {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  }),
);

const first = (...keys) => keys.map((c) => status[c]).find(Boolean);

const env = {
  NEXT_PUBLIC_SUPABASE_URL: first("API_URL"),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: first("PUBLISHABLE_KEY", "ANON_KEY"),
  SUPABASE_SECRET_KEY: first("SECRET_KEY", "SERVICE_ROLE_KEY"),
  SUPABASE_DB_URL: first("DB_URL"),
};

for (const [clave, value] of Object.entries(env)) {
  if (!value) throw new Error(`No encontré ${clave} en "supabase status"`);
}

writeFileSync(
  ".env.local",
  Object.entries(env)
    .map(([clave, value]) => `${clave}=${value}`)
    .join("\n") + "\n",
);
console.log(".env.local actualizado");

import { spawn } from "node:child_process";
import { writeFileSync } from "node:fs";
import path from "node:path";
import { validarEntornoPruebas } from "./pruebas-entorno.mjs";

validarEntornoPruebas();
const appDir = process.env.EP_PRUEBAS_APP_DIR;
const root = process.env.EP_PRUEBAS_REPO_ROOT;
if (!appDir || !root || !process.env.EP_PRUEBAS_APP_STATE_FILE)
  throw new Error("Falta el directorio temporal de Next");
const child = spawn(
  process.execPath,
  [
    path.join(root, "node_modules/next/dist/bin/next"),
    "dev",
    appDir,
    "--port",
    "3001",
    "--hostname",
    "127.0.0.1",
  ],
  {
    cwd: appDir,
    env: { ...process.env, NODE_ENV: "development" },
    stdio: "inherit",
    detached: true,
  },
);
child.once("error", (error) => {
  console.error(`No se pudo iniciar Next: ${error.message}`);
  process.exitCode = 1;
});
if (child.pid)
  writeFileSync(
    process.env.EP_PRUEBAS_APP_STATE_FILE,
    JSON.stringify({
      pid: child.pid,
      runId: process.env.EP_PRUEBAS_RUN_ID,
      appDir,
    }),
    { mode: 0o600 },
  );
function parar(signal) {
  try {
    process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}
process.on("SIGINT", () => parar("SIGINT"));
process.on("SIGTERM", () => parar("SIGTERM"));
child.once("close", (code) => {
  parar("SIGKILL");
  process.exitCode = code ?? 1;
});

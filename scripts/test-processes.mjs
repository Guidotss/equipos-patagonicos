import { spawn } from "node:child_process";
import { appendFile, readFile } from "node:fs/promises";
import net from "node:net";
import { PORTS_TESTS } from './test-env.mjs';

export async function checkPorts(suite) {
  const ports = [
    PORTS_TESTS.api,
    PORTS_TESTS.db,
    PORTS_TESTS.shadow,
  ];
  if (suite === "e2e") ports.push(PORTS_TESTS.app);
  for (const port of ports) {
    await new Promise((resolve, reject) => {
      const server = net.createServer();
      server.once("error", () =>
        reject(
          new Error(
            `Puerto ${port} ocupado. No se reutilizan servidores existentes.`,
          ),
        ),
      );
      server.listen({ port, host: "0.0.0.0", exclusive: true }, () =>
        server.close(resolve),
      );
    });
  }
}

function signalGroup(child, signal) {
  if (!child.pid) return;
  try {
    if (process.platform === "win32") child.kill(signal);
    else process.kill(-child.pid, signal);
  } catch (error) {
    if (error.code !== "ESRCH") throw error;
  }
}

/** Captura la salida sensible; solo las suites tienen stdio heredado. Cada hijo tiene su propio grupo. */
export function runProcess(
  command,
  args,
  { cwd, env, signal, visible = false, logPath } = {},
) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new Error("Ejecución interrumpida"));
    const child = spawn(command, args, {
      cwd,
      env,
      detached: process.platform !== "win32",
      stdio: visible ? "inherit" : ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let output = "";
    let timer;
    const abortar = () => {
      signalGroup(child, "SIGTERM");
      timer = setTimeout(() => signalGroup(child, "SIGKILL"), 5000);
      timer.unref();
    };
    signal?.addEventListener("abort", abortar, { once: true });
    child.stdout?.on("data", (data) => {
      stdout += data;
      output += data;
    });
    child.stderr?.on("data", (data) => {
      output += data;
    });
    child.once("error", reject);
    child.once("close", async (code, killedBy) => {
      signal?.removeEventListener("abort", abortar);
      clearTimeout(timer);
      // Playwright suele terminar su webServer; este grupo también cubre salidas fallidas y señales.
      try {
        signalGroup(child, "SIGKILL");
        if (logPath) await appendFile(logPath, output, { mode: 0o600 });
        if (code !== 0 && !visible)
          return reject(
            new Error(
              `${command.split("/").at(-1)} ${args[0]} falló (${killedBy ?? code}); ver diagnóstico privado`,
            ),
          );
        resolve({ code: code ?? (killedBy === "SIGINT" ? 130 : 143), stdout });
      } catch (error) {
        reject(error);
      }
    });
  });
}

/** El webServer de Playwright puede tener otro grupo; su launcher registra el grupo propio de Next. */
export async function stopAplicacion(archivo, runId, appDir) {
  let state;
  try {
    state = JSON.parse(await readFile(archivo, "utf8"));
  } catch (error) {
    if (error.code === "ENOENT") return;
    throw error;
  }
  if (
    state.runId !== runId ||
    state.appDir !== appDir ||
    !Number.isSafeInteger(state.pid) ||
    state.pid <= 1
  ) {
    throw new Error("El proceso de Next no pertenece a esta ejecución");
  }
  const send = (signal) => {
    try {
      process.kill(-state.pid, signal);
      return true;
    } catch (error) {
      if (error.code === "ESRCH") return false;
      throw error;
    }
  };
  if (!send("SIGTERM")) return;
  await new Promise((resolve) => setTimeout(resolve, 1000));
  send("SIGKILL");
}

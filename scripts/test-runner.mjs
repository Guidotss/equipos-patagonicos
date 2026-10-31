import { randomUUID } from "node:crypto";
import {
  cp,
  mkdir,
  mkdtemp,
  open,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";
import {
  configurarSupabase,
  crearEnvTests,
  envWithoutConexiones,
  projectTests,
} from './test-env.mjs';
import {
  checkPorts as checkTestPorts,
  stopAplicacion,
  runProcess,
} from './test-processes.mjs';

const RAIZ = path.resolve(import.meta.dirname, "..");
const EXCLUIR =
  "realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor";

async function prepareProject(root, temp, id, suite) {
  const supabase = path.join(temp, "supabase");
  await mkdir(supabase);
  const original = await readFile(
    path.join(root, "supabase/config.toml"),
    "utf8",
  );
  await writeFile(
    path.join(supabase, "config.toml"),
    configurarSupabase(original, id),
    { mode: 0o600 },
  );
  await cp(
    path.join(root, "supabase/migrations"),
    path.join(supabase, "migrations"),
    { recursive: true },
  );
  await cp(
    path.join(root, "supabase/seed.sql"),
    path.join(supabase, "seed.sql"),
  );
  if (suite !== "e2e") return;
  const app = path.join(temp, "app");
  await mkdir(app);
  for (const archivo of [
    "src",
    "public",
    "assets",
    "package.json",
    "package-lock.json",
    "tsconfig.json",
    "next.config.ts",
  ]) {
    await cp(path.join(root, archivo), path.join(app, archivo), {
      recursive: true,
    });
  }
  // La app no contiene .env*, next-env ni cachés del servidor de desarrollo.
  await symlink(
    path.join(root, "node_modules"),
    path.join(app, "node_modules"),
    "dir",
  );
}

async function resourcesProject(run, projectId, options) {
  const filter = `label=com.supabase.cli.project=${projectId}`;
  const containers = await run(
    "docker",
    ["ps", "-aq", "--filter", filter],
    options,
  );
  const volumes = await run(
    "docker",
    ["volume", "ls", "-q", "--filter", filter],
    options,
  );
  const network = await run(
    "docker",
    ["network", "ls", "-q", "--filter", `name=^supabase_network_${projectId}$`],
    options,
  );
  const lines = (r) => r.stdout.trim().split(/\s+/).filter(Boolean);
  return {
    containers: lines(containers),
    volumes: lines(volumes),
    networks: lines(network),
  };
}

async function destruirProject(run, cli, projectId, options) {
  let errorStop;
  try {
    await run(
      cli,
      [
        "stop",
        "--project-id",
        projectId,
        "--no-backup",
        "--workdir",
        options.cwd,
      ],
      options,
    );
  } catch (error) {
    errorStop = error;
  }
  const resources = await resourcesProject(run, projectId, options);
  // Cubre un start parcialmente fallido, que puede dejar recursos fuera del alcance de stop.
  if (resources.containers.length)
    await run("docker", ["rm", "-f", ...resources.containers], options);
  if (resources.volumes.length)
    await run("docker", ["volume", "rm", ...resources.volumes], options);
  if (resources.networks.length)
    await run("docker", ["network", "rm", ...resources.networks], options);
  const restantes = await resourcesProject(run, projectId, options);
  if (Object.values(restantes).some((r) => r.length))
    throw new Error("Quedaron recursos del proyecto temporal");
  if (errorStop) throw errorStop;
}

/** Dependencias de procesos/señales inyectables para verificar fallos sin acceder a Docker ni a una BD. */
export async function runTests(
  suite,
  args = [],
  {
    root = RAIZ,
    env = process.env,
    run = runProcess,
    checkPorts = checkTestPorts,
    signals = process,
    log = console.error,
    lockPath = path.join(os.tmpdir(), "equipos-patagonicos-test-runner.lock"),
  } = {},
) {
  if (!["int", "e2e"].includes(suite)) {
    log("Uso: node scripts/test-runner.mjs <int|e2e> [argumentos]");
    return 1;
  }
  const id = randomUUID();
  const projectId = projectTests(id);
  const cli = path.join(root, "node_modules/.bin/supabase");
  const controller = new AbortController();
  let lock,
    temp,
    homeAttempted = false,
    code = 1,
    interrupt = 0,
    keep = false;
  const interrumpir = (codeSignal) => {
    interrupt ||= codeSignal;
    controller.abort();
  };
  const sigint = () => interrumpir(130);
  const sigterm = () => interrumpir(143);
  signals.on("SIGINT", sigint);
  signals.on("SIGTERM", sigterm);
  try {
    try {
      lock = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if (error.code === "EEXIST")
        throw new Error(
          `Otra ejecución tiene el bloqueo ${lockPath}; verificá su proceso antes de retirarlo`,
        );
      throw error;
    }
    await lock.writeFile(JSON.stringify({ pid: process.pid, projectId }));
    await checkPorts(suite);
    temp = await mkdtemp(path.join(root, ".test-run-"));
    await writeFile(
      path.join(temp, "ejecucion.json"),
      JSON.stringify({ pid: process.pid, projectId }),
      { mode: 0o600 },
    );
    await prepareProject(root, temp, id, suite);
    const options = {
      cwd: temp,
      env: envWithoutConexiones(env),
      logPath: path.join(temp, "diagnostico.log"),
    };
    const previos = await resourcesProject(run, projectId, {
      ...options,
      signal: controller.signal,
    });
    if (Object.values(previos).some((r) => r.length))
      throw new Error(
        "Ya hay recursos con este identificador; se rechaza un stack no propio",
      );
    homeAttempted = true;
    log(`Pruebas ${suite}: creando ${projectId} (API 55321 / BD 55322)`);
    await run(
      cli,
      ["start", "--exclude", EXCLUIR, "--workdir", temp],
      { ...options, signal: controller.signal },
    );
    // status contiene claves: se captura en memoria y no se imprime ni se guarda en el log.
    const status = await run(
      cli,
      ["status", "-o", "json", "--workdir", temp],
      { ...options, logPath: undefined, signal: controller.signal },
    );
    const testEnv = {
      ...crearEnvTests(JSON.parse(status.stdout), id, env),
      EP_TESTS_APP_DIR: path.join(temp, "app"),
      EP_TESTS_REPO_ROOT: root,
      EP_TESTS_APP_STATE_FILE: path.join(temp, "app-proceso.json"),
    };
    const bin = path.join(
      root,
      "node_modules/.bin",
      suite === "int" ? "vitest" : "playwright",
    );
    const cliArgs =
      suite === "int"
        ? ["run", "--project", "integration", ...args]
        : ["test", ...args];
    const result = await run(bin, cliArgs, {
      cwd: root,
      env: testEnv,
      visible: true,
      signal: controller.signal,
    });
    code = result.code;
  } catch (error) {
    log(`Pruebas: ${error.message}`);
    keep = true;
  } finally {
    if (temp && suite === "e2e") {
      try {
        await stopAplicacion(
          path.join(temp, "app-proceso.json"),
          id,
          path.join(temp, "app"),
        );
      } catch (error) {
        log(`Error de limpieza del servidor Next: ${error.message}`);
        code = 1;
        keep = true;
      }
    }
    if (homeAttempted) {
      try {
        await destruirProject(run, cli, projectId, {
          cwd: temp,
          env: envWithoutConexiones(env),
          logPath: path.join(temp, "diagnostico.log"),
        });
        log(
          `Pruebas: proyecto ${projectId} destruido (contenedores y volúmenes)`,
        );
      } catch (error) {
        log(`Error de limpieza de ${projectId}: ${error.message}`);
        code = 1;
        keep = true;
      }
    }
    try {
      if (temp) {
        if (keep)
          log(`Diagnóstico privado y datos de recuperación: ${temp}`);
        else await rm(temp, { recursive: true, force: true });
      }
    } catch (error) {
      log(
        `Error de limpieza de archivos temporales (${temp}): ${error.message}`,
      );
      code = 1;
    }
    try {
      if (lock) {
        await lock.close();
        await rm(lockPath, { force: true });
      }
    } catch (error) {
      log(`Error al liberar el bloqueo ${lockPath}: ${error.message}`);
      code = 1;
    } finally {
      signals.off("SIGINT", sigint);
      signals.off("SIGTERM", sigterm);
    }
  }
  return interrupt || code;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href
) {
  process.umask(0o077);
  process.exitCode = await runTests(
    process.argv[2],
    process.argv.slice(3),
  );
}

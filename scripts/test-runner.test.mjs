import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { once } from "node:events";
import { spawn } from "node:child_process";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  validarEntornoPruebas,
  crearEntornoPruebas,
  configurarSupabase,
  proyectoPruebas,
} from "./pruebas-entorno.mjs";
import { ejecutarPruebas } from "./pruebas.mjs";
import { detenerAplicacion, ejecutarProceso } from "./pruebas-procesos.mjs";

const id = "a1c25470-8da3-4eef-8833-e2d6ac27200d";
const status = {
  API_URL: "http://127.0.0.1:55321",
  DB_URL: "postgresql://postgres:postgres@127.0.0.1:55322/postgres",
  PUBLISHABLE_KEY: "publica-de-prueba",
  SECRET_KEY: "secreta-de-prueba",
};
const entorno = () =>
  crearEntornoPruebas(status, id, {
    PATH: "/bin",
    SUPABASE_SECRET_KEY: "ajena",
    DATABASE_URL: "ajena",
  });

test("el guard rechaza ejecución directa, desarrollo y destinos remotos antes de conectar", () => {
  assert.throws(() => validarEntornoPruebas({}), /runner/);
  for (const [variable, valor] of [
    ["NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"],
    ["NEXT_PUBLIC_SUPABASE_URL", "https://proyecto.supabase.co"],
    ["NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:55321/ruta"],
    ["SUPABASE_DB_URL", "postgresql://postgres:clave@localhost:54322/postgres"],
    ["SUPABASE_DB_URL", "postgresql://postgres:clave@remoto:55322/postgres"],
    ["EP_PRUEBAS_DB_PORT", "54322"],
    ["EP_PRUEBAS_PROJECT_ID", "equipos-patagonicos"],
  ])
    assert.throws(
      () => validarEntornoPruebas({ ...entorno(), [variable]: valor }),
      /aislad|runner/,
    );
  assert.equal(
    validarEntornoPruebas(entorno()).baseURL,
    "http://127.0.0.1:3001",
  );
});

test("el entorno toma las claves del status temporal y descarta conexiones heredadas", () => {
  const env = entorno();
  assert.equal(env.SUPABASE_SECRET_KEY, status.SECRET_KEY);
  assert.equal(
    env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    status.PUBLISHABLE_KEY,
  );
  assert.equal(env.DATABASE_URL, undefined);
  assert.equal(env.PATH, "/bin");
  assert.throws(
    () =>
      crearEntornoPruebas(
        { ...status, API_URL: "http://127.0.0.1:54321" },
        id,
        {},
      ),
    /aislad/,
  );
  assert.throws(
    () => crearEntornoPruebas({ ...status, SECRET_KEY: undefined }, id, {}),
    /claves/,
  );
});

test("la copia del config conserva migraciones/seed y cambia puertos, redirects y servicios opcionales", async () => {
  const original = await readFile(
    new URL("../supabase/config.toml", import.meta.url),
    "utf8",
  );
  const config = configurarSupabase(original, id);
  assert.ok(
    proyectoPruebas(id).length <= 40,
    "Supabase trunca nombres y labels a 40 caracteres",
  );
  assert.match(config, new RegExp(`project_id = "${proyectoPruebas(id)}"`));
  assert.match(config, /\[api\][\s\S]*?port = 55321/);
  assert.match(config, /\[db\][\s\S]*?port = 55322/);
  assert.match(config, /\[db.seed\]\n(?:#[^\n]*\n)*enabled = true/);
  assert.match(config, /sql_paths = \["\.\/seed.sql"\]/);
  assert.match(config, /\[studio\]\nenabled = false/);
  assert.match(config, /site_url = "http:\/\/127.0.0.1:3001"/);
  assert.doesNotMatch(
    config,
    /^(?:port|shadow_port|inspector_port) = (?:543\d\d|8083)$/m,
  );
});

async function escenario(fn, opciones = {}) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pruebas-runner-test-"));
  await mkdir(path.join(root, "supabase/migrations"), { recursive: true });
  await writeFile(
    path.join(root, "supabase/config.toml"),
    await readFile(new URL("../supabase/config.toml", import.meta.url)),
  );
  await writeFile(path.join(root, "supabase/seed.sql"), "-- semilla");
  const llamadas = [];
  const señales = new EventEmitter();
  const mensajes = [];
  let inicio = false;
  const recursos = {
    contenedor: opciones.residuo,
    volumen: opciones.residuo,
    red: opciones.residuo,
  };
  const ejecutar = async (comando, args, opts) => {
    llamadas.push({ comando, args, opts });
    if (args[0] === "status")
      return { code: 0, stdout: JSON.stringify(status) };
    if (args[0] === "start") inicio = true;
    if (opciones.fallarInicio && args[0] === "start")
      throw new Error("inicio parcial");
    if (opciones.fallarLimpieza && args[0] === "stop")
      throw new Error("stop falló");
    if (comando === "docker" && inicio) {
      const tipo =
        args[0] === "ps" || args[0] === "rm"
          ? "contenedor"
          : args[0] === "volume"
            ? "volumen"
            : "red";
      if (args.includes("rm")) recursos[tipo] = false;
      else if (recursos[tipo]) return { code: 0, stdout: `propio-${tipo}\n` };
    }
    if (args.includes("--project")) {
      if (opciones.interrumpir) señales.emit("SIGTERM");
      return { code: opciones.codigo ?? 0, stdout: "" };
    }
    return { code: 0, stdout: "" };
  };
  try {
    await fn({
      root,
      llamadas,
      mensajes,
      ejecutar,
      señales,
      checkPorts: async () => {},
      lockPath: path.join(root, "lock"),
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test("propaga argumentos y fallo de la suite y destruye únicamente el proyecto creado", async () => {
  await escenario(
    async (deps) => {
      const code = await ejecutarPruebas(
        "int",
        ["clientes", "--reporter=dot"],
        { ...deps, log: (m) => deps.mensajes.push(m) },
      );
      assert.equal(code, 7);
      const suite = deps.llamadas.find((c) => c.args.includes("--project"));
      assert.deepEqual(suite.args.slice(-2), ["clientes", "--reporter=dot"]);
      validarEntornoPruebas(suite.opts.env);
      const stop = deps.llamadas.find((c) => c.args[0] === "stop");
      assert.match(stop.args[2], /^equipos-patagonicos-test-/);
      assert.ok(stop.args.includes("--no-backup"));
      assert.ok(
        deps.llamadas.every(
          (c) => !c.args.includes("--all") && !c.args.includes("reset"),
        ),
      );
      assert.equal(
        deps.llamadas.find((c) => c.args[0] === "status").opts.logPath,
        undefined,
      );
      assert.ok(deps.mensajes.every((m) => !m.includes(status.SECRET_KEY)));
      await assert.rejects(readFile(deps.lockPath), { code: "ENOENT" });
    },
    { codigo: 7 },
  );
});

test("limpia aun cuando start falla parcialmente, y no intenta ejecutar tests", async () => {
  await escenario(
    async (deps) => {
      assert.equal(
        await ejecutarPruebas("int", [], { ...deps, log: () => {} }),
        1,
      );
      assert.ok(deps.llamadas.some((c) => c.args[0] === "stop"));
      assert.ok(!deps.llamadas.some((c) => c.args.includes("--project")));
    },
    { fallarInicio: true },
  );
});

test("un fallo de limpieza se hace visible y devuelve error aun si pasaron los tests", async () => {
  await escenario(
    async (deps) => {
      assert.equal(
        await ejecutarPruebas("int", [], {
          ...deps,
          log: (m) => deps.mensajes.push(m),
        }),
        1,
      );
      assert.ok(deps.mensajes.some((m) => m.includes("limpieza")));
    },
    { fallarLimpieza: true },
  );
});

test("un inicio parcial remueve residuos solo del label propio cuando stop falla", async () => {
  await escenario(
    async (deps) => {
      assert.equal(
        await ejecutarPruebas("int", [], { ...deps, log: () => {} }),
        1,
      );
      const comandosDocker = deps.llamadas.filter(
        (c) => c.comando === "docker",
      );
      const consultas = comandosDocker.filter((c) =>
        c.args.includes("--filter"),
      );
      assert.ok(
        consultas.every((c) =>
          c.args.at(-1).includes("equipos-patagonicos-test-"),
        ),
      );
      assert.deepEqual(
        comandosDocker.filter((c) => c.args.includes("rm")).map((c) => c.args),
        [
          ["rm", "-f", "propio-contenedor"],
          ["volume", "rm", "propio-volumen"],
          ["network", "rm", "propio-red"],
        ],
      );
    },
    { residuo: true, fallarInicio: true, fallarLimpieza: true },
  );
});

test("una interrupción conserva código 143 y pasa por la destrucción del proyecto", async () => {
  await escenario(
    async (deps) => {
      assert.equal(
        await ejecutarPruebas("int", [], { ...deps, log: () => {} }),
        143,
      );
      assert.ok(deps.llamadas.some((c) => c.args[0] === "stop"));
    },
    { interrumpir: true },
  );
});

test("rechaza puertos ocupados y doble ejecución antes de arrancar Supabase", async () => {
  await escenario(async (deps) => {
    const checkPorts = async () => {
      throw new Error("puerto ocupado");
    };
    assert.equal(
      await ejecutarPruebas("int", [], { ...deps, checkPorts, log: () => {} }),
      1,
    );
    assert.equal(deps.llamadas.length, 0);
    await writeFile(deps.lockPath, "otro proceso");
    assert.equal(
      await ejecutarPruebas("int", [], { ...deps, log: () => {} }),
      1,
    );
    assert.equal(await readFile(deps.lockPath, "utf8"), "otro proceso");
    assert.equal(deps.llamadas.length, 0);
  });
});

test("detiene el grupo de Next registrado, aunque esté fuera del grupo de Playwright", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "pruebas-proceso-test-"));
  const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
    detached: true,
    stdio: "ignore",
  });
  const cerrado = once(child, "exit");
  try {
    await once(child, "spawn");
    const archivo = path.join(root, "app-proceso.json");
    await writeFile(
      archivo,
      JSON.stringify({ pid: child.pid, runId: id, appDir: root }),
    );
    await assert.rejects(
      detenerAplicacion(archivo, "otra-corrida", root),
      /no pertenece/,
    );
    process.kill(child.pid, 0);
    await detenerAplicacion(archivo, id, root);
    await cerrado;
    assert.throws(() => process.kill(-child.pid, 0), { code: "ESRCH" });
  } finally {
    try {
      process.kill(-child.pid, "SIGKILL");
    } catch {
      /* Ya terminó. */
    }
    await rm(root, { recursive: true, force: true });
  }
});

test("el ejecutor propaga la interrupción de un proceso real", async () => {
  const controller = new AbortController();
  const resultado = ejecutarProceso(
    process.execPath,
    ["-e", "setInterval(() => {}, 1000)"],
    { signal: controller.signal, visible: true },
  );
  setTimeout(() => controller.abort(), 100);
  assert.equal((await resultado).code, 143);
});

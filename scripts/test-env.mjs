export const PORTS_TESTS = Object.freeze({
  api: 55321,
  db: 55322,
  shadow: 55320,
  app: 3001,
});
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function projectTests(id) {
  if (!UUID.test(id ?? ""))
    throw new Error("Identificador del runner inválido");
  // La CLI trunca a 40 caracteres los nombres y labels de Docker. Mantener el ID explícito idéntico.
  return `equipos-patagonicos-test-${id.replaceAll("-", "").slice(0, 15)}`;
}

function validateURL(value, protocolo, port) {
  try {
    const url = new URL(value);
    if (
      !protocolo.includes(url.protocol) ||
      url.hostname !== "127.0.0.1" ||
      url.port !== String(port) ||
      url.search ||
      url.hash ||
      (port === PORTS_TESTS.api &&
        (url.username || url.password || url.pathname !== "/")) ||
      (port === PORTS_TESTS.db && url.pathname !== "/postgres")
    )
      throw new Error();
    return url;
  } catch {
    throw new Error(
      "Las pruebas requieren URLs locales en los puertos aislados del runner (55321/55322)",
    );
  }
}

/** Se ejecuta antes de abrir cualquier cliente de BD/API y antes del setup de Playwright. */
export function validateEnvTests(env = process.env) {
  if (
    env.EP_TESTS_RUNNER !== "1" ||
    env.EP_PRUEBAS_PROJECT_ID !== projectTests(env.EP_TESTS_RUN_ID)
  ) {
    throw new Error(
      "Ejecutá las pruebas con el runner: npm run test:int o npm run test:e2e",
    );
  }
  if (
    env.EP_TESTS_API_PORT !== String(PORTS_TESTS.api) ||
    env.EP_PRUEBAS_DB_PORT !== String(PORTS_TESTS.db)
  ) {
    throw new Error(
      "Los puertos del entorno no coinciden con los puertos aislados del runner",
    );
  }
  validateURL(env.NEXT_PUBLIC_SUPABASE_URL, ["http:"], PORTS_TESTS.api);
  validateURL(
    env.SUPABASE_DB_URL,
    ["postgres:", "postgresql:"],
    PORTS_TESTS.db,
  );
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY)
    throw new Error("Faltan las claves del proyecto aislado");
  const baseURL = `http://127.0.0.1:${PORTS_TESTS.app}`;
  if (env.EP_TESTS_BASE_URL !== baseURL)
    throw new Error("La aplicación debe usar el puerto aislado del runner");
  return { baseURL, projectId: env.EP_PRUEBAS_PROJECT_ID };
}

/** No hereda credenciales de Supabase/PG ni configuraciones Next del shell del usuario. */
export function envWithoutConexiones(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(?:SUPABASE|NEXT_|__NEXT|EP_PRUEBAS|EP_TESTS|PG|DATABASE_URL|NODE_OPTIONS|NODE_ENV|PORT$)/.test(
          key,
        ),
    ),
  );
}

export function crearEnvTests(status, id, inherited = process.env) {
  const env = {
    ...envWithoutConexiones(inherited),
    EP_TESTS_RUNNER: "1",
    EP_TESTS_RUN_ID: id,
    EP_PRUEBAS_PROJECT_ID: projectTests(id),
    EP_TESTS_API_PORT: String(PORTS_TESTS.api),
    EP_PRUEBAS_DB_PORT: String(PORTS_TESTS.db),
    EP_TESTS_BASE_URL: `http://127.0.0.1:${PORTS_TESTS.app}`,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    SUPABASE_DB_URL: status.DB_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  validateEnvTests(env);
  return env;
}

export function configurarSupabase(original, id) {
  const changes = {
    "": { project_id: JSON.stringify(projectTests(id)) },
    api: { port: PORTS_TESTS.api },
    db: { port: PORTS_TESTS.db, shadow_port: PORTS_TESTS.shadow },
    "db.pooler": { enabled: false, port: 55329 },
    realtime: { enabled: false },
    studio: { enabled: false, port: 55323 },
    local_smtp: { enabled: false, port: 55324 },
    "storage.vector": { enabled: false },
    "storage.s3_protocol": { enabled: false },
    edge_runtime: { enabled: false, inspector_port: 55328 },
    analytics: { enabled: false, port: 55327 },
    auth: {
      site_url: '"http://127.0.0.1:3001"',
      additional_redirect_urls: '["http://127.0.0.1:3001"]',
    },
    "auth.rate_limit": { sign_in_sign_ups: 1000, token_refresh: 1000 },
  };
  let seccion = "";
  return original
    .split("\n")
    .map((line) => {
      const header = line.match(/^\[([^\]]+)\]$/);
      if (header) seccion = header[1];
      const clave = line.match(/^(\w+)\s*=/)?.[1];
      const value = changes[seccion]?.[clave];
      return value === undefined ? line : `${clave} = ${value}`;
    })
    .join("\n");
}

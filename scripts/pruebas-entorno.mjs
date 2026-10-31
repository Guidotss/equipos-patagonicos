export const PUERTOS_PRUEBAS = Object.freeze({
  api: 55321,
  db: 55322,
  shadow: 55320,
  app: 3001,
});
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function proyectoPruebas(id) {
  if (!UUID.test(id ?? ""))
    throw new Error("Identificador del runner inválido");
  // La CLI trunca a 40 caracteres los nombres y labels de Docker. Mantener el ID explícito idéntico.
  return `equipos-patagonicos-test-${id.replaceAll("-", "").slice(0, 15)}`;
}

function validarURL(valor, protocolo, puerto) {
  try {
    const url = new URL(valor);
    if (
      !protocolo.includes(url.protocol) ||
      url.hostname !== "127.0.0.1" ||
      url.port !== String(puerto) ||
      url.search ||
      url.hash ||
      (puerto === PUERTOS_PRUEBAS.api &&
        (url.username || url.password || url.pathname !== "/")) ||
      (puerto === PUERTOS_PRUEBAS.db && url.pathname !== "/postgres")
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
export function validarEntornoPruebas(env = process.env) {
  if (
    env.EP_PRUEBAS_RUNNER !== "1" ||
    env.EP_PRUEBAS_PROJECT_ID !== proyectoPruebas(env.EP_PRUEBAS_RUN_ID)
  ) {
    throw new Error(
      "Ejecutá las pruebas con el runner: npm run test:int o npm run test:e2e",
    );
  }
  if (
    env.EP_PRUEBAS_API_PORT !== String(PUERTOS_PRUEBAS.api) ||
    env.EP_PRUEBAS_DB_PORT !== String(PUERTOS_PRUEBAS.db)
  ) {
    throw new Error(
      "Los puertos del entorno no coinciden con los puertos aislados del runner",
    );
  }
  validarURL(env.NEXT_PUBLIC_SUPABASE_URL, ["http:"], PUERTOS_PRUEBAS.api);
  validarURL(
    env.SUPABASE_DB_URL,
    ["postgres:", "postgresql:"],
    PUERTOS_PRUEBAS.db,
  );
  if (!env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SECRET_KEY)
    throw new Error("Faltan las claves del proyecto aislado");
  const baseURL = `http://127.0.0.1:${PUERTOS_PRUEBAS.app}`;
  if (env.EP_PRUEBAS_BASE_URL !== baseURL)
    throw new Error("La aplicación debe usar el puerto aislado del runner");
  return { baseURL, projectId: env.EP_PRUEBAS_PROJECT_ID };
}

/** No hereda credenciales de Supabase/PG ni configuraciones Next del shell del usuario. */
export function entornoSinConexiones(env = process.env) {
  return Object.fromEntries(
    Object.entries(env).filter(
      ([key]) =>
        !/^(?:SUPABASE|NEXT_|__NEXT|EP_PRUEBAS|PG|DATABASE_URL|NODE_OPTIONS|NODE_ENV|PORT$)/.test(
          key,
        ),
    ),
  );
}

export function crearEntornoPruebas(status, id, heredado = process.env) {
  const env = {
    ...entornoSinConexiones(heredado),
    EP_PRUEBAS_RUNNER: "1",
    EP_PRUEBAS_RUN_ID: id,
    EP_PRUEBAS_PROJECT_ID: proyectoPruebas(id),
    EP_PRUEBAS_API_PORT: String(PUERTOS_PRUEBAS.api),
    EP_PRUEBAS_DB_PORT: String(PUERTOS_PRUEBAS.db),
    EP_PRUEBAS_BASE_URL: `http://127.0.0.1:${PUERTOS_PRUEBAS.app}`,
    NEXT_PUBLIC_SUPABASE_URL: status.API_URL,
    SUPABASE_DB_URL: status.DB_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
      status.PUBLISHABLE_KEY ?? status.ANON_KEY,
    SUPABASE_SECRET_KEY: status.SECRET_KEY ?? status.SERVICE_ROLE_KEY,
    NEXT_TELEMETRY_DISABLED: "1",
  };
  validarEntornoPruebas(env);
  return env;
}

export function configurarSupabase(original, id) {
  const cambios = {
    "": { project_id: JSON.stringify(proyectoPruebas(id)) },
    api: { port: PUERTOS_PRUEBAS.api },
    db: { port: PUERTOS_PRUEBAS.db, shadow_port: PUERTOS_PRUEBAS.shadow },
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
    .map((linea) => {
      const encabezado = linea.match(/^\[([^\]]+)\]$/);
      if (encabezado) seccion = encabezado[1];
      const clave = linea.match(/^(\w+)\s*=/)?.[1];
      const valor = cambios[seccion]?.[clave];
      return valor === undefined ? linea : `${clave} = ${valor}`;
    })
    .join("\n");
}

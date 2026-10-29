import { randomUUID } from 'node:crypto'
import { cp, mkdir, mkdtemp, open, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { configurarSupabase, crearEntornoPruebas, entornoSinConexiones, proyectoPruebas } from './pruebas-entorno.mjs'
import { comprobarPuertos, detenerAplicacion, ejecutarProceso } from './pruebas-procesos.mjs'

const RAIZ = path.resolve(import.meta.dirname, '..')
const EXCLUIR = 'realtime,imgproxy,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor'

async function prepararProyecto(root, temporal, id, suite) {
  const supabase = path.join(temporal, 'supabase')
  await mkdir(supabase)
  const original = await readFile(path.join(root, 'supabase/config.toml'), 'utf8')
  await writeFile(path.join(supabase, 'config.toml'), configurarSupabase(original, id), { mode: 0o600 })
  await cp(path.join(root, 'supabase/migrations'), path.join(supabase, 'migrations'), { recursive: true })
  await cp(path.join(root, 'supabase/seed.sql'), path.join(supabase, 'seed.sql'))
  if (suite !== 'e2e') return
  const app = path.join(temporal, 'app')
  await mkdir(app)
  for (const archivo of ['src', 'public', 'assets', 'package.json', 'package-lock.json', 'tsconfig.json', 'next.config.ts']) {
    await cp(path.join(root, archivo), path.join(app, archivo), { recursive: true })
  }
  // La app no contiene .env*, next-env ni cachés del servidor de desarrollo.
  await symlink(path.join(root, 'node_modules'), path.join(app, 'node_modules'), 'dir')
}

async function recursosProyecto(ejecutar, projectId, opciones) {
  const filtro = `label=com.supabase.cli.project=${projectId}`
  const contenedores = await ejecutar('docker', ['ps', '-aq', '--filter', filtro], opciones)
  const volumenes = await ejecutar('docker', ['volume', 'ls', '-q', '--filter', filtro], opciones)
  const red = await ejecutar('docker', ['network', 'ls', '-q', '--filter', `name=^supabase_network_${projectId}$`], opciones)
  const lineas = (r) => r.stdout.trim().split(/\s+/).filter(Boolean)
  return { contenedores: lineas(contenedores), volumenes: lineas(volumenes), redes: lineas(red) }
}

async function destruirProyecto(ejecutar, cli, projectId, opciones) {
  let errorStop
  try { await ejecutar(cli, ['stop', '--project-id', projectId, '--no-backup', '--workdir', opciones.cwd], opciones) }
  catch (error) { errorStop = error }
  const recursos = await recursosProyecto(ejecutar, projectId, opciones)
  // Cubre un start parcialmente fallido, que puede dejar recursos fuera del alcance de stop.
  if (recursos.contenedores.length) await ejecutar('docker', ['rm', '-f', ...recursos.contenedores], opciones)
  if (recursos.volumenes.length) await ejecutar('docker', ['volume', 'rm', ...recursos.volumenes], opciones)
  if (recursos.redes.length) await ejecutar('docker', ['network', 'rm', ...recursos.redes], opciones)
  const restantes = await recursosProyecto(ejecutar, projectId, opciones)
  if (Object.values(restantes).some((r) => r.length)) throw new Error('Quedaron recursos del proyecto temporal')
  if (errorStop) throw errorStop
}

/** Dependencias de procesos/señales inyectables para verificar fallos sin acceder a Docker ni a una BD. */
export async function ejecutarPruebas(suite, args = [], {
  root = RAIZ, env = process.env, ejecutar = ejecutarProceso, checkPorts = comprobarPuertos,
  señales = process, log = console.error, lockPath = path.join(os.tmpdir(), 'equipos-patagonicos-pruebas.lock'),
} = {}) {
  if (!['int', 'e2e'].includes(suite)) { log('Uso: node scripts/pruebas.mjs <int|e2e> [argumentos]'); return 1 }
  const id = randomUUID()
  const projectId = proyectoPruebas(id)
  const cli = path.join(root, 'node_modules/.bin/supabase')
  const controller = new AbortController()
  let lock, temporal, inicioIntentado = false, codigo = 1, interrupcion = 0, conservar = false
  const interrumpir = (codigoSeñal) => { interrupcion ||= codigoSeñal; controller.abort() }
  const sigint = () => interrumpir(130)
  const sigterm = () => interrumpir(143)
  señales.on('SIGINT', sigint)
  señales.on('SIGTERM', sigterm)
  try {
    try { lock = await open(lockPath, 'wx', 0o600) }
    catch (error) { if (error.code === 'EEXIST') throw new Error(`Otra ejecución tiene el bloqueo ${lockPath}; verificá su proceso antes de retirarlo`); throw error }
    await lock.writeFile(JSON.stringify({ pid: process.pid, projectId }))
    await checkPorts(suite)
    temporal = await mkdtemp(path.join(root, '.pruebas-'))
    await writeFile(path.join(temporal, 'ejecucion.json'), JSON.stringify({ pid: process.pid, projectId }), { mode: 0o600 })
    await prepararProyecto(root, temporal, id, suite)
    const opciones = { cwd: temporal, env: entornoSinConexiones(env), logPath: path.join(temporal, 'diagnostico.log') }
    const previos = await recursosProyecto(ejecutar, projectId, { ...opciones, signal: controller.signal })
    if (Object.values(previos).some((r) => r.length)) throw new Error('Ya hay recursos con este identificador; se rechaza un stack no propio')
    inicioIntentado = true
    log(`Pruebas ${suite}: creando ${projectId} (API 55321 / BD 55322)`)
    await ejecutar(cli, ['start', '--exclude', EXCLUIR, '--workdir', temporal], { ...opciones, signal: controller.signal })
    // status contiene claves: se captura en memoria y no se imprime ni se guarda en el log.
    const status = await ejecutar(cli, ['status', '-o', 'json', '--workdir', temporal], { ...opciones, logPath: undefined, signal: controller.signal })
    const testEnv = {
      ...crearEntornoPruebas(JSON.parse(status.stdout), id, env),
      EP_PRUEBAS_APP_DIR: path.join(temporal, 'app'), EP_PRUEBAS_REPO_ROOT: root,
      EP_PRUEBAS_APP_STATE_FILE: path.join(temporal, 'app-proceso.json'),
    }
    const bin = path.join(root, 'node_modules/.bin', suite === 'int' ? 'vitest' : 'playwright')
    const argumentos = suite === 'int' ? ['run', '--project', 'integration', ...args] : ['test', ...args]
    const resultado = await ejecutar(bin, argumentos, { cwd: root, env: testEnv, visible: true, signal: controller.signal })
    codigo = resultado.code
  } catch (error) { log(`Pruebas: ${error.message}`); conservar = true }
  finally {
    if (temporal && suite === 'e2e') {
      try { await detenerAplicacion(path.join(temporal, 'app-proceso.json'), id, path.join(temporal, 'app')) }
      catch (error) { log(`Error de limpieza del servidor Next: ${error.message}`); codigo = 1; conservar = true }
    }
    if (inicioIntentado) {
      try {
        await destruirProyecto(ejecutar, cli, projectId, { cwd: temporal, env: entornoSinConexiones(env), logPath: path.join(temporal, 'diagnostico.log') })
        log(`Pruebas: proyecto ${projectId} destruido (contenedores y volúmenes)`)
      } catch (error) { log(`Error de limpieza de ${projectId}: ${error.message}`); codigo = 1; conservar = true }
    }
    try {
      if (temporal) {
        if (conservar) log(`Diagnóstico privado y datos de recuperación: ${temporal}`)
        else await rm(temporal, { recursive: true, force: true })
      }
    } catch (error) {
      log(`Error de limpieza de archivos temporales (${temporal}): ${error.message}`)
      codigo = 1
    }
    try {
      if (lock) { await lock.close(); await rm(lockPath, { force: true }) }
    } catch (error) {
      log(`Error al liberar el bloqueo ${lockPath}: ${error.message}`)
      codigo = 1
    } finally {
      señales.off('SIGINT', sigint)
      señales.off('SIGTERM', sigterm)
    }
  }
  return interrupcion || codigo
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.umask(0o077)
  process.exitCode = await ejecutarPruebas(process.argv[2], process.argv.slice(3))
}

import assert from 'node:assert/strict';
import { EventEmitter, getEventListeners } from 'node:events';
import { setImmediate as nextTurn } from 'node:timers/promises';
import pg from 'pg';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { createUpgradeHooks, runFinancialUpgrade } from './test-financial-upgrade.mjs';
import { runTests } from './test-runner.mjs';
import { withUpgradeDatabase } from './financial-upgrade-fixtures.mjs';
import { crearEnvTests } from './test-env.mjs';

const migrationNames = ['20261104120000_financial_allocations.sql', '20261104121000_financial_operations.sql', '20261104122000_financial_views.sql'];
const localStatus = { API_URL: 'http://127.0.0.1:55321', DB_URL: 'postgresql://postgres:postgres@127.0.0.1:55322/postgres', PUBLISHABLE_KEY: 'publica-sintetica', SECRET_KEY: 'secreta-sintetica' };

async function scenario(callback, failure) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'financial-upgrade-native-'));
  const migrations = path.join(root, 'supabase/migrations');
  await mkdir(migrations, { recursive: true });
  await writeFile(path.join(root, 'supabase/config.toml'), await readFile(new URL('../supabase/config.toml', import.meta.url)));
  await writeFile(path.join(root, 'supabase/seed.sql'), '-- semilla');
  for (const name of [...migrationNames, '20261001000000_old.sql']) await writeFile(path.join(migrations, name), `-- ${name}`);
  const events = [];
  const signals = new EventEmitter();
  let temp;
  const run = async (command, args, options) => {
    if (args[0] === 'start') {
      temp = options.cwd;
      events.push('start');
      assert.deepEqual(await readdir(path.join(temp, 'supabase/migrations')), ['20261001000000_old.sql']);
    }
    if (args[0] === 'status') {
      if (failure === 'before-seed-abort') signals.emit('SIGTERM');
      return { code: 0, stdout: JSON.stringify(failure === 'external' ? { ...localStatus, API_URL: 'https://real.supabase.co' } : localStatus) };
    }
    if (args[0] === 'migration') {
      events.push('restore', 'apply');
      assert.deepEqual(args, ['migration', 'up', '--local', '--workdir', temp]);
      for (const name of migrationNames) assert.equal(await readFile(path.join(temp, 'supabase/migrations', name), 'utf8'), `-- ${name}`);
      assert.ok(options.signal);
      if (failure === 'migration') throw new Error('Fallo sintético de migración');
      if (failure === 'migration-abort') signals.emit('SIGTERM');
    }
    if (args.includes('--project')) {
      events.push('verify');
      assert.equal(args.at(-1), 'tests/integration/financial-upgrade.test.ts');
      assert.deepEqual(JSON.parse(await readFile(options.env.EP_TESTS_FINANCIAL_UPGRADE_SNAPSHOT, 'utf8')), { before: { invoices: [] } });
    }
    if (args[0] === 'stop') events.push('cleanup');
    return { code: 0, stdout: '' };
  };
  const seed = async (env, { signal }) => {
    events.push('seed');
    assert.equal(env.SUPABASE_SECRET_KEY, localStatus.SECRET_KEY);
    assert.equal(signal.aborted, false);
    assert.deepEqual(await readdir(path.join(temp, 'supabase/migrations')), ['20261001000000_old.sql']);
    if (failure === 'seed') throw new Error('Fallo sintético de semilla');
    if (failure === 'seed-abort') signals.emit('SIGTERM');
    return { before: { invoices: [] } };
  };
  try {
    await callback({ root, run, seed, signals, checkPorts: async () => {}, lockPath: path.join(root, 'lock'), log: () => {} }, events);
    for (const name of migrationNames) assert.equal(await readFile(path.join(migrations, name), 'utf8'), `-- ${name}`);
    await assert.rejects(readFile(path.join(root, 'lock')), { code: 'ENOENT' });
    assert.equal(signals.listenerCount('SIGTERM'), 0);
  } finally { await rm(root, { recursive: true, force: true }); }
}

test('la actualización copia, retira, inicia, siembra, restaura, migra y verifica sin tocar el origen', async () => {
  await scenario(async (options, events) => {
    assert.equal(await runFinancialUpgrade(options), 0);
    assert.deepEqual(events, ['start', 'seed', 'restore', 'apply', 'verify', 'cleanup']);
  });
});

for (const failure of ['seed', 'migration', 'external', 'before-seed-abort', 'seed-abort', 'migration-abort']) {
  test(`limpia y libera el bloqueo ante ${failure}, sin verificar un upgrade incompleto`, async () => {
    await scenario(async (options, events) => {
      assert.equal(await runFinancialUpgrade(options), failure.endsWith('abort') ? 143 : 1);
      assert.equal(events.at(-1), 'cleanup');
      assert.ok(!events.includes('verify'));
      if (['external', 'before-seed-abort'].includes(failure)) assert.ok(!events.includes('seed'));
      if (['seed', 'seed-abort'].includes(failure)) assert.ok(!events.includes('apply'));
    }, failure);
  });
}

test('un fallo del hook de copia libera el bloqueo sin iniciar ni detener un stack', async () => {
  await scenario(async (options, events) => {
    assert.equal(await runTests('int', [], { ...options, afterProjectCopy: async () => { throw new Error('Fallo del hook'); } }), 1);
    assert.deepEqual(events, []);
  });
});

test('rechaza modificar el proyecto original fuera de la copia del runner', async () => {
  const hooks = createUpgradeHooks();
  await assert.rejects(hooks.afterProjectCopy({ temp: path.resolve(import.meta.dirname, '..'), projectId: 'real' }), /copia temporal/);
});

test('revalida el entorno extendido por un hook antes de lanzar la suite', async () => {
  await scenario(async (options, events) => {
    assert.equal(await runTests('int', [], { ...options, beforeTests: async ({ testEnv }) => { testEnv.SUPABASE_DB_URL = 'postgresql://real/production'; } }), 1);
    assert.ok(!events.includes('verify'));
    assert.equal(events.at(-1), 'cleanup');
  });
});


test('abortar una conexión pendiente termina con 143 y libera recursos y bloqueo sin red', async (t) => {
  await scenario(async (options, events) => {
    let rejectConnection;
    let endCalls = 0;
    let signal;
    const callback = t.mock.fn();
    const connection = new Promise((_, reject) => { rejectConnection = reject; });
    const database = {
      connect() {
        queueMicrotask(() => options.signals.emit('SIGTERM'));
        return connection;
      },
      async end() { endCalls++; },
    };
    t.mock.method(pg, 'Client', function MockDatabase() { return database; });
    const running = runFinancialUpgrade({ ...options, seed: (env, context) => {
      signal = context.signal;
      return withUpgradeDatabase(env, callback, context);
    } });
    let timer;
    try {
      const deadline = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error('El aborto quedó esperando connect()')), 1000);
      });
      assert.equal(await Promise.race([running, deadline]), 143);
      assert.deepEqual(events, ['start', 'cleanup']);
      assert.equal(callback.mock.callCount(), 0);
      assert.equal(endCalls, 1);
      assert.equal(getEventListeners(signal, 'abort').length, 0);
    } finally {
      clearTimeout(timer);
      // El rechazo tardío también tiene que quedar observado después de cancelar la espera.
      rejectConnection(new Error('Fallo tardío de conexión sintética'));
      await running;
      await nextTurn();
    }
  });
});

for (const outcome of ['success', 'error']) {
  test(`la conexión ${outcome} cierra el cliente y retira el listener de aborto sin red`, async (t) => {
    const controller = new AbortController();
    const error = new Error('Error sintético de conexión');
    const callback = t.mock.fn(async () => 'resultado');
    let endCalls = 0;
    const database = {
      async connect() { if (outcome === 'error') throw error; },
      async end() { endCalls++; },
    };
    t.mock.method(pg, 'Client', function MockDatabase() { return database; });
    const env = crearEnvTests(localStatus, 'a1c25470-8da3-4eef-8833-e2d6ac27200d', {});
    const result = withUpgradeDatabase(env, callback, { signal: controller.signal });
    if (outcome === 'error') await assert.rejects(result, error);
    else assert.equal(await result, 'resultado');
    assert.equal(callback.mock.callCount(), outcome === 'success' ? 1 : 0);
    assert.equal(endCalls, 1);
    assert.equal(getEventListeners(controller.signal, 'abort').length, 0);
    controller.abort();
    await nextTurn();
    assert.equal(endCalls, 1);
  });
}

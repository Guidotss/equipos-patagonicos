import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateEnvTests } from './test-env.mjs';
import { runTests } from './test-runner.mjs';
import { seedLegacyFinancialData } from './financial-upgrade-fixtures.mjs';

const financialMigration = /^(20261104120000|20261104121000|20261104122000)_.+\.sql$/;

async function assertOwnedCopy(temp, projectId) {
  if (!path.basename(temp).startsWith('.test-run-')) throw new Error('Se requiere una copia temporal propia del runner');
  const owner = JSON.parse(await readFile(path.join(temp, 'ejecucion.json'), 'utf8'));
  if (owner.projectId !== projectId || owner.pid !== process.pid) throw new Error('La copia temporal no pertenece a esta ejecución');
}

export function createUpgradeHooks({ seed = seedLegacyFinancialData } = {}) {
  let migrations;
  return {
    async afterProjectCopy({ temp, projectId }) {
      await assertOwnedCopy(temp, projectId);
      const directory = path.join(temp, 'supabase/migrations');
      migrations = (await readdir(directory)).filter((name) => financialMigration.test(name)).sort();
      if (!migrations.some((name) => name.startsWith('20261104120000_'))) throw new Error('Falta la primera migración financiera');
      await mkdir(path.join(temp, 'financial-migrations'));
      for (const name of migrations) await rename(path.join(directory, name), path.join(temp, 'financial-migrations', name));
    },
    async beforeTests({ temp, projectId, testEnv, signal, run }) {
      validateEnvTests(testEnv);
      await assertOwnedCopy(temp, projectId);
      signal?.throwIfAborted();
      const snapshot = await seed(testEnv, { signal });
      signal?.throwIfAborted();
      const snapshotPath = path.join(temp, 'financial-upgrade-snapshot.json');
      await writeFile(snapshotPath, JSON.stringify(snapshot), { mode: 0o600 });
      for (const name of migrations) await rename(path.join(temp, 'financial-migrations', name), path.join(temp, 'supabase/migrations', name));
      validateEnvTests(testEnv);
      await run(path.join(testEnv.EP_TESTS_REPO_ROOT, 'node_modules/.bin/supabase'),
        ['migration', 'up', '--local', '--workdir', temp]);
      testEnv.EP_TESTS_FINANCIAL_UPGRADE_SNAPSHOT = snapshotPath;
    },
  };
}

export async function runFinancialUpgrade({ seed, ...runnerOptions } = {}) {
  return runTests('int', ['tests/integration/financial-upgrade.test.ts'], {
    ...runnerOptions, ...createUpgradeHooks({ seed }),
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  process.umask(0o077);
  process.exitCode = await runFinancialUpgrade();
}

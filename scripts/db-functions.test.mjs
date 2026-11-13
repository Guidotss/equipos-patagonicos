import { strict as assert } from 'node:assert'
import {
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  checkFunctionFiles,
  initializeFunctionFiles,
  readCurrentFunctions,
} from './db-functions.mjs'

test('conserva la última definición y excluye funciones eliminadas', () => {
  const root = mkdtempSync(join(tmpdir(), 'db-functions-'))
  try {
    const migrations = join(root, 'migrations')
    const functions = join(root, 'functions')
    mkdirSync(migrations)
    writeFileSync(
      join(migrations, '001.sql'),
      `create function public.search() returns int language sql as $$ select 1 $$;\ncreate function private.old() returns int language sql as $$ select 2 $$;\n`,
    )
    writeFileSync(
      join(migrations, '002.sql'),
      `create or replace function public.search() returns int language sql as $$ select 3 $$;\ndrop function private.old();\n`,
    )
    const current = readCurrentFunctions(migrations)
    assert.deepEqual([...current.keys()], ['public.search'])
    initializeFunctionFiles(current, functions)
    assert.equal(checkFunctionFiles(current, functions).length, 0)
    assert.match(
      readFileSync(join(functions, 'public/search.sql'), 'utf8'),
      /select 3/,
    )
    writeFileSync(
      join(functions, 'public/search.sql'),
      'create function public.search() returns int language sql as $$ select 1 $$;\n',
    )
    assert.equal(checkFunctionFiles(current, functions).length, 1)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

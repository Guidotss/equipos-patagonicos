import {
  existsSync,
  readFileSync,
  readdirSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const definitionPattern =
  /^(create (?:or replace )?function|drop function(?: if exists)?) (public|private)\.([a-z_][a-z_0-9]*)\(/gim

export function findDefinitions(sql, migration) {
  const definitions = []
  for (const match of sql.matchAll(definitionPattern)) {
    const [statement, , schema, name] = match
    if (statement.toLowerCase().startsWith('drop')) {
      definitions.push({ schema, name, sql: null, migration })
      continue
    }
    const end = sql.indexOf('$$;', match.index + statement.length)
    if (end < 0)
      throw new Error(`Falta el cierre de ${schema}.${name} en ${migration}`)
    definitions.push({
      schema,
      name,
      sql: sql.slice(match.index, end + 3).trim(),
      migration,
    })
  }
  return definitions
}

export function readCurrentFunctions(migrationsDirectory) {
  const current = new Map()
  const migrations = readdirSync(migrationsDirectory)
    .filter((name) => name.endsWith('.sql'))
    .sort()
  for (const migration of migrations) {
    const sql = readFileSync(join(migrationsDirectory, migration), 'utf8')
    for (const definition of findDefinitions(sql, migration)) {
      const key = `${definition.schema}.${definition.name}`
      if (definition.sql === null) current.delete(key)
      else current.set(key, definition)
    }
  }
  return current
}

export function checkFunctionFiles(current, functionsDirectory) {
  const errors = []
  for (const [key, definition] of current) {
    const path = join(
      functionsDirectory,
      definition.schema,
      `${definition.name}.sql`,
    )
    if (!existsSync(path)) {
      errors.push(`Falta ${relative(process.cwd(), path)}`)
      continue
    }
    const file = readFileSync(path, 'utf8')
    const matches = findDefinitions(file, path).filter(
      (entry) => entry.sql !== null,
    )
    if (
      matches.length !== 1 ||
      `${matches[0].schema}.${matches[0].name}` !== key ||
      matches[0].sql !== definition.sql
    ) {
      errors.push(
        `${relative(process.cwd(), path)} no coincide con ${definition.migration}`,
      )
    }
  }
  for (const schema of ['public', 'private']) {
    const directory = join(functionsDirectory, schema)
    if (!existsSync(directory)) continue
    for (const name of readdirSync(directory).filter((file) =>
      file.endsWith('.sql'),
    )) {
      if (!current.has(`${schema}.${name.slice(0, -4)}`))
        errors.push(`Sobra ${relative(process.cwd(), join(directory, name))}`)
    }
  }
  return errors
}

export function initializeFunctionFiles(current, functionsDirectory) {
  if (existsSync(functionsDirectory))
    throw new Error(
      `Ya existe ${functionsDirectory}; no se sobrescriben archivos SQL`,
    )
  for (const definition of current.values()) {
    const directory = join(functionsDirectory, definition.schema)
    mkdirSync(directory, { recursive: true })
    writeFileSync(
      join(directory, `${definition.name}.sql`),
      `${definition.sql}\n`,
    )
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const command = process.argv[2]
  const root = join(import.meta.dirname, '..')
  const functionsDirectory = join(root, 'supabase/functions')
  const current = readCurrentFunctions(join(root, 'supabase/migrations'))
  if (command === 'init') {
    initializeFunctionFiles(current, functionsDirectory)
    console.log(`Se crearon ${current.size} archivos SQL`)
  } else if (command === 'check') {
    const errors = checkFunctionFiles(current, functionsDirectory)
    if (errors.length) {
      console.error(errors.join('\n'))
      process.exitCode = 1
    } else
      console.log(`${current.size} funciones SQL coinciden con las migraciones`)
  } else {
    console.error('Uso: node scripts/db-functions.mjs <init|check>')
    process.exitCode = 1
  }
}

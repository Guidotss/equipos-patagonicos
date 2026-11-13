import assert from 'node:assert/strict'
import test from 'node:test'
import { main } from './create-user.mjs'

const userId = '11111111-1111-4111-8111-111111111111'
const equipmentId = '22222222-2222-4222-8222-222222222222'
const email = 'gruista@example.test'
const password = 'contraseña-exclusiva-de-prueba'
const secretKey = 'clave-ficticia-sin-acceso'
const testEnv = {
  NEXT_PUBLIC_SUPABASE_URL: 'https://supabase.example.test',
  SUPABASE_SECRET_KEY: secretKey,
}
const baseArgs = [
  '--email',
  email,
  '--password',
  password,
  '--name',
  'Gruista de prueba',
]
const craneArgs = [...baseArgs, '--role', 'crane_operator']
const legacyCraneArgs = [...craneArgs, '--equipment-id', equipmentId]

const equipmentStep = (
  body = [{ id: equipmentId, activo: true }],
  status = 200,
) => ({
  method: 'GET',
  path: '/rest/v1/equipos',
  query: { id: `eq.${equipmentId}`, select: 'id,activo' },
  body,
  status,
})
const createStep = () => ({
  method: 'POST',
  path: '/auth/v1/admin/users',
  request: {
    email,
    password,
    email_confirm: true,
    user_metadata: { nombre: 'Gruista de prueba' },
  },
  body: { id: userId, email },
})
const profileStep = (role = 'admin') => ({
  method: 'PATCH',
  path: '/rest/v1/profiles',
  query: { id: `eq.${userId}`, select: 'id' },
  request: { nombre: 'Gruista de prueba', rol: role, activo: false },
  body: { id: userId },
})
const assignmentStep = () => ({
  method: 'POST',
  path: '/rest/v1/crane_operator_assignments',
  request: { user_id: userId, equipment_id: equipmentId },
  body: null,
  status: 201,
})
const activationStep = () => ({
  method: 'PATCH',
  path: '/rest/v1/profiles',
  query: { id: `eq.${userId}`, select: 'id' },
  request: { activo: true },
  body: { id: userId },
})
const cleanupStep = () => ({
  method: 'DELETE',
  path: `/auth/v1/admin/users/${userId}`,
  body: { id: userId, email },
})
const failStep = (step) => ({
  ...step,
  status: 400,
  body: { code: '23514', message: `Error interno: ${password} ${secretKey}` },
})

async function runWithRequests(t, args, steps, env = testEnv) {
  const remaining = [...steps]
  const requests = []
  const unexpected = []
  const output = []
  const fetchMock = t.mock.method(
    globalThis,
    'fetch',
    async (input, init = {}) => {
      try {
        const request = new Request(input, init)
        const url = new URL(request.url)
        const step = remaining.shift()
        assert.ok(step, `Pedido inesperado: ${request.method} ${url.pathname}`)
        assert.equal(url.origin, testEnv.NEXT_PUBLIC_SUPABASE_URL)
        assert.equal(request.method, step.method)
        assert.equal(url.pathname, step.path)
        assert.deepEqual(Object.fromEntries(url.searchParams), step.query ?? {})
        const bodyText = await request.text()
        const body = bodyText ? JSON.parse(bodyText) : undefined
        if (step.request) assert.deepEqual(body, step.request)
        requests.push({ method: request.method, path: url.pathname, body })
        return new Response(
          step.body === null ? null : JSON.stringify(step.body),
          {
            status: step.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
          },
        )
      } catch (error) {
        unexpected.push(error)
        throw error
      }
    },
  )
  const code = await main(args, {
    env,
    fetch: globalThis.fetch,
    log: (value) => output.push(value),
    error: (value) => output.push(value),
  })
  fetchMock.mock.restore()
  assert.deepEqual(
    unexpected,
    [],
    'Todos los pedidos deben estar previstos; nunca se usa la red real',
  )
  assert.equal(remaining.length, 0, 'Se deben completar los pedidos previstos')
  assert.ok(
    output.every(
      (line) => !line.includes(password) && !line.includes(secretKey),
    ),
    'La salida no debe contener contraseñas ni claves',
  )
  return { code, requests, output: output.join('\n') }
}

test('crea y activa un gruista sin asignarle una grúa', async (t) => {
  const result = await runWithRequests(t, craneArgs, [
    createStep(),
    profileStep('crane_operator'),
    activationStep(),
  ])
  assert.equal(result.code, 0)
  assert.match(result.output, /creado y activo con rol crane_operator/)
})

test('conserva la opción legada de asignar la grúa antes de activar', async (t) => {
  const result = await runWithRequests(t, legacyCraneArgs, [
    equipmentStep(),
    createStep(),
    profileStep('crane_operator'),
    assignmentStep(),
    activationStep(),
  ])
  assert.equal(result.code, 0)
  assert.match(result.output, /creado y activo con rol crane_operator/)
  assert.equal(result.requests.at(-1).body.activo, true)
})

test('conserva --nombre y --rol y el contrato persistido nombre/operador', async (t) => {
  const args = [
    '--email',
    email,
    '--password',
    password,
    '--nombre',
    'Gruista de prueba',
    '--rol',
    'operador',
  ]
  const result = await runWithRequests(t, args, [
    createStep(),
    profileStep('operador'),
    activationStep(),
  ])
  assert.equal(result.code, 0)
  assert.match(result.output, /rol operador/)
})

test('mantiene admin como rol por defecto con nombre canónico o legado', async (t) => {
  for (const nameFlag of ['--name', '--nombre']) {
    const args = [
      '--email',
      email,
      '--password',
      password,
      nameFlag,
      'Gruista de prueba',
    ]
    const result = await runWithRequests(t, args, [
      createStep(),
      profileStep(),
      activationStep(),
    ])
    assert.equal(result.code, 0)
    assert.match(result.output, /rol admin/)
  }
})

test('acepta aliases simultáneos cuando sus valores coinciden', async (t) => {
  const args = [
    ...baseArgs,
    '--nombre',
    'Gruista de prueba',
    '--role',
    'operador',
    '--rol',
    'operador',
  ]
  assert.equal(
    (
      await runWithRequests(t, args, [
        createStep(),
        profileStep('operador'),
        activationStep(),
      ])
    ).code,
    0,
  )
})

test('rechaza conflictos de aliases sin crear cuentas ni hacer pedidos', async (t) => {
  for (const [flags, message] of [
    [['--nombre', 'Otro nombre'], /--name y --nombre.*diferentes/],
    [['--role', 'admin', '--rol', 'operador'], /--role y --rol.*diferentes/],
  ]) {
    const result = await runWithRequests(t, [...baseArgs, ...flags], [])
    assert.equal(result.code, 1)
    assert.match(result.output, message)
  }
})

test('valida los datos requeridos, email y contraseña antes de cualquier pedido', async (t) => {
  for (const args of [
    [],
    ['--email', email, '--password', password],
    ['--email', email, '--name', 'Nombre'],
    ['--password', password, '--name', 'Nombre'],
    ['--email', email, '--password', ' ', '--name', 'Nombre'],
    ['--email', 'email-inválido', '--password', password, '--name', 'Nombre'],
    ['--email', email, '--password', '123', '--name', 'Nombre'],
    [...baseArgs, '--desconocido', 'dato'],
  ]) {
    assert.equal((await runWithRequests(t, args, [])).code, 1)
  }
})

test('rechaza roles y UUID inválidos o grúa para otros roles antes del alta', async (t) => {
  for (const [flags, message] of [
    [['--role', 'operator'], /--role/],
    [['--role', ''], /--role/],
    [['--role', 'crane_operator', '--equipment-id', 'inválido'], /UUID/],
    [['--equipment-id', equipmentId], /Solo un gruista/],
    [['--role', 'operador', '--equipment-id', equipmentId], /Solo un gruista/],
  ]) {
    const result = await runWithRequests(t, [...baseArgs, ...flags], [])
    assert.equal(result.code, 1)
    assert.match(result.output, message)
  }
})

test('no crea la cuenta si la grúa no existe, está inactiva o falla la verificación', async (t) => {
  for (const step of [
    equipmentStep([]),
    equipmentStep([{ id: equipmentId, activo: false }]),
    failStep(equipmentStep()),
  ]) {
    const result = await runWithRequests(t, legacyCraneArgs, [step])
    assert.equal(result.code, 1)
    assert.match(result.output, /No se creó ningún usuario/)
    assert.deepEqual(
      result.requests.map((request) => request.method),
      ['GET'],
    )
  }
})

test('valida el entorno antes de conectar sin usar claves reales', async (t) => {
  for (const env of [
    {},
    { ...testEnv, SUPABASE_SECRET_KEY: '' },
    { ...testEnv, NEXT_PUBLIC_SUPABASE_URL: 'no-es-url' },
  ]) {
    const result = await runWithRequests(t, baseArgs, [], env)
    assert.equal(result.code, 1)
    assert.match(result.output, /entorno/)
  }
})

test('no intenta borrar usuarios si Auth rechaza el alta y oculta errores internos', async (t) => {
  const result = await runWithRequests(t, baseArgs, [failStep(createStep())])
  assert.equal(result.code, 1)
  assert.match(result.output, /No se pudo crear el usuario/)
})

test('borra el usuario recién creado si falla la configuración del perfil', async (t) => {
  const result = await runWithRequests(t, baseArgs, [
    createStep(),
    failStep(profileStep()),
    cleanupStep(),
  ])
  assert.equal(result.code, 1)
  assert.match(result.output, /No se pudo configurar el perfil/)
  assert.match(result.output, /Se eliminó el usuario/)
  assert.equal(result.requests.at(-1).method, 'DELETE')
})

test('borra usuario, perfil y asignación por cascada si falla la asignación', async (t) => {
  const result = await runWithRequests(t, legacyCraneArgs, [
    equipmentStep(),
    createStep(),
    profileStep('crane_operator'),
    failStep(assignmentStep()),
    cleanupStep(),
  ])
  assert.equal(result.code, 1)
  assert.match(result.output, /No se pudo asignar la grúa/)
  assert.match(result.output, /perfil y asignación/)
  assert.ok(!result.requests.some((request) => request.body?.activo === true))
})

test('borra usuario, perfil y asignación por cascada si falla la activación final', async (t) => {
  const result = await runWithRequests(t, legacyCraneArgs, [
    equipmentStep(),
    createStep(),
    profileStep('crane_operator'),
    assignmentStep(),
    failStep(activationStep()),
    cleanupStep(),
  ])
  assert.equal(result.code, 1)
  assert.match(result.output, /No se pudo activar/)
  assert.match(result.output, /Se eliminó el usuario/)
})

test('informa el ID pendiente si falla la limpieza, sin filtrar contraseñas o claves', async (t) => {
  const result = await runWithRequests(t, baseArgs, [
    createStep(),
    profileStep(),
    failStep(activationStep()),
    failStep(cleanupStep()),
  ])
  assert.equal(result.code, 1)
  assert.match(result.output, /Usuario pendiente de revisión/)
  assert.ok(result.output.includes(userId))
  assert.doesNotMatch(result.output, /Error interno/)
})

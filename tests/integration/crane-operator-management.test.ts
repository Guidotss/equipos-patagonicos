import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCraneFixture, NOTE_DATA, submitNote, type TestClient, type TestUser } from './crane-operator-helpers'
import { adminClient, anonClient, contraTransaccionInCurso, sql } from './helpers'

const fixture = createCraneFixture()
let admin: TestUser
let staff: TestUser
let worker: TestUser
let inactiveStaff: TestUser
let inactiveAdmin: TestUser
let inactiveWorker: TestUser
let equipmentId: string
let otherEquipmentId: string
let inactiveEquipmentId: string

beforeAll(async () => {
  admin = await fixture.user('admin')
  staff = await fixture.user('operador')
  worker = await fixture.user()
  inactiveStaff = await fixture.user('operador', false)
  inactiveAdmin = await fixture.user('admin', false)
  inactiveWorker = await fixture.user('crane_operator', false)
  equipmentId = await fixture.equipment()
  otherEquipmentId = await fixture.equipment()
  inactiveEquipmentId = await fixture.equipment(false)
  expect((await fixture.assign(admin.client, worker.id, equipmentId)).error).toBeNull()
})
afterAll(() => fixture.cleanup())

function setAccess(client: TestClient, userId: string, active: boolean, craneId: string | null = null) {
  return client.rpc('set_crane_operator_access', {
    p_user_id: userId, p_active: active, ...(craneId ? { p_equipment_id: craneId } : {}),
  })
}

function completeSignup(userId: string, actorId = staff.id, name = 'Gruista nuevo', craneId = equipmentId) {
  return adminClient().rpc('complete_crane_operator_signup', {
    p_user_id: userId, p_actor_id: actorId, p_name: name, p_equipment_id: craneId,
  })
}

async function accountState(userId: string) {
  const profiles = await sql('select * from public.profiles where id=$1', [userId])
  const assignments = await sql('select * from public.crane_operator_assignments where user_id=$1', [userId])
  return { profiles, assignments }
}

async function listWorker(userId: string) {
  const result = await staff.client.rpc('list_crane_operators')
  expect(result.error).toBeNull()
  return result.data!.find(row => row.user_id === userId)
}

describe('gestión de gruistas por personal activo', () => {
  it('administración y operadores reciben solo gruistas y los campos permitidos', async () => {
    for (const client of [admin.client, staff.client]) {
      const result = await client.rpc('list_crane_operators')
      expect(result.error).toBeNull()
      const row = result.data!.find(item => item.user_id === worker.id)!
      expect(row).toEqual({ user_id: worker.id, name: 'Usuario de prueba', email: worker.email,
        active: true, equipment_id: equipmentId, equipment_name: `Grúa de prueba ${equipmentId}`,
        equipment_active: true, note_count: 0, pending_note_count: 0, last_submission_at: null })
      expect(Object.keys(row).sort()).toEqual(['user_id', 'name', 'email', 'active', 'equipment_id',
        'equipment_name', 'equipment_active', 'note_count', 'pending_note_count', 'last_submission_at'].sort())
      expect(result.data!.some(item => [admin.id, staff.id, inactiveStaff.id, inactiveAdmin.id].includes(item.user_id))).toBe(false)
      expect(JSON.stringify(result.data)).not.toContain(admin.email)
      expect(JSON.stringify(result.data)).not.toContain(staff.email)
    }
  })

  it('filtra por nombre, email, grúa y estado antes del conteo y rango', async () => {
    const name = `Gruista-${crypto.randomUUID()}`
    await sql('update public.profiles set nombre=$2 where id=$1', [worker.id, name])
    for (const search of [`  ${name.toUpperCase()}  `, worker.email.toUpperCase(), equipmentId]) {
      const result = await staff.client.rpc('list_crane_operators', { p_search: search, p_active: true }, { count: 'exact' }).range(0, 0)
      expect(result.error).toBeNull()
      expect(result.count).toBe(1)
      expect(result.data?.map(row => row.user_id)).toEqual([worker.id])
    }
    const inactive = await staff.client.rpc('list_crane_operators', { p_search: inactiveWorker.email, p_active: false })
    expect(inactive.error).toBeNull()
    expect(inactive.data).toEqual([expect.objectContaining({ user_id: inactiveWorker.id, active: false,
      equipment_id: null, equipment_name: null, equipment_active: null })])
    expect((await staff.client.rpc('list_crane_operators', { p_search: worker.email, p_active: false })).data).toEqual([])
  })

  it('pagina más de 25 resultados con orden estable y devuelve cero cuando no hay coincidencias', async () => {
    const prefix = `Página ${crypto.randomUUID()}`
    const ids: string[] = []
    for (let index = 0; index < 28; index++) {
      const account = await fixture.user('crane_operator', false)
      ids.push(account.id)
      await sql('update public.profiles set nombre=$2 where id=$1', [account.id, `${prefix} ${String(index).padStart(2, '0')}`])
    }
    const first = await staff.client.rpc('list_crane_operators', { p_search: prefix, p_active: false }, { count: 'exact' }).range(0, 24)
    const second = await staff.client.rpc('list_crane_operators', { p_search: prefix, p_active: false }, { count: 'exact' }).range(25, 49)
    expect(first.error).toBeNull()
    expect(second.error).toBeNull()
    expect(first.count).toBe(28)
    expect(second.count).toBe(28)
    expect(first.data?.map(row => row.user_id)).toEqual(ids.slice(0, 25))
    expect(second.data?.map(row => row.user_id)).toEqual(ids.slice(25))
    const empty = await staff.client.rpc('list_crane_operators', { p_search: crypto.randomUUID() }, { count: 'exact' }).range(0, 24)
    expect(empty.error).toBeNull()
    expect(empty.data).toEqual([])
    expect(empty.count).toBe(0)
    const sameName = `Empate ${crypto.randomUUID()}`
    await sql('update public.profiles set nombre=$2 where id=any($1::uuid[])', [ids.slice(0, 2), sameName])
    const tied = await staff.client.rpc('list_crane_operators', { p_search: sameName })
    expect(tied.data?.map(row => row.user_id)).toEqual(ids.slice(0, 2).sort())
  })

  it('normaliza búsquedas nulas y limita el texto a 200 caracteres', async () => {
    expect((await staff.client.rpc('list_crane_operators', { p_search: null as never })).error).toBeNull()
    expect((await staff.client.rpc('list_crane_operators', { p_search: ` ${'🦺'.repeat(200)} ` })).error).toBeNull()
    const result = await staff.client.rpc('list_crane_operators', { p_search: '🦺'.repeat(201) })
    expect(result.error?.code).toBe('22023')
    expect(result.error?.message).toBe('La búsqueda puede tener hasta 200 caracteres')
  })

  it('rechaza gruistas, personal inactivo y anónimos antes de validar argumentos', async () => {
    for (const client of [worker.client, inactiveWorker.client, inactiveStaff.client, inactiveAdmin.client, anonClient()]) {
      expect((await client.rpc('list_crane_operators', { p_search: 'x'.repeat(201) })).error?.code).toBe('42501')
      expect((await setAccess(client, null as never, null as never)).error?.code).toBe('42501')
    }
  })

  it('el personal asigna, reasigna y desactiva sin cambiar roles ni otros datos', async () => {
    const target = await fixture.user('crane_operator', false)
    const before = await accountState(target.id)
    expect((await setAccess(staff.client, target.id, true, equipmentId)).error).toBeNull()
    expect((await accountState(target.id)).assignments).toEqual([expect.objectContaining({
      user_id: target.id, equipment_id: equipmentId, assigned_by: staff.id, assigned_at: expect.any(Date),
    })])
    expect((await setAccess(admin.client, target.id, true, otherEquipmentId)).error).toBeNull()
    const reassigned = await accountState(target.id)
    expect(reassigned.profiles[0]).toMatchObject({ nombre: before.profiles[0].nombre, rol: 'crane_operator', activo: true })
    expect(reassigned.assignments).toEqual([expect.objectContaining({ equipment_id: otherEquipmentId, assigned_by: admin.id })])
    expect((await setAccess(staff.client, target.id, false)).error).toBeNull()
    expect((await accountState(target.id)).assignments).toEqual([])
    expect((await accountState(target.id)).profiles[0]).toMatchObject({ rol: 'crane_operator', activo: false })
  })

  it('impide modificar administradores, operadores y cuentas inexistentes', async () => {
    for (const target of [admin, staff, inactiveStaff, inactiveAdmin]) {
      const before = await accountState(target.id)
      expect((await setAccess(staff.client, target.id, false, equipmentId)).error?.code).toBe('22023')
      expect(await accountState(target.id)).toEqual(before)
    }
    expect((await setAccess(staff.client, crypto.randomUUID(), false)).error?.code).toBe('22023')
    expect((await setAccess(staff.client, null as never, false)).error?.code).toBe('22023')
  })

  it('valida estado y grúa activa, con rollback de todos los cambios', async () => {
    const before = await accountState(worker.id)
    for (const [active, craneId] of [[true, null], [true, inactiveEquipmentId], [false, inactiveEquipmentId],
      [true, crypto.randomUUID()], [null, equipmentId]] as const) {
      expect((await setAccess(staff.client, worker.id, active as never, craneId)).error?.code).toBe('22023')
      expect(await accountState(worker.id)).toEqual(before)
    }
  })

  it('muestra la asignación histórica aunque la grúa esté inactiva y permite quitarla', async () => {
    const target = await fixture.user()
    const craneId = await fixture.equipment()
    expect((await setAccess(staff.client, target.id, true, craneId)).error).toBeNull()
    await sql('update public.equipos set activo=false where id=$1', [craneId])
    expect(await listWorker(target.id)).toMatchObject({ equipment_id: craneId, equipment_active: false })
    expect((await setAccess(staff.client, target.id, false)).error).toBeNull()
    expect(await listWorker(target.id)).toMatchObject({ active: false, equipment_id: null, equipment_active: null })
  })

  it('revalida el rol del destino después de esperar un cambio concurrente', async () => {
    const target = await fixture.user()
    const result = await contraTransaccionInCurso(admin.id,
      "select public.set_user_access($1,'operador',true,null)", [target.id],
      () => setAccess(staff.client, target.id, false, equipmentId))
    expect(result.error?.code).toBe('22023')
    expect((await accountState(target.id)).profiles[0]).toMatchObject({ rol: 'operador', activo: true })
    expect((await accountState(target.id)).assignments).toEqual([])
  })

  it('revalida la actividad de la grúa después de esperar un cambio concurrente', async () => {
    const target = await fixture.user('crane_operator', false)
    const craneId = await fixture.equipment()
    const before = await accountState(target.id)
    const result = await contraTransaccionInCurso(admin.id,
      'update public.equipos set activo=false where id=$1', [craneId],
      () => setAccess(staff.client, target.id, true, craneId))
    expect(result.error?.code).toBe('22023')
    expect(await accountState(target.id)).toEqual(before)
  })

  it('conserva remitos de todas las grúas bajo su autor original al reasignar y desactivar', async () => {
    const author = await fixture.user()
    const otherAuthor = await fixture.user()
    expect((await setAccess(staff.client, author.id, true, equipmentId)).error).toBeNull()
    const oldFile = await fixture.upload(author.client)
    const oldNote = await submitNote(author.client, [oldFile], { ...NOTE_DATA, serviceDate: '2026-12-31' })
    expect(oldNote.error).toBeNull()
    expect((await setAccess(staff.client, author.id, true, otherEquipmentId)).error).toBeNull()
    const budgetId = await fixture.budget(otherEquipmentId)
    const newFile = await fixture.upload(author.client)
    const newNote = await submitNote(author.client, [newFile], { ...NOTE_DATA, budgetId, serviceDate: '2026-01-01' })
    expect(newNote.error).toBeNull()
    expect((await setAccess(staff.client, otherAuthor.id, true, equipmentId)).error).toBeNull()
    expect((await submitNote(otherAuthor.client, [await fixture.upload(otherAuthor.client)])).error).toBeNull()
    await sql('update public.crane_delivery_notes set created_at=$2 where id=$1', [oldNote.data, '2026-01-02T00:00:00Z'])
    await sql('update public.crane_delivery_notes set created_at=$2 where id=$1', [newNote.data, '2026-01-03T00:00:00Z'])
    const notesBefore = await sql('select * from public.crane_delivery_notes where operator_id=$1 order by id', [author.id])
    expect(await listWorker(author.id)).toMatchObject({ equipment_id: otherEquipmentId,
      note_count: 2, pending_note_count: 1, last_submission_at: '2026-01-03T00:00:00+00:00' })
    expect(await listWorker(otherAuthor.id)).toMatchObject({ note_count: 1, pending_note_count: 1 })
    expect((await setAccess(staff.client, author.id, false)).error).toBeNull()
    expect(await listWorker(author.id)).toMatchObject({ active: false, equipment_id: null,
      note_count: 2, pending_note_count: 1, last_submission_at: '2026-01-03T00:00:00+00:00' })
    expect(await sql('select * from public.crane_delivery_notes where operator_id=$1 order by id', [author.id])).toEqual(notesBefore)
  })
})

describe('finalización de altas reservada al servidor', () => {
  it.each(['admin', 'operador'] as const)('finaliza un perfil nuevo desde service_role con actor %s activo', async (role) => {
    const target = await fixture.signupUser()
    expect((await accountState(target.id)).profiles[0]).toMatchObject({ rol: 'operador', activo: false, nombre: 'Alta pendiente' })
    const actor = role === 'admin' ? admin : staff
    expect((await completeSignup(target.id, actor.id, '  Gruista habilitado  ')).error).toBeNull()
    const state = await accountState(target.id)
    expect(state.profiles[0]).toMatchObject({ nombre: 'Gruista habilitado', rol: 'crane_operator', activo: true })
    expect(state.assignments).toEqual([expect.objectContaining({ user_id: target.id, equipment_id: equipmentId, assigned_by: actor.id })])
    expect((await target.client.rpc('get_crane_operator_context')).data).toMatchObject({ equipment: { id: equipmentId } })
  })

  it('ningún cliente autenticado ni anónimo puede invocar el finalizador aunque declare un actor válido', async () => {
    const target = await fixture.signupUser()
    const before = await accountState(target.id)
    for (const client of [admin.client, staff.client, worker.client, inactiveStaff.client, anonClient()]) {
      expect((await client.rpc('complete_crane_operator_signup', { p_user_id: target.id,
        p_actor_id: admin.id, p_name: 'Intento', p_equipment_id: equipmentId })).error?.code).toBe('42501')
      expect(await accountState(target.id)).toEqual(before)
    }
    const grants = await sql<{ role: string; allowed: boolean }>(`select role, has_function_privilege(role,
      'public.complete_crane_operator_signup(uuid,text,uuid,uuid)', 'execute') as allowed
      from unnest(array['anon','authenticated','service_role']) role`)
    expect(grants).toEqual([{ role: 'anon', allowed: false }, { role: 'authenticated', allowed: false }, { role: 'service_role', allowed: true }])
  })

  it('rechaza actores gruistas, inactivos, inexistentes o nulos sin mutar el destino', async () => {
    const target = await fixture.signupUser()
    const before = await accountState(target.id)
    for (const actorId of [worker.id, inactiveStaff.id, inactiveAdmin.id, inactiveWorker.id, crypto.randomUUID(), null]) {
      expect((await completeSignup(target.id, actorId as never)).error?.code).toBe('42501')
      expect(await accountState(target.id)).toEqual(before)
    }
  })

  it('revalida al actor si se desactiva después de crear la cuenta de Auth', async () => {
    const actor = await fixture.user('operador')
    const target = await fixture.signupUser()
    const before = await accountState(target.id)
    const result = await contraTransaccionInCurso(admin.id,
      'update public.profiles set activo=false where id=$1', [actor.id], () => completeSignup(target.id, actor.id))
    expect(result.error?.code).toBe('42501')
    expect(await accountState(target.id)).toEqual(before)
  })

  it('rechaza destinos activos, roles distintos del predeterminado y el propio actor', async () => {
    for (const target of [admin, staff, worker, inactiveAdmin, inactiveWorker]) {
      const before = await accountState(target.id)
      expect((await completeSignup(target.id)).error?.code).toBe('22023')
      expect(await accountState(target.id)).toEqual(before)
    }
    expect((await completeSignup(staff.id, staff.id)).error?.code).toBe('22023')
    expect((await completeSignup(crypto.randomUUID())).error?.code).toBe('22023')
    expect((await completeSignup(null as never)).error?.code).toBe('22023')
  })

  it('valida nombre y grúa; un error deja intactos el perfil y la asignación', async () => {
    const target = await fixture.signupUser()
    const before = await accountState(target.id)
    for (const name of [null, '', '   ', 'x'.repeat(121)]) {
      expect((await completeSignup(target.id, staff.id, name as never)).error?.code).toBe('22023')
      expect(await accountState(target.id)).toEqual(before)
    }
    for (const craneId of [null, inactiveEquipmentId, crypto.randomUUID()]) {
      expect((await completeSignup(target.id, staff.id, 'Gruista', craneId as never)).error?.code).toBe('22023')
      expect(await accountState(target.id)).toEqual(before)
    }
    expect((await completeSignup(target.id, staff.id, ` ${'🦺'.repeat(120)} `)).error).toBeNull()
  })

  it('no convierte una cuenta que se activó mientras esperaba el bloqueo del destino', async () => {
    const target = await fixture.signupUser()
    const result = await contraTransaccionInCurso(admin.id,
      'update public.profiles set activo=true where id=$1', [target.id], () => completeSignup(target.id))
    expect(result.error?.code).toBe('22023')
    expect((await accountState(target.id)).profiles[0]).toMatchObject({ rol: 'operador', activo: true, nombre: 'Alta pendiente' })
    expect((await accountState(target.id)).assignments).toEqual([])
  })
})

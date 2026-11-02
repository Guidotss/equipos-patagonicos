import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCraneFixture, type TestUser } from './crane-operator-helpers'
import { sql } from './helpers'

const fixture = createCraneFixture()
let admin: TestUser
let staff: TestUser
let worker: TestUser
let other: TestUser
let equipmentId: string
let otherEquipmentId: string

beforeAll(async () => {
  admin = await fixture.user('admin')
  staff = await fixture.user('operador')
  worker = await fixture.user()
  other = await fixture.user()
  equipmentId = await fixture.equipment()
  otherEquipmentId = await fixture.equipment()
  expect((await fixture.assign(admin.client, worker.id, equipmentId)).error).toBeNull()
})
afterAll(() => fixture.cleanup())

describe('acceso de gruistas', () => {
  it('el administrador lista cuentas, emails y asignaciones; el resto recibe 42501', async () => {
    const access = await admin.client.rpc('list_user_access')
    expect(access.error).toBeNull()
    expect(access.data).toContainEqual(expect.objectContaining({ user_id: worker.id, email: worker.email,
      role: 'crane_operator', equipment_id: equipmentId, active: true }))
    for (const client of [staff.client, worker.client]) {
      expect((await client.rpc('list_user_access')).error?.code).toBe('42501')
      expect((await fixture.assign(client, other.id, equipmentId)).error?.code).toBe('42501')
    }
  })

  it('el gruista ve solo su perfil y no puede escalarse ni escribir asignaciones', async () => {
    const profiles = await worker.client.from('profiles').select('id')
    expect(profiles.error).toBeNull()
    expect(profiles.data).toEqual([{ id: worker.id }])
    const escalation = await worker.client.from('profiles').update({ rol: 'admin' }).eq('id', worker.id).select()
    expect(escalation.data).toEqual([])
    expect((await worker.client.from('crane_operator_assignments').insert({ user_id: worker.id, equipment_id: otherEquipmentId })).error?.code).toBe('42501')
    expect((await worker.client.from('profiles').select('rol').single()).data?.rol).toBe('crane_operator')
    expect((await staff.client.from('profiles').select('id')).data?.length).toBeGreaterThan(1)
  })

  it('valida rol, equipo activo, cuenta existente y protección del propio administrador', async () => {
    const inactiveEquipmentId = await fixture.equipment(false)
    for (const id of [null, inactiveEquipmentId, crypto.randomUUID()]) {
      expect((await fixture.assign(admin.client, other.id, id)).error?.code).toBe('22023')
    }
    expect((await admin.client.rpc('set_user_access', { p_user_id: other.id, p_role: 'owner', p_active: true })).error?.code).toBe('22023')
    expect((await admin.client.rpc('set_user_access', { p_user_id: crypto.randomUUID(), p_role: 'operador', p_active: true })).error?.code).toBe('22023')
    expect((await admin.client.rpc('set_user_access', { p_user_id: admin.id, p_role: 'operador', p_active: true })).error?.message).toMatch(/No podés desactivarte/)
    expect((await admin.client.rpc('set_user_access', { p_user_id: admin.id, p_role: 'admin', p_active: false })).error?.message).toMatch(/No podés desactivarte/)
    expect((await fixture.assign(admin.client, other.id, null, false)).error).toBeNull()
  })

  it('permite compartir una grúa y elimina la asignación al cambiar el rol por RPC o perfil', async () => {
    expect((await fixture.assign(admin.client, other.id, equipmentId)).error).toBeNull()
    expect((await other.client.rpc('get_crane_operator_context')).data).toMatchObject({ equipment: { id: equipmentId } })
    expect((await admin.client.rpc('set_user_access', { p_user_id: other.id, p_role: 'operador', p_active: true })).error).toBeNull()
    expect((await sql('select * from public.crane_operator_assignments where user_id=$1', [other.id]))).toEqual([])
    await fixture.assign(admin.client, other.id, equipmentId)
    expect((await admin.client.from('profiles').update({ rol: 'operador' }).eq('id', other.id)).error).toBeNull()
    expect(await sql('select * from public.crane_operator_assignments where user_id=$1', [other.id])).toEqual([])
  })

  it('proyecta solamente trabajos aprobados en curso de la grúa asignada', async () => {
    const ownBudgetId = await fixture.budget(equipmentId)
    await fixture.budget(otherEquipmentId)
    await fixture.budget(equipmentId, 'finalizado')
    await fixture.budget(equipmentId, 'anulado')
    const context = await worker.client.rpc('get_crane_operator_context')
    expect(context.error).toBeNull()
    expect(context.data).toEqual({ equipment: { id: equipmentId, name: `Grúa de prueba ${equipmentId}`, active: true },
      jobs: [{ id: ownBudgetId, number: expect.any(Number), customerName: expect.any(String), subject: 'Trabajo de prueba', location: 'Neuquén' }] })
  })

  it('una cuenta sin asignación o con equipo inactivo no recibe trabajos ni puede iniciar cargas', async () => {
    const unassigned = await fixture.user()
    expect((await unassigned.client.rpc('get_crane_operator_context')).data).toEqual({ equipment: null, jobs: [] })
    expect((await unassigned.client.rpc('create_crane_delivery_note_upload', { p_mime: 'application/pdf', p_size: 1 })).error?.code).toBe('42501')
    const inactiveWorker = await fixture.user('crane_operator', false)
    expect((await inactiveWorker.client.rpc('get_crane_operator_context')).error?.code).toBe('42501')
    await sql('update public.equipos set activo=false where id=$1', [equipmentId])
    try {
      expect((await worker.client.rpc('get_crane_operator_context')).data).toMatchObject({ equipment: { id: equipmentId, active: false }, jobs: [] })
      expect((await worker.client.rpc('create_crane_delivery_note_upload', { p_mime: 'application/pdf', p_size: 1 })).error?.code).toBe('42501')
    } finally {
      await sql('update public.equipos set activo=true where id=$1', [equipmentId])
    }
  })

  it('las tablas y vistas comerciales devuelven vacío para gruistas y siguen disponibles para personal', async () => {
    const tables = ['clientes', 'contactos', 'equipos', 'firmantes', 'plantillas', 'empresa_config', 'cotizaciones',
      'cotizacion_items', 'cotizacion_envios', 'documentos', 'documento_archivos', 'documento_presupuestos', 'op_facturas',
      'facturas_historicas'] as const
    for (const table of tables) {
      const result = await worker.client.from(table).select('*')
      expect(result.error, table).toBeNull()
      expect(result.data, table).toEqual([])
    }
    const views = ['v_cotizaciones', 'v_facturas', 'v_presupuestos', 'v_inicio_colas'] as const
    for (const view of views) {
      const result = await worker.client.from(view).select('*')
      expect(result.error, view).toBeNull()
      expect(result.data, view).toEqual([])
    }
    expect((await staff.client.from('equipos').select('id')).data?.length).toBeGreaterThan(0)
    expect((await worker.client.from('equipos').insert({ nombre: 'Inyección' })).error?.code).toBe('42501')
    expect((await worker.client.from('clientes').insert({ razon_social: 'Inyección' })).error?.code).toBe('42501')
    expect((await worker.client.rpc('buscar_clientes', { texto: '' })).data).toEqual([])
    expect((await worker.client.rpc('buscar_global', { texto: '' })).data).toEqual([])
  })

  it('todos los RPC comerciales SECURITY DEFINER concedidos rechazan al gruista antes de validar datos', async () => {
    const functions = await sql<{ name: string; arguments: string[] }>(`select p.proname as name, p.proargnames[1:p.pronargs] as arguments
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.prosecdef and has_function_privilege('authenticated',p.oid,'execute')
        and p.proname not in ('list_user_access','set_user_access','get_crane_operator_context',
          'create_crane_delivery_note_upload','submit_crane_delivery_note','link_crane_delivery_note')`)
    expect(functions.length).toBeGreaterThan(15)
    for (const fn of functions) {
      const args = Object.fromEntries(fn.arguments.map(name => [name, null]))
      const result = await worker.client.rpc(fn.name as never, args as never)
      expect(result.error?.code, fn.name).toBe('42501')
    }
    expect((await worker.client.rpc('link_crane_delivery_note', { p_note_id: crypto.randomUUID(), p_budget_id: crypto.randomUUID() })).error?.code).toBe('42501')
    const [helper] = await sql<{ permitted: boolean }>(`select has_function_privilege('authenticated',
      'private.finalize_crane_delivery_note(uuid,uuid,uuid)','execute') as permitted`)
    expect(helper.permitted).toBe(false)
  })
})

import { createClient } from '@supabase/supabase-js'
import { validateEnvTests } from '../../scripts/test-env.mjs'
import { withBase } from './database'
import type { Role } from '../../src/lib/auth/roles'

export type OperatorTestUser = { id: string; email: string; password: string; name: string }

export function createOperatorFixture() {
  validateEnvTests()
  const admin = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, { auth: { persistSession: false } })
  const marker = `gruistas-${crypto.randomUUID()}`
  const users: OperatorTestUser[] = []
  const equipmentIds: string[] = []
  let customerId: string

  async function user(role: Role, suffix: string, active = true) {
    const account = { email: `${marker}-${suffix}@example.test`, password: `Prueba!${crypto.randomUUID()}`, name: `Prueba ${suffix}` }
    const { data, error } = await admin.auth.admin.createUser({ email: account.email, password: account.password, email_confirm: true, user_metadata: { nombre: account.name } })
    if (error) throw error
    const result = { ...account, id: data.user.id }
    users.push(result)
    const update = await admin.from('profiles').update({ rol: role, activo: active, nombre: account.name }).eq('id', result.id)
    if (update.error) throw update.error
    return result
  }

  async function equipment(suffix: string) {
    const row = await withBase(async (db) => (await db.query<{ id: string; nombre: string }>('insert into public.equipos(nombre,activo) values($1,true) returning id,nombre', [`Grúa ${suffix} ${marker}`])).rows[0])
    equipmentIds.push(row.id)
    return { id: row.id, name: row.nombre }
  }

  async function customer() {
    customerId = await withBase(async (db) => (await db.query<{ id: string }>('insert into public.clientes(razon_social,notas) values($1,$2) returning id', [`Cliente ${marker}`, marker])).rows[0].id)
    return customerId
  }

  async function budget(equipmentId: string | null, state: string, subject: string) {
    return withBase(async (db) => (await db.query<{ id: string; numero: number }>(`insert into public.cotizaciones(cliente_id,origen,formato,equipo_id,asunto,datos,estado,fecha_aprobacion,presupuesto_estado) values($1,'directa','jornada',$2,$3,'{"ubicacion":"Neuquén"}','aprobada',current_date,$4) returning id,numero`, [customerId, equipmentId, subject, state])).rows[0])
  }

  async function assign(userId: string, equipmentId: string) {
    await withBase((db) => db.query('insert into public.crane_operator_assignments(user_id,equipment_id) values($1,$2) on conflict(user_id) do update set equipment_id=excluded.equipment_id', [userId, equipmentId]))
  }

  async function cleanup() {
    validateEnvTests()
    const paths = await withBase(async (db) => (await db.query<{ path: string }>('select path from public.crane_delivery_note_uploads where operator_id=any($1::uuid[])', [users.map((account) => account.id)])).rows.map((row) => row.path))
    if (customerId) {
      const { data, error } = await admin.storage.from('documentos').list(`documentos/${customerId}`, { limit: 1000 })
      if (error) throw error
      paths.push(...(data ?? []).map((file) => `documentos/${customerId}/${file.name}`))
    }
    if (paths.length) {
      const { error } = await admin.storage.from('documentos').remove(paths)
      if (error) throw error
    }
    await withBase(async (db) => {
      await db.query('delete from public.crane_delivery_notes where operator_id=any($1::uuid[])', [users.map((account) => account.id)])
      if (customerId) {
        await db.query('delete from public.documentos where cliente_id=$1', [customerId])
        await db.query('delete from public.cotizaciones where cliente_id=$1', [customerId])
        await db.query('delete from public.clientes where id=$1', [customerId])
      }
    })
    for (const account of users) {
      const { error } = await admin.auth.admin.deleteUser(account.id)
      if (error) throw error
    }
    await withBase((db) => db.query('delete from public.equipos where id=any($1::uuid[])', [equipmentIds]))
  }

  return { marker, user, equipment, customer, budget, assign, cleanup }
}

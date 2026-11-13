import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Json } from '@/lib/supabase/database.types'
import {
  adminClient,
  anonClient,
  crearUser as createTestUser,
  PASSWORD_OF_TEST,
  removeUser,
  sql,
} from './helpers'

export type TestUser = Awaited<ReturnType<typeof createTestUser>>
export type TestClient = SupabaseClient<Database>
export const NOTE_DATA = {
  budgetId: null,
  number: 'R-100',
  serviceDate: '2026-01-15',
  customerName: 'Cliente informado en obra',
  workDescription: 'Izaje de materiales',
  notes: 'Trabajo terminado sin incidentes',
}

export function submitNote(
  client: TestClient,
  files: Json,
  data: Json = NOTE_DATA,
  id = crypto.randomUUID(),
) {
  return client.rpc('submit_crane_delivery_note', {
    p_id: id,
    p_data: data,
    p_files: files,
  })
}

export function createCraneFixture() {
  const userIds: string[] = []
  const equipmentIds: string[] = []
  const budgetIds: string[] = []
  const paths: string[] = []

  async function user(
    role: 'admin' | 'operador' | 'crane_operator' = 'crane_operator',
    active = true,
  ) {
    const result = await createTestUser({ activo: active, rol: role })
    userIds.push(result.id)
    return result
  }

  async function signupUser(): Promise<TestUser> {
    const email = `signup-${crypto.randomUUID()}@equipos.test`
    const { data, error } = await adminClient().auth.admin.createUser({
      email,
      password: PASSWORD_OF_TEST,
      email_confirm: true,
      user_metadata: { nombre: 'Alta pendiente' },
    })
    if (error) throw error
    userIds.push(data.user.id)
    const client = anonClient()
    const signedIn = await client.auth.signInWithPassword({
      email,
      password: PASSWORD_OF_TEST,
    })
    if (signedIn.error) throw signedIn.error
    return { id: data.user.id, email, client }
  }

  async function equipment(active = true) {
    const id = crypto.randomUUID()
    await sql('insert into public.equipos(id,nombre,activo) values($1,$2,$3)', [
      id,
      `Grúa de prueba ${id}`,
      active,
    ])
    equipmentIds.push(id)
    return id
  }

  async function budget(equipmentId: string | null, state = 'en_curso') {
    const id = crypto.randomUUID()
    await sql(
      `insert into public.cotizaciones(id,cliente_id,formato,equipo_id,asunto,datos,estado,fecha_aprobacion,presupuesto_estado)
      select $1,id,'jornada',$2,'Trabajo de prueba','{"ubicacion":"Neuquén","forma_pago":"Reservado"}',
        'aprobada',current_date,$3 from public.clientes limit 1`,
      [id, equipmentId, state],
    )
    budgetIds.push(id)
    return id
  }

  async function importedBudget(
    client: TestClient,
    equipmentId: string | null,
  ) {
    const path = `importadas/${crypto.randomUUID()}.pdf`
    paths.push(path)
    const uploaded = await client.storage.from('documentos').upload(
      path,
      new Blob(['%PDF-1.4 presupuesto importado'], {
        type: 'application/pdf',
      }),
      { contentType: 'application/pdf' },
    )
    if (uploaded.error) throw uploaded.error
    const [customer] = await sql<{ id: string }>(
      'select id from public.clientes limit 1',
    )
    const [sequence] = await sql<{ number: string }>(
      "select nextval(pg_get_serial_sequence('public.cotizaciones','numero'))::text as number",
    )
    const imported = await client.rpc('importar_cotizacion', {
      p_datos: {
        cliente_id: customer.id,
        numero: Number(sequence.number),
        formato: 'jornada',
        estado: 'enviada',
        fecha: '2026-01-01',
        archivo_original_path: path,
        asunto: 'Trabajo importado de prueba',
      },
    })
    if (imported.error) throw imported.error
    budgetIds.push(imported.data)
    // Se prepara la grúa antes de aprobar; el contenido aprobado nunca se modifica.
    await sql('update public.cotizaciones set equipo_id=$2 where id=$1', [
      imported.data,
      equipmentId,
    ])
    const version = await client
      .from('cotizaciones')
      .select('updated_at')
      .eq('id', imported.data)
      .single()
    if (version.error) throw version.error
    const approved = await client.rpc('aprobar_cotizacion', {
      p_id: imported.data,
      p_updated_at: version.data.updated_at,
      p_fecha: '2026-01-02',
    })
    if (approved.error) throw approved.error
    return imported.data
  }

  function assign(
    admin: TestClient,
    workerId: string,
    equipmentId: string | null,
    active = true,
  ) {
    return admin.rpc('set_user_access', {
      p_user_id: workerId,
      p_role: 'crane_operator',
      p_active: active,
      ...(equipmentId ? { p_equipment_id: equipmentId } : {}),
    })
  }

  async function reserve(
    client: TestClient,
    mime = 'application/pdf',
    size = 14,
    equipmentId?: string,
  ) {
    const { data, error } = await client.rpc(
      'create_crane_delivery_note_upload',
      {
        p_mime: mime,
        p_size: size,
        ...(equipmentId ? { p_equipment_id: equipmentId } : {}),
      },
    )
    if (error) throw error
    const ticket = data![0]
    paths.push(ticket.path)
    return ticket
  }

  async function uploadSigned(
    client: TestClient,
    ticket: { path: string },
    mime = 'application/pdf',
    content = '%PDF-1.4 test\n',
  ) {
    const bucket = client.storage.from('documentos')
    const signed = await bucket.createSignedUploadUrl(ticket.path)
    if (signed.error) throw signed.error
    const uploaded = await bucket.uploadToSignedUrl(
      ticket.path,
      signed.data.token,
      new Blob([content], { type: mime }),
      { contentType: mime },
    )
    if (uploaded.error) throw uploaded.error
    return { path: ticket.path, originalName: 'Remito de obra.pdf' }
  }

  async function upload(client: TestClient, equipmentId?: string) {
    const content = '%PDF-1.4 test\n'
    const ticket = await reserve(
      client,
      'application/pdf',
      Buffer.byteLength(content),
      equipmentId,
    )
    return uploadSigned(client, ticket, 'application/pdf', content)
  }

  async function cleanup() {
    for (let offset = 0; offset < paths.length; offset += 100) {
      const { error } = await adminClient()
        .storage.from('documentos')
        .remove(paths.slice(offset, offset + 100))
      if (error) throw error
    }
    await sql(
      'delete from public.crane_delivery_notes where operator_id=any($1::uuid[])',
      [userIds],
    )
    await sql(
      'delete from public.documentos where created_by=any($1::uuid[])',
      [userIds],
    )
    await sql('delete from public.cotizaciones where id=any($1::uuid[])', [
      budgetIds,
    ])
    for (const id of userIds) await removeUser(id)
    await sql('delete from public.equipos where id=any($1::uuid[])', [
      equipmentIds,
    ])
  }

  return {
    user,
    signupUser,
    equipment,
    budget,
    importedBudget,
    assign,
    reserve,
    uploadSigned,
    upload,
    cleanup,
    paths,
  }
}

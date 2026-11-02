import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createCraneFixture, NOTE_DATA, submitNote, type TestUser } from './crane-operator-helpers'
import { contraTransaccionInCurso as againstOpenTransaction, sql } from './helpers'

const fixture = createCraneFixture()
let admin: TestUser
let staff: TestUser
let worker: TestUser
let other: TestUser
let equipmentId: string
let otherEquipmentId: string
let budgetId: string

beforeAll(async () => {
  admin = await fixture.user('admin')
  staff = await fixture.user('operador')
  worker = await fixture.user()
  other = await fixture.user()
  equipmentId = await fixture.equipment()
  otherEquipmentId = await fixture.equipment()
  expect((await fixture.assign(admin.client, worker.id, equipmentId)).error).toBeNull()
  expect((await fixture.assign(admin.client, other.id, equipmentId)).error).toBeNull()
  budgetId = await fixture.budget(equipmentId)
})
afterAll(() => fixture.cleanup())

async function pendingNote() {
  const file = await fixture.upload(worker.client)
  const submitted = await submitNote(worker.client, [file])
  expect(submitted.error).toBeNull()
  return { id: submitted.data!, file }
}

describe('recepción de remitos de gruistas', () => {
  it('reserva la ruta exacta y consume una carga real firmada con el cliente del gruista', async () => {
    const content = '%PDF-1.4 test\n'
    const ticket = await fixture.reserve(worker.client, 'application/pdf', Buffer.byteLength(content))
    expect(ticket.path).toBe(`documentos/crane-operators/${worker.id}/${ticket.upload_id}.pdf`)
    const file = await fixture.uploadSigned(worker.client, ticket)
    const [object] = await sql<{ metadata: { size: number; mimetype: string } }>(
      'select metadata from storage.objects where bucket_id=$1 and name=$2', ['documentos', file.path])
    expect(object.metadata).toMatchObject({ size: Buffer.byteLength(content), mimetype: 'application/pdf' })
    const result = await submitNote(worker.client, [file])
    expect(result.error).toBeNull()
    const note = await worker.client.from('crane_delivery_notes').select('*').eq('id', result.data!).single()
    expect(note.data).toMatchObject({ operator_id: worker.id, equipment_id: equipmentId, status: 'pending', document_id: null,
      customer_name: NOTE_DATA.customerName, service_date: NOTE_DATA.serviceDate })
    const files = await worker.client.from('crane_delivery_note_files').select('*').eq('note_id', result.data!)
    expect(files.data).toHaveLength(1)
    expect(files.data?.[0]).toMatchObject({ upload_id: ticket.upload_id, path: file.path, size: Buffer.byteLength(content), position: 1 })
    expect((await worker.client.from('crane_delivery_note_uploads').select('consumed_note_id').eq('id', ticket.upload_id).single()).data?.consumed_note_id).toBe(result.data)
  })

  it('sin presupuesto no crea clientes, presupuestos ni documentos comerciales', async () => {
    const counts = () => sql(`select (select count(*) from public.clientes)::int as clients,
      (select count(*) from public.cotizaciones)::int as budgets, (select count(*) from public.documentos)::int as documents`)
    const before = await counts()
    await pendingNote()
    expect(await counts()).toEqual(before)
  })

  it('valida MIME y tamaño al reservar cargas; admite los tres formatos', async () => {
    for (const [mime, size] of [['text/plain', 1], ['application/pdf', 0], ['application/pdf', 10485761]] as const) {
      expect((await worker.client.rpc('create_crane_delivery_note_upload', { p_mime: mime, p_size: size })).error?.code).toBe('22023')
    }
    for (const [mime, extension] of [['application/pdf', 'pdf'], ['image/jpeg', 'jpg'], ['image/png', 'png']]) {
      const ticket = await fixture.reserve(worker.client, mime, 1)
      expect(ticket.path).toMatch(new RegExp(`\\.${extension}$`))
    }
  })

  it('no acepta campos de actor, equipo, estado, documento ni importes', async () => {
    const file = await fixture.upload(worker.client)
    for (const key of ['operatorId', 'operator_id', 'equipmentId', 'equipment_id', 'status', 'amount', 'monto', 'documentId']) {
      const result = await submitNote(worker.client, [file], { ...NOTE_DATA, [key]: key === 'monto' ? 5 : crypto.randomUUID() })
      expect(result.error?.code, key).toBe('22023')
    }
    expect((await submitNote(worker.client, [{ ...file, size: 1 }])).error?.code).toBe('22023')
  })

  it('valida fechas reales, textos obligatorios y límites de cada campo', async () => {
    const file = await fixture.upload(worker.client)
    const invalidData = [
      { serviceDate: '2026-02-30' }, { serviceDate: '01/02/2026' }, { serviceDate: null },
      { serviceDate: 12 }, { budgetId: 'abc' }, { customerName: '' }, { workDescription: ' ' },
      { number: 'x'.repeat(101) }, { notes: 'x'.repeat(2001) }, { customerName: 'x'.repeat(2001) },
      { workDescription: 'x'.repeat(2001) },
    ]
    for (const data of invalidData) {
      expect((await submitNote(worker.client, [file], { ...NOTE_DATA, ...data })).error?.code, JSON.stringify(data).slice(0, 100)).toBe('22023')
    }
    for (const originalName of ['', ' ', 'x'.repeat(256)]) {
      expect((await submitNote(worker.client, [{ ...file, originalName }])).error?.code).toBe('22023')
    }
    const valid = await submitNote(worker.client, [file], { ...NOTE_DATA, number: 'x'.repeat(100), notes: 'x'.repeat(2000), serviceDate: '2000-02-29' })
    expect(valid.error).toBeNull()
  })

  it('exige de uno a cincuenta archivos distintos y una ruta exacta', async () => {
    const file = await fixture.upload(worker.client)
    for (const files of [[], Array.from({ length: 51 }, () => file), [file, file]]) {
      expect((await submitNote(worker.client, files)).error?.code).toBe('22023')
    }
    for (const path of [file.path.replace('.pdf', '.png'), `documentos/${crypto.randomUUID()}/a.pdf`, `${file.path}/../x.pdf`]) {
      expect((await submitNote(worker.client, [{ ...file, path }])).error?.code).toBe('42501')
    }
  })

  it('verifica la existencia y los metadatos reales, no lo declarado por el navegador', async () => {
    const missing = await fixture.reserve(worker.client)
    expect((await submitNote(worker.client, [{ path: missing.path, originalName: 'Falta.pdf' }])).error?.code).toBe('22023')
    const wrongSize = await fixture.reserve(worker.client, 'application/pdf', 100)
    const fileWithWrongSize = await fixture.uploadSigned(worker.client, wrongSize)
    expect((await submitNote(worker.client, [fileWithWrongSize])).error?.code).toBe('22023')
    const wrongMime = await fixture.reserve(worker.client, 'application/pdf', 13)
    const fileWithWrongMime = await fixture.uploadSigned(worker.client, wrongMime, 'image/png', 'imagen falsa!')
    expect((await submitNote(worker.client, [fileWithWrongMime])).error?.code).toBe('22023')
  })

  it('rechaza tickets ajenos, vencidos y ya consumidos aunque dos gruistas compartan equipo', async () => {
    const foreignFile = await fixture.upload(other.client)
    expect((await submitNote(worker.client, [foreignFile])).error?.code).toBe('42501')
    const expiredFile = await fixture.upload(worker.client)
    await sql('update public.crane_delivery_note_uploads set expires_at=now()-interval \'1 second\' where path=$1', [expiredFile.path])
    expect((await submitNote(worker.client, [expiredFile])).error?.code).toBe('42501')
    const used = await pendingNote()
    expect((await submitNote(worker.client, [used.file])).error?.code).toBe('42501')
  })

  it('un archivo inválido revierte toda la recepción y deja disponibles los tickets válidos', async () => {
    const ownFile = await fixture.upload(worker.client)
    const foreignFile = await fixture.upload(other.client)
    const id = crypto.randomUUID()
    expect((await submitNote(worker.client, [ownFile, foreignFile], NOTE_DATA, id)).error?.code).toBe('42501')
    expect(await sql('select id from public.crane_delivery_notes where id=$1', [id])).toEqual([])
    expect((await sql('select consumed_note_id from public.crane_delivery_note_uploads where path=$1', [ownFile.path]))).toEqual([{ consumed_note_id: null }])
    expect((await submitNote(worker.client, [ownFile], NOTE_DATA, id)).error).toBeNull()
  })

  it('el Storage no expone rutas ajenas ni permite subir fuera del ticket, sobrescribir o borrar', async () => {
    const own = await pendingNote()
    const foreignFile = await fixture.upload(other.client)
    const bucket = worker.client.storage.from('documentos')
    expect((await bucket.createSignedUrl(own.file.path, 60)).error).toBeNull()
    expect((await bucket.createSignedUrl(foreignFile.path, 60)).error).not.toBeNull()
    expect((await bucket.list(`documentos/crane-operators/${other.id}`)).data).toEqual([])
    const forgedPath = `documentos/crane-operators/${worker.id}/${crypto.randomUUID()}.pdf`
    expect((await bucket.createSignedUploadUrl(forgedPath)).error).not.toBeNull()
    expect((await bucket.createSignedUploadUrl(foreignFile.path)).error).not.toBeNull()
    expect((await bucket.upload(forgedPath, new Blob(['x'], { type: 'application/pdf' }))).error).not.toBeNull()
    expect((await bucket.update(own.file.path, new Blob(['x'], { type: 'application/pdf' }))).error).not.toBeNull()
    await bucket.remove([own.file.path])
    expect((await bucket.createSignedUrl(own.file.path, 60)).error).toBeNull()
  })

  it('no concede tokens con upsert al gruista y un token común no puede reemplazar un archivo recibido', async () => {
    const content = '%PDF-1.4 test\n'
    const replacement = '%PDF-1.4 otro\n'
    const ticket = await fixture.reserve(worker.client, 'application/pdf', Buffer.byteLength(content))
    const bucket = worker.client.storage.from('documentos')
    expect((await bucket.createSignedUploadUrl(ticket.path)).error).toBeNull()
    const signed = await bucket.createSignedUploadUrl(ticket.path, { upsert: false })
    expect(signed.error).toBeNull()
    expect((await bucket.createSignedUploadUrl(ticket.path, { upsert: true })).error).not.toBeNull()
    expect((await bucket.uploadToSignedUrl(ticket.path, signed.data!.token,
      new Blob([content], { type: 'application/pdf' }), { contentType: 'application/pdf' })).error).toBeNull()
    expect((await submitNote(worker.client, [{ path: ticket.path, originalName: 'Remito.pdf' }])).error).toBeNull()
    const overwritten = await bucket.uploadToSignedUrl(ticket.path, signed.data!.token,
      new Blob([replacement], { type: 'application/pdf' }), { contentType: 'application/pdf', upsert: true })
    expect(overwritten.error).not.toBeNull()
    const downloaded = await bucket.download(ticket.path)
    expect(downloaded.error).toBeNull()
    expect(await downloaded.data!.text()).toBe(content)
  })

  it('conserva la emisión de cargas firmadas del personal, incluso con su opción previa de upsert', async () => {
    const [customer] = await sql<{ id: string }>('select id from public.clientes limit 1')
    const path = `documentos/${customer.id}/${crypto.randomUUID()}.pdf`
    fixture.paths.push(path)
    const bucket = staff.client.storage.from('documentos')
    const signed = await bucket.createSignedUploadUrl(path, { upsert: true })
    expect(signed.error).toBeNull()
    expect((await bucket.uploadToSignedUrl(path, signed.data!.token,
      new Blob(['%PDF-1.4 personal\n'], { type: 'application/pdf' }), { contentType: 'application/pdf' })).error).toBeNull()
    expect((await bucket.download(path)).error).toBeNull()
  })

  it('solo permite lectura del historial propio; no hay escrituras directas a las nuevas tablas', async () => {
    const own = await pendingNote()
    expect((await other.client.from('crane_delivery_notes').select('*').eq('id', own.id)).data).toEqual([])
    expect((await other.client.from('crane_delivery_note_files').select('*').eq('note_id', own.id)).data).toEqual([])
    expect((await staff.client.from('crane_delivery_notes').select('id').eq('id', own.id)).data).toEqual([{ id: own.id }])
    expect((await worker.client.from('crane_delivery_notes').update({ notes: 'Cambio' }).eq('id', own.id)).error?.code).toBe('42501')
    expect((await worker.client.from('crane_delivery_notes').delete().eq('id', own.id)).error?.code).toBe('42501')
    expect((await worker.client.from('crane_delivery_note_uploads').insert({ operator_id: worker.id, equipment_id: equipmentId,
      path: 'a', mime: 'application/pdf', expected_size: 1 })).error?.code).toBe('42501')
    expect((await worker.client.from('crane_delivery_note_files').insert({ note_id: own.id, upload_id: crypto.randomUUID(),
      path: 'a', original_name: 'a', mime: 'application/pdf', size: 1, position: 1 })).error?.code).toBe('42501')
  })

  it('revisa la autorización al registrar aunque una URL firmada siga vigente tras reasignar', async () => {
    const own = await pendingNote()
    const ticket = await fixture.reserve(worker.client, 'application/pdf', 13)
    const bucket = worker.client.storage.from('documentos')
    const signed = await bucket.createSignedUploadUrl(ticket.path)
    expect(signed.error).toBeNull()
    await fixture.assign(admin.client, worker.id, otherEquipmentId)
    try {
      const uploaded = await bucket.uploadToSignedUrl(ticket.path, signed.data!.token,
        new Blob(['%PDF-1.4 test\n'], { type: 'application/pdf' }), { contentType: 'application/pdf' })
      expect(uploaded.error).toBeNull()
      expect((await submitNote(worker.client, [{ path: ticket.path, originalName: 'Remito.pdf' }])).error?.code).toBe('42501')
      expect((await bucket.createSignedUploadUrl(ticket.path)).error).not.toBeNull()
      expect((await worker.client.from('crane_delivery_notes').select('id').eq('id', own.id)).data).toEqual([{ id: own.id }])
      expect((await bucket.createSignedUrl(own.file.path, 60)).error).toBeNull()
    } finally {
      await fixture.assign(admin.client, worker.id, equipmentId)
    }
  })

  it('desactivar la cuenta o el equipo invalida la recepción de un archivo ya subido', async () => {
    const historical = await pendingNote()
    const file = await fixture.upload(worker.client)
    await sql('update public.profiles set activo=false where id=$1', [worker.id])
    try {
      expect((await submitNote(worker.client, [file])).error?.code).toBe('42501')
      expect((await worker.client.storage.from('documentos').createSignedUrl(file.path, 60)).error).not.toBeNull()
    } finally {
      await sql('update public.profiles set activo=true where id=$1', [worker.id])
    }
    await sql('update public.equipos set activo=false where id=$1', [equipmentId])
    try {
      expect((await submitNote(worker.client, [file])).error?.code).toBe('42501')
    } finally {
      await sql('update public.equipos set activo=true where id=$1', [equipmentId])
    }
    await sql('delete from public.crane_operator_assignments where user_id=$1', [worker.id])
    try {
      expect((await submitNote(worker.client, [file])).error?.code).toBe('42501')
      expect((await worker.client.storage.from('documentos').createSignedUrl(file.path, 60)).error).toBeNull()
      expect((await worker.client.from('crane_delivery_notes').select('id').eq('id', historical.id)).data).toEqual([{ id: historical.id }])
    } finally {
      await fixture.assign(admin.client, worker.id, equipmentId)
    }
  })

  it('un reintento idéntico devuelve el mismo registro y cambios o IDs ajenos provocan conflicto', async () => {
    const file = await fixture.upload(worker.client)
    const id = crypto.randomUUID()
    const results = await Promise.all([submitNote(worker.client, [file], NOTE_DATA, id), submitNote(worker.client, [file], NOTE_DATA, id)])
    expect(results.map(result => result.error)).toEqual([null, null])
    expect(results.map(result => result.data)).toEqual([id, id])
    expect((await submitNote(worker.client, [file], { ...NOTE_DATA, notes: 'Cambio' }, id)).error?.code).toBe('23505')
    expect((await submitNote(worker.client, [{ ...file, originalName: 'Otro.pdf' }], NOTE_DATA, id)).error?.code).toBe('23505')
    expect((await submitNote(other.client, [file], NOTE_DATA, id)).error?.code).toBe('23505')
    expect((await sql('select id from public.crane_delivery_note_files where note_id=$1', [id]))).toHaveLength(1)
  })

  it('el presupuesto elegido crea un remito atómico sin dinero y conserva intacta la cotización', async () => {
    const [before] = await sql('select to_jsonb(c) as snapshot from public.cotizaciones c where id=$1', [budgetId])
    const file = await fixture.upload(worker.client)
    const id = crypto.randomUUID()
    const data = { ...NOTE_DATA, budgetId, customerName: 'Intento de cambiar cliente' }
    const results = await Promise.all([submitNote(worker.client, [file], data, id), submitNote(worker.client, [file], data, id)])
    expect(results.map(result => result.error)).toEqual([null, null])
    const [note] = await sql<{ document_id: string; customer_name: string }>('select document_id,customer_name from public.crane_delivery_notes where id=$1', [id])
    expect(note.customer_name).not.toBe(data.customerName)
    const [document] = await sql(`select * from public.documentos where id=$1`, [note.document_id])
    expect(document).toMatchObject({ tipo: 'remito', numero: NOTE_DATA.number, equipo_id: equipmentId, created_by: worker.id,
      monto: null, factura_id: null, tipo_comprobante: null, fecha_vencimiento: null })
    expect(document.notas).toContain(NOTE_DATA.workDescription)
    expect(document.notas).toContain(NOTE_DATA.notes)
    expect(document.notas).toContain(note.customer_name)
    expect((await sql('select path from public.documento_archivos where documento_id=$1', [note.document_id]))).toEqual([{ path: file.path }])
    expect((await sql('select to_jsonb(c) as snapshot from public.cotizaciones c where id=$1', [budgetId]))[0]).toEqual(before)
    expect((await worker.client.from('documentos').select('id').eq('id', note.document_id)).data).toEqual([])
  })

  it('el gruista no puede elegir presupuestos de otra grúa, cerrados, anulados ni inexistentes', async () => {
    const file = await fixture.upload(worker.client)
    const budgetIds = [await fixture.budget(otherEquipmentId), await fixture.budget(equipmentId, 'finalizado'),
      await fixture.budget(equipmentId, 'anulado'), await fixture.budget(null), crypto.randomUUID()]
    for (const id of budgetIds) {
      expect((await submitNote(worker.client, [file], { ...NOTE_DATA, budgetId: id })).error?.code).toBe('42501')
    }
  })

  it('el personal vincula a un aprobado finalizado sin equipo, conserva la grúa real y no duplica vínculos concurrentes', async () => {
    const own = await pendingNote()
    const closedBudgetId = await fixture.budget(null, 'finalizado')
    const results = await Promise.all([
      staff.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: closedBudgetId }),
      admin.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: closedBudgetId }),
    ])
    expect(results.map(result => result.error)).toEqual([null, null])
    expect(results[0].data).toBe(results[1].data)
    const documentId = results[0].data!
    const [document] = await sql('select * from public.documentos where id=$1', [documentId])
    expect(document).toMatchObject({ tipo: 'remito', equipo_id: equipmentId, created_by: worker.id, monto: null })
    expect((await sql('select path from public.documento_archivos where documento_id=$1', [documentId]))).toEqual([{ path: own.file.path }])
    expect((await sql('select * from public.documento_presupuestos where documento_id=$1', [documentId]))).toHaveLength(1)
    expect((await staff.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: budgetId })).error?.code).toBe('23505')
    expect((await worker.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: closedBudgetId })).error?.code).toBe('42501')
    expect((await other.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: closedBudgetId })).error?.code).toBe('42501')
  })

  it('recuerda el destino original aunque el personal cambie los vínculos del documento oficial', async () => {
    const own = await pendingNote()
    const original = await staff.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: budgetId })
    expect(original.error).toBeNull()
    const alternateBudgetId = await fixture.budget(null)
    const [document] = await sql<{ cliente_id: string }>('select cliente_id from public.documentos where id=$1', [original.data])
    const changed = await staff.client.rpc('actualizar_documento', {
      p_id: original.data!, p_presupuestos: [alternateBudgetId],
      p_datos: { cliente_id: document.cliente_id, tipo: 'remito', numero: NOTE_DATA.number,
        fecha: NOTE_DATA.serviceDate, equipo_id: equipmentId, notas: NOTE_DATA.notes },
    })
    expect(changed.error).toBeNull()
    const repeated = await staff.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: budgetId })
    expect(repeated.error).toBeNull()
    expect(repeated.data).toBe(original.data)
    expect((await staff.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: alternateBudgetId })).error?.code).toBe('23505')
  })

  it('no vincula un presupuesto anulado y espera una anulación concurrente antes de decidir', async () => {
    const own = await pendingNote()
    const raceBudgetId = await fixture.budget(null)
    const result = await againstOpenTransaction(staff.id,
      "select public.cambiar_estado_presupuesto($1,'anulado','Prueba concurrente')", [raceBudgetId],
      () => staff.client.rpc('link_crane_delivery_note', { p_note_id: own.id, p_budget_id: raceBudgetId }))
    expect(result.error?.code).toBe('22023')
    expect((await sql('select status,document_id from public.crane_delivery_notes where id=$1', [own.id]))).toEqual([{ status: 'pending', document_id: null }])
  })
})

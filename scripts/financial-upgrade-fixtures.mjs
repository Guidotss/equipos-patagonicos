import { randomUUID } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import pg from 'pg'
import { validateEnvTests } from './test-env.mjs'

export async function withUpgradeDatabase(testEnv, callback, { signal } = {}) {
  validateEnvTests(testEnv)
  signal?.throwIfAborted()
  const database = new pg.Client({ connectionString: testEnv.SUPABASE_DB_URL })
  let closing
  const close = () => (closing ??= Promise.resolve().then(() => database.end()))
  let rejectAbort
  const aborted = new Promise((_, reject) => {
    rejectAbort = reject
  })
  const abort = () => {
    rejectAbort(signal.reason)
    void close().catch(() => {})
  }
  signal?.addEventListener('abort', abort, { once: true })
  try {
    const connecting = Promise.resolve().then(() => {
      signal?.throwIfAborted()
      return database.connect()
    })
    // pg puede cerrar el socket sin resolver connect(): el aborto debe terminar la espera por sí mismo.
    await Promise.race([connecting, aborted])
    signal?.throwIfAborted()
    return await callback(database)
  } finally {
    signal?.removeEventListener('abort', abort)
    await close()
  }
}

export async function readLegacyFinancialSnapshot(database) {
  const queries = {
    invoices:
      'select id, monto, cobrado, saldo from public.v_facturas order by id',
    totals:
      'select sum(monto) as monto, sum(cobrado) as cobrado, sum(saldo) as saldo from public.v_facturas',
    documents: 'select to_jsonb(d) as row from public.documentos d order by id',
    links:
      'select * from public.documento_presupuestos order by documento_id, cotizacion_id',
    applications: 'select * from public.op_facturas order by op_id, factura_id',
    files:
      'select to_jsonb(a) as row from public.documento_archivos a order by id',
    evidence:
      'select to_jsonb(h) as row from public.facturas_historicas h order by factura_id',
    storage:
      "select id, name, metadata from storage.objects where bucket_id = 'documentos' order by id",
  }
  const snapshot = {}
  for (const [key, query] of Object.entries(queries))
    snapshot[key] = (await database.query(query)).rows
  return snapshot
}

function requireData(result) {
  if (result.error) throw new Error(result.error.message)
  return result.data
}

async function createStaff(testEnv, signal) {
  const options = {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: (url, init) => fetch(url, { ...init, signal }) },
  }
  const service = createClient(
    testEnv.NEXT_PUBLIC_SUPABASE_URL,
    testEnv.SUPABASE_SECRET_KEY,
    options,
  )
  const email = `financial-upgrade-${randomUUID()}@equipos.test`
  const password = `Prueba-${randomUUID()}`
  const { user } = requireData(
    await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { nombre: 'Prueba de actualización' },
    }),
  )
  requireData(
    await service
      .from('profiles')
      .update({ activo: true, rol: 'operador' })
      .eq('id', user.id),
  )
  const staff = createClient(
    testEnv.NEXT_PUBLIC_SUPABASE_URL,
    testEnv.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    options,
  )
  requireData(await staff.auth.signInWithPassword({ email, password }))
  return { service, staff, staffId: user.id }
}

// Todos los registros existen antes de aplicar la primera migración financiera.
export async function seedLegacyFinancialData(testEnv, { signal } = {}) {
  validateEnvTests(testEnv)
  return withUpgradeDatabase(
    testEnv,
    async (database) => {
      const {
        rows: [schema],
      } = await database.query(`select
      to_regclass('public.invoice_allocations') as invoices,
      to_regclass('public.payment_instruments') as instruments,
      to_regclass('public.payment_allocations') as payments,
      to_regclass('public.financial_events') as events`)
      if (Object.values(schema).some(Boolean))
        throw new Error(
          'La prueba requiere el esquema anterior al modelo financiero',
        )
      const { service, staff, staffId } = await createStaff(testEnv, signal)
      const customer = requireData(
        await staff
          .from('clientes')
          .insert({ razon_social: 'Cliente sintético de actualización' })
          .select('id')
          .single(),
      )
      const equipment = requireData(
        await staff.from('equipos').select('id').limit(1).single(),
      )
      const budget = async (subject) =>
        requireData(
          await staff.rpc('presupuesto_directo', {
            p_datos: {
              cliente_id: customer.id,
              asunto: subject,
              equipo_id: equipment.id,
            },
            p_items: [],
          }),
        )
      const firstBudget = await budget('Trabajo único con grúa actual')
      const secondBudget = await budget('Segundo trabajo')
      const importedPath = `importadas/${randomUUID()}.pdf`
      requireData(
        await staff.storage.from('documentos').upload(
          importedPath,
          new Blob(['%PDF-1.4 presupuesto sintético'], {
            type: 'application/pdf',
          }),
          { contentType: 'application/pdf' },
        ),
      )
      const lastBudget = requireData(
        await staff
          .from('cotizaciones')
          .select('numero')
          .order('numero', { ascending: false })
          .limit(1)
          .single(),
      )
      const orphanBudget = requireData(
        await staff.rpc('importar_cotizacion', {
          p_datos: {
            cliente_id: customer.id,
            numero: Number(lastBudget.numero) + 1,
            estado: 'aprobada',
            asunto: 'Trabajo eliminado con factura anulada',
            archivo_original_path: importedPath,
          },
        }),
      )
      const upload = async () => {
        const filePath = `documentos/${customer.id}/${randomUUID()}.pdf`
        requireData(
          await staff.storage.from('documentos').upload(
            filePath,
            new Blob(['%PDF-1.4 evidencia sintética'], {
              type: 'application/pdf',
            }),
            { contentType: 'application/pdf' },
          ),
        )
        return { path: filePath, nombre_original: 'Comprobante sintético.pdf' }
      }
      const document = async (type, amount, budgets, applications = []) =>
        requireData(
          await staff.rpc('registrar_documento', {
            p_datos: {
              cliente_id: customer.id,
              tipo: type,
              monto: amount,
              numero: randomUUID(),
              fecha: '2024-06-20',
              ...(type === 'factura' ? { tipo_comprobante: 'FA' } : {}),
            },
            p_presupuestos: budgets,
            p_archivos: [await upload()],
            p_aplicaciones: applications,
          }),
        )
      const sharedInvoice = await document('factura', 1000, [
        firstBudget,
        secondBudget,
      ])
      const singleInvoice = await document('factura', 600, [firstBudget])
      const inactiveInvoice = await document('factura', 200, [firstBudget])
      const orphanInvoice = await document('factura', 150, [orphanBudget])
      const partialOrder = await document(
        'orden_pago',
        500,
        [firstBudget, secondBudget],
        [{ factura_id: sharedInvoice, monto_aplicado: 300 }],
      )
      const inactiveInvoiceOrder = await document(
        'orden_pago',
        100,
        [firstBudget],
        [{ factura_id: inactiveInvoice, monto_aplicado: 80 }],
      )
      const inactiveOrder = await document(
        'orden_pago',
        70,
        [firstBudget],
        [{ factura_id: singleInvoice, monto_aplicado: 50 }],
      )
      requireData(await staff.rpc('anular_documento', { p_id: inactiveOrder }))
      requireData(
        await staff.rpc('anular_documento', { p_id: inactiveInvoice }),
      )
      requireData(await staff.rpc('anular_documento', { p_id: orphanInvoice }))
      requireData(
        await staff.rpc('revertir_aprobacion', { p_id: orphanBudget }),
      )
      requireData(await staff.rpc('borrar_cotizacion', { p_id: orphanBudget }))
      const historical = requireData(
        await service.rpc('importar_factura_historica', {
          p_datos: {
            cliente_id: customer.id,
            emisor_cuit: '30712345678',
            numero: '00002-00999999',
            fecha: '2023-06-20',
            fecha_vencimiento: null,
            periodo_desde: '2023-06-01',
            periodo_hasta: '2023-06-20',
            neto: 1000,
            iva: 210,
            otros_tributos: 0,
            monto: 1210,
            items: [
              {
                descripcion: 'Servicio histórico sintético',
                cantidad: 1,
                precio_unitario: 1000,
                unidad: 'HORA',
              },
            ],
            archivo: await upload(),
            sha256: 'a'.repeat(64),
            lote: 'actualizacion-financiera-sintetica',
            confirmacion_cobro:
              'Total cobrado según evidencia sintética, sin fecha acreditada',
            fuente: { evidencia: 'Documento sintético de actualización' },
          },
        }),
      )
      return {
        ids: {
          staffId,
          firstBudget,
          secondBudget,
          equipmentId: equipment.id,
          sharedInvoice,
          singleInvoice,
          inactiveInvoice,
          orphanInvoice,
          partialOrder,
          inactiveInvoiceOrder,
          inactiveOrder,
          historicalInvoice: historical.factura_id,
          historicalBudget: historical.presupuesto_id,
        },
        before: await readLegacyFinancialSnapshot(database),
      }
    },
    { signal },
  )
}

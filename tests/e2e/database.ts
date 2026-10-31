// tests/e2e/base-datos.ts
// Acceso exclusivo al proyecto descartable preparado por el runner.
import pg from 'pg'
import { validateEnvTests } from '../../scripts/test-env.mjs'

validateEnvTests()

export async function withBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  validateEnvTests()
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** Todos los datos que usa la plantilla por jornada de la semilla, completos. */
export const DATA_COMPLETOS = {
  ubicacion: 'Loma Campana, Añelo',
  horario: 'lunes a sábado de 8 a 17 hs',
  duracion_estimada: '10 jornadas',
  forma_pago: '30 días fecha de factura',
  disponibilidad: 'inmediata',
}

/**
 * Un borrador por jornada para VERTICE, completo: con equipo, firmante, todos los datos que usa la plantilla y
 * precios, así se puede enviar y aprobar sin tocar nada. `estado: 'aprobada'` lo deja aprobado (sin PDF guardado:
 * la ruta del PDF lo dibuja en el momento). Para probar lo que falta (Task 12): `datos` reemplaza los datos y
 * `precioMovilizacion: null` deja el segundo ítem sin precio.
 */
export async function crearQuoteComplete(
  db: pg.Client,
  {
    estado = 'borrador',
    datos = DATA_COMPLETOS,
    priceMovilizacion = 2800000,
  }: { estado?: 'borrador' | 'aprobada'; datos?: Record<string, string>; priceMovilizacion?: number | null } = {},
): Promise<{ id: string; numero: number }> {
  const { rows } = await db.query<{ id: string; numero: string }>(
    `insert into public.cotizaciones
       (cliente_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques)
     select c.id, 'jornada', p.id, e.id, f.id, p.asunto, p.intro, $1::jsonb, p.bloques
     from public.clientes c, public.plantillas p, public.equipos e, public.firmantes f
     where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and p.nombre = 'Por jornada - Grúa con operador'
       and e.nombre = 'Grúa telescópica XCMG 70 TN' and f.nombre = 'Thomas Cravero'
     returning id, numero`,
    [JSON.stringify(datos)],
  )
  const { id, numero } = rows[0]
  await db.query(
    `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad) values
       ($1, 1, 'Precios Jornada', 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)', 1950000, 'JORNADA'),
       ($1, 2, 'Precios Jornada', 'Movilización y desmovilización de Grúa Telescópica', $2::numeric, 'VIAJE')`,
    [id, priceMovilizacion],
  )
  if (estado === 'aprobada') {
    await db.query(
      `update public.cotizaciones set estado = 'aprobada', fecha_aprobacion = fecha, presupuesto_estado = 'en_curso'
       where id = $1`,
      [id],
    )
  }
  return { id, numero: Number(numero) }
}

/** Borra las cotizaciones (con sus ítems y envíos). Los PDF que hayan quedado en Storage no se tocan. */
export async function removeQuotes(db: pg.Client, ids: string[]) {
  await db.query('delete from public.cotizaciones where id = any($1::uuid[])', [ids])
}

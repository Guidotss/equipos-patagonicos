// tests/integration/cotizaciones-editor.test.ts
// Lo que agrega el editor de cotizaciones (plan 3B): guardar con versión y la búsqueda de la lista.
// La Task 4 suma acá los tests del servicio.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
/** Letras al azar para buscar por texto: un dígito en la búsqueda también busca por número. */
const CLAVE = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => String.fromCharCode(97 + (b % 26))).join('')
const CAMBIO = 'La cotización cambió desde que la abriste; volvé a intentarlo'

let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  try {
    // Los PDF que suben enviar y aprobar (tests del servicio): Storage no se limpia con SQL.
    const archivos = await sql<{ name: string }>(
      `select o.name from storage.objects o
       where o.bucket_id = 'documentos' and exists (
         select 1 from public.cotizaciones c where c.notas = $1 and o.name like 'cotizaciones/' || c.id || '/%')`,
      [MARCA],
    )
    if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
    await sql('delete from public.cotizaciones where notas = $1', [MARCA])
    await sql('delete from public.clientes where notas = $1', [MARCA])
  } finally {
    for (const u of [activo, inactivo]) await borrarUsuario(u.id)
  }
})

function datosBase(extra: Record<string, unknown> = {}) {
  return {
    cliente_id: ids.cliente_id,
    formato: 'jornada',
    fecha: '2026-10-22',
    asunto: 'Primera versión',
    notas: MARCA,
    ...extra,
  }
}

async function nueva(): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
  if (error) throw new Error('No se pudo guardar la cotización: ' + error.message)
  return data
}

/** Actualiza la cotización con otro asunto mandando `version` como la versión leída (undefined: sin versión). */
function guardar(id: string, version: string | undefined, asunto: string, extra: Record<string, unknown> = {}) {
  return activo.client.rpc('guardar_cotizacion', {
    p_id: id,
    p_updated_at: version,
    p_datos: datosBase({ asunto, ...extra }),
    p_items: ITEMS_JORNADA,
  })
}

async function fila(id: string) {
  const [resultado] = await sql<{ asunto: string; estado: string; fecha: string }>(
    `select asunto, estado, to_char(fecha, 'YYYY-MM-DD') as fecha from public.cotizaciones where id = $1`,
    [id],
  )
  return resultado
}

describe('guardar_cotizacion con versión', () => {
  it('crear no pide versión; actualizar exige la que se leyó y la cambia', async () => {
    const id = await nueva()
    const sinVersion = await guardar(id, undefined, 'Sin versión')
    expect(sinVersion.error).toMatchObject({ code: 'P0001', message: 'Falta la versión de la cotización' })
    expect((await fila(id)).asunto).toBe('Primera versión')

    const leida = await versionDe(activo.client, id)
    expect((await guardar(id, leida, 'Segunda versión')).error).toBeNull()
    expect((await fila(id)).asunto).toBe('Segunda versión')
    expect(await versionDe(activo.client, id)).not.toBe(leida)
  })

  it('con una versión vieja no pisa lo que guardó otro', async () => {
    const id = await nueva()
    const leida = await versionDe(activo.client, id)
    expect((await guardar(id, leida, 'Guardado en otra pestaña')).error).toBeNull()

    const { error } = await guardar(id, leida, 'Guardado con la versión vieja')
    expect(error).toMatchObject({ code: 'P0001', message: CAMBIO })
    expect((await fila(id)).asunto).toBe('Guardado en otra pestaña')

    expect((await guardar(id, await versionDe(activo.client, id), 'Después de recargar')).error).toBeNull()
    expect((await fila(id)).asunto).toBe('Después de recargar')
  })

  it('compara la versión al milisegundo: pasarla por un Date de JS no la invalida', async () => {
    const id = await nueva()
    const enMilisegundos = new Date(await versionDe(activo.client, id)).toISOString()
    expect((await guardar(id, enMilisegundos, 'Con la versión de un Date')).error).toBeNull()
  })

  it('dos guardados a la vez con la misma versión: el segundo espera y no pisa al primero', async () => {
    const id = await nueva()
    const leida = await versionDe(activo.client, id)
    const { error } = await contraTransaccionEnCurso(
      activo.id,
      'select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3::uuid, $4::timestamptz)',
      [JSON.stringify(datosBase({ asunto: 'El que guardó primero' })), JSON.stringify(ITEMS_JORNADA), id, leida],
      () => guardar(id, leida, 'El que guardó segundo'),
    )
    expect(error).toMatchObject({ code: 'P0001', message: CAMBIO })
    expect((await fila(id)).asunto).toBe('El que guardó primero')
  })

  it('conserva lo de antes: una enviada editada sigue enviada y sin fecha conserva la suya', async () => {
    const id = await nueva()
    const enviada = await activo.client.rpc('marcar_enviada', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/enviada.pdf`,
      p_updated_at: await versionDe(activo.client, id),
    })
    expect(enviada.error).toBeNull()

    const { error } = await guardar(id, await versionDe(activo.client, id), 'Editada después de enviar', { fecha: null })
    expect(error).toBeNull()
    expect(await fila(id)).toEqual({ asunto: 'Editada después de enviar', estado: 'enviada', fecha: '2026-10-22' })
  })

  it('una aprobada o una que no existe no se editan, aunque manden una versión', async () => {
    const id = await nueva()
    const aprobada = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_updated_at: await versionDe(activo.client, id),
    })
    expect(aprobada.error).toBeNull()

    const { error } = await guardar(id, await versionDe(activo.client, id), 'No debería guardarse')
    expect(error).toMatchObject({ code: 'P0001', message: 'La cotización no existe o ya no se puede editar' })
    const inexistente = await guardar(crypto.randomUUID(), new Date().toISOString(), 'No debería guardarse')
    expect(inexistente.error?.message).toBe('La cotización no existe o ya no se puede editar')
  })

  it('sin la clave notas conserva las notas (el editor no las manda)', async () => {
    const id = await nueva()
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', asunto: 'Sin notas en el payload' },
      p_items: ITEMS_JORNADA,
    })
    expect(error).toBeNull()
    const [guardada] = await sql<{ asunto: string; notas: string }>(
      'select asunto, notas from public.cotizaciones where id = $1',
      [id],
    )
    expect(guardada).toEqual({ asunto: 'Sin notas en el payload', notas: MARCA })
  })

  it('un usuario inactivo no puede actualizar', async () => {
    const id = await nueva()
    const { error } = await inactivo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: datosBase({ asunto: 'Usuario inactivo' }),
      p_items: ITEMS_JORNADA,
    })
    expect(error?.code).toBe('42501')
    expect((await fila(id)).asunto).toBe('Primera versión')
  })
})

describe('buscar_cotizaciones', () => {
  type Insertada = { id: string; numero: number }
  const hoy = hoyArgentina()
  let cliente: string
  let filas: Record<'borrador' | 'aprobada' | 'rechazada' | 'vencida' | 'enviada' | 'otroCliente', Insertada>

  type Campos = { estado: string; fecha: string; asunto?: string; cliente?: string }

  async function insertar(campos: Campos): Promise<Insertada> {
    const aprobada = campos.estado === 'aprobada'
    const [insertada] = await sql<{ id: string; numero: string }>(
      `insert into public.cotizaciones
         (cliente_id, formato, equipo_id, notas, estado, fecha, validez_dias, asunto, fecha_aprobacion, presupuesto_estado)
       values ($1, 'jornada', $2, $3, $4, $5, 30, $6, $7, $8)
       returning id, numero`,
      [
        campos.cliente ?? cliente,
        ids.equipo_id,
        MARCA,
        campos.estado,
        campos.fecha,
        campos.asunto ?? '',
        aprobada ? campos.fecha : null,
        aprobada ? 'en_curso' : null,
      ],
    )
    return { id: insertada.id, numero: Number(insertada.numero) }
  }

  beforeAll(async () => {
    const [nuevo] = await sql<{ id: string }>(
      'insert into public.clientes (razon_social, notas) values ($1, $2) returning id',
      [`Grúas Ñandú ${CLAVE} S.A.`, MARCA],
    )
    cliente = nuevo.id
    // En orden de número. Las fechas fijas quedan lejos de hoy y de hoy - 40 para que el filtro de fechas no las mezcle.
    filas = {
      borrador: await insertar({ estado: 'borrador', fecha: '2025-03-01' }),
      aprobada: await insertar({ estado: 'aprobada', fecha: '2025-03-05' }),
      rechazada: await insertar({ estado: 'rechazada', fecha: '2025-03-10' }),
      vencida: await insertar({ estado: 'enviada', fecha: sumarDias(hoy, -40) }),
      enviada: await insertar({ estado: 'enviada', fecha: hoy }),
      otroCliente: await insertar({
        estado: 'borrador',
        fecha: '2025-03-01',
        cliente: ids.cliente_id,
        asunto: `Montaje ${CLAVE} en Añelo`,
      }),
    }
  })

  async function buscar(args: { texto?: string; estado?: string; cliente?: string; desde?: string; hasta?: string }) {
    const { data, error } = await activo.client.rpc('buscar_cotizaciones', args)
    if (error) throw error
    return data.map((encontrada) => encontrada.numero)
  }

  const numeros = (...nombres: (keyof typeof filas)[]) => nombres.map((nombre) => filas[nombre].numero)

  it('sin texto ni estado devuelve todas, de la más nueva a la más vieja por número', async () => {
    expect(await buscar({ cliente })).toEqual(numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador'))
  })

  it('busca sin acentos ni mayúsculas en la razón social y en el asunto', async () => {
    const todas = numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador')
    expect(await buscar({ texto: `NANDU ${CLAVE.toUpperCase()}` })).toEqual(todas)
    expect(await buscar({ texto: `ñandú ${CLAVE}` })).toEqual(todas)
    expect(await buscar({ texto: `${CLAVE} en ANELO` })).toEqual(numeros('otroCliente'))
  })

  it('busca por el comienzo del número, no por cualquier parte', async () => {
    const numero = String(filas.borrador.numero)
    expect(await buscar({ texto: `N° ${numero}`, cliente })).toEqual(numeros('borrador'))
    expect(await buscar({ texto: numero.slice(0, -1), cliente })).toContain(filas.borrador.numero)
    expect(await buscar({ texto: numero.slice(1), cliente })).toEqual([])
  })

  it('los dígitos de un texto que no es solo un número no buscan por número', async () => {
    // Todos los números empiezan con 1: si "Montaje … 1" buscara por número, traería todas las cotizaciones.
    const montaje = await insertar({
      estado: 'borrador',
      fecha: '2025-03-01',
      cliente: ids.cliente_id,
      asunto: `Montaje ${CLAVE} 1`,
    })
    expect(await buscar({ texto: `Montaje ${CLAVE} 1` })).toEqual([montaje.numero])
  })

  it('filtra por estado como la lista: "enviada" son las que están al día y "vencida" las otras', async () => {
    expect(await buscar({ cliente, estado: 'borrador' })).toEqual(numeros('borrador'))
    expect(await buscar({ cliente, estado: 'enviada' })).toEqual(numeros('enviada'))
    expect(await buscar({ cliente, estado: 'vencida' })).toEqual(numeros('vencida'))
    expect(await buscar({ cliente, estado: 'aprobada' })).toEqual(numeros('aprobada'))
    expect(await buscar({ cliente, estado: 'rechazada' })).toEqual(numeros('rechazada'))
  })

  it('filtra por rango de fechas, con los dos extremos incluidos', async () => {
    expect(await buscar({ cliente, desde: '2025-03-05', hasta: '2025-03-10' })).toEqual(numeros('rechazada', 'aprobada'))
    expect(await buscar({ cliente, hasta: '2025-03-01' })).toEqual(numeros('borrador'))
    expect(await buscar({ cliente, desde: hoy })).toEqual(numeros('enviada'))
  })

  it('pagina y cuenta como la lista (PostgREST) y deja embeber el equipo', async () => {
    const { data, count, error } = await activo.client
      .rpc('buscar_cotizaciones', { cliente }, { count: 'exact' })
      .select('id, numero, estado, vencida, cliente_razon_social, equipo:equipos(nombre, capacidad_tn, descripcion)')
      .range(2, 3)
    expect(error).toBeNull()
    expect(count).toBe(5)
    expect(data!.map((encontrada) => encontrada.numero)).toEqual(numeros('rechazada', 'aprobada'))
    expect(data![0]).toMatchObject({
      cliente_razon_social: `Grúas Ñandú ${CLAVE} S.A.`,
      equipo: { nombre: 'Grúa telescópica XCMG QY70K-1 40 TN' },
    })
  })

  it('un usuario inactivo no ve nada', async () => {
    const { data, error } = await inactivo.client.rpc('buscar_cotizaciones', { cliente })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerCatalogosEditor, leerContactos, leerUltimoFirmante } from '@/lib/cotizaciones/lecturas-editor'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
let equipoInactivo: string
let plantillaInactiva: string
let firmanteActivo: string
let firmanteInactivo: string

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
  const [equipo] = await sql<{ id: string }>(
    'insert into public.equipos (nombre, capacidad_tn, activo) values ($1, 25, false) returning id',
    [`Equipo ${MARCA}`],
  )
  const [plantilla] = await sql<{ id: string }>(
    `insert into public.plantillas (nombre, formato, activa, bloques)
     values ($1, 'mensual', false, '[{"titulo": "T", "contenido": "C"}]') returning id`,
    [`Plantilla ${MARCA}`],
  )
  const firmantes = await sql<{ id: string; activo: boolean }>(
    'insert into public.firmantes (nombre, activo) values ($1, true), ($2, false) returning id, activo',
    [`Firmante activo ${MARCA}`, `Firmante inactivo ${MARCA}`],
  )
  equipoInactivo = equipo.id
  plantillaInactiva = plantilla.id
  firmanteActivo = firmantes.find((firmante) => firmante.activo)!.id
  firmanteInactivo = firmantes.find((firmante) => !firmante.activo)!.id
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await sql('delete from public.firmantes where nombre like $1', [`%${MARCA}`])
  await sql('delete from public.equipos where nombre like $1', [`%${MARCA}`])
  await sql('delete from public.plantillas where nombre like $1', [`%${MARCA}`])
  await borrarUsuario(activo.id)
})

describe('leerCatalogosEditor', () => {
  it('trae los activos y, además, lo que la cotización ya tiene elegido aunque esté inactivo', async () => {
    const nueva = await leerCatalogosEditor(activo.client)
    expect(nueva.equipos.map((equipo) => equipo.id)).not.toContain(equipoInactivo)
    expect(nueva.firmantes.map((firmante) => firmante.id)).not.toContain(firmanteInactivo)
    expect(nueva.plantillas.map((plantilla) => plantilla.id)).not.toContain(plantillaInactiva)
    expect(nueva.plantillas.map((plantilla) => plantilla.nombre)).toEqual(
      expect.arrayContaining(['Mensual - Grúa con operador', 'Por jornada - Grúa con operador']),
    )

    const existente = await leerCatalogosEditor(activo.client, {
      plantillaId: plantillaInactiva,
      equipoId: equipoInactivo,
      firmanteId: firmanteInactivo,
    })
    expect(existente.equipos.find((equipo) => equipo.id === equipoInactivo)).toMatchObject({
      activo: false,
      capacidad_tn: 25,
    })
    expect(existente.firmantes.find((firmante) => firmante.id === firmanteInactivo)).toMatchObject({ activo: false })
    expect(existente.plantillas.find((plantilla) => plantilla.id === plantillaInactiva)).toMatchObject({
      formato: 'mensual',
      bloques: [{ titulo: 'T', contenido: 'C', oculto: false }],
      items: [],
    })
    expect(Object.keys(existente.empresa).sort()).toEqual([
      'ciudad',
      'direccion',
      'email',
      'indice_base',
      'proxima_actualizacion',
      'razon_social',
      'telefono',
      'web',
    ])
  })
})

describe('leerUltimoFirmante', () => {
  it('es el de la última cotización de la app que tenga un firmante activo', async () => {
    // Creadas "en el futuro": quedan como las últimas aunque la base tenga otras.
    await sql(
      `insert into public.cotizaciones (cliente_id, formato, firmante_id, notas, created_at) values
         ($1, 'jornada', $2, $4, now() + interval '1 day'),
         ($1, 'jornada', $3, $4, now() + interval '2 days')`,
      [ids.cliente_id, firmanteActivo, firmanteInactivo, MARCA],
    )
    const { firmantes } = await leerCatalogosEditor(activo.client)
    expect(await leerUltimoFirmante(activo.client, firmantes)).toBe(firmanteActivo)
  })

  it('sin firmantes activos devuelve null', async () => {
    expect(await leerUltimoFirmante(activo.client, [])).toBeNull()
  })
})

describe('leerContactos', () => {
  it('devuelve los contactos del cliente', async () => {
    expect(await leerContactos(activo.client, ids.cliente_con_contacto_id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.contacto_id, nombre: 'Yanina Colman' })]),
    )
  })
})

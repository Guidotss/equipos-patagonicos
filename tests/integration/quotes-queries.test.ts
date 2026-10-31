import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { readCatalogsEditor, readContacts, readLastSigner } from '@/lib/quotes/queries-editor'
import { idsOfExample } from './quotes-helpers'
import { removeUser, crearUser, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUser>>
let ids: Awaited<ReturnType<typeof idsOfExample>>
let equipmentInactivo: string
let templateInactiva: string
let signerActive: string
let signerInactivo: string

beforeAll(async () => {
  activo = await crearUser({ activo: true, rol: 'operador' })
  ids = await idsOfExample()
  const [equipo] = await sql<{ id: string }>(
    'insert into public.equipos (nombre, capacidad_tn, activo) values ($1, 25, false) returning id',
    [`Equipo ${MARCA}`],
  )
  const [template] = await sql<{ id: string }>(
    `insert into public.plantillas (nombre, formato, activa, bloques)
     values ($1, 'mensual', false, '[{"titulo": "T", "contenido": "C"}]') returning id`,
    [`Plantilla ${MARCA}`],
  )
  const firmantes = await sql<{ id: string; activo: boolean }>(
    'insert into public.firmantes (nombre, activo) values ($1, true), ($2, false) returning id, activo',
    [`Firmante activo ${MARCA}`, `Firmante inactivo ${MARCA}`],
  )
  equipmentInactivo = equipo.id
  templateInactiva = template.id
  signerActive = firmantes.find((firmante) => firmante.activo)!.id
  signerInactivo = firmantes.find((firmante) => !firmante.activo)!.id
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await sql('delete from public.firmantes where nombre like $1', [`%${MARCA}`])
  await sql('delete from public.equipos where nombre like $1', [`%${MARCA}`])
  await sql('delete from public.plantillas where nombre like $1', [`%${MARCA}`])
  await removeUser(activo.id)
})

describe('leerCatalogosEditor', () => {
  it('trae los activos y, además, lo que la cotización ya tiene elegido aunque esté inactivo', async () => {
    const nueva = await readCatalogsEditor(activo.client)
    expect(nueva.equipos.map((equipo) => equipo.id)).not.toContain(equipmentInactivo)
    expect(nueva.firmantes.map((firmante) => firmante.id)).not.toContain(signerInactivo)
    expect(nueva.plantillas.map((template) => template.id)).not.toContain(templateInactiva)
    expect(nueva.plantillas.map((template) => template.nombre)).toEqual(
      expect.arrayContaining(['Mensual - Grúa con operador', 'Por jornada - Grúa con operador']),
    )

    const existing = await readCatalogsEditor(activo.client, {
      templateId: templateInactiva,
      equipoId: equipmentInactivo,
      firmanteId: signerInactivo,
    })
    expect(existing.equipos.find((equipo) => equipo.id === equipmentInactivo)).toMatchObject({
      activo: false,
      capacidad_tn: 25,
    })
    expect(existing.firmantes.find((firmante) => firmante.id === signerInactivo)).toMatchObject({ activo: false })
    expect(existing.plantillas.find((template) => template.id === templateInactiva)).toMatchObject({
      formato: 'mensual',
      bloques: [{ titulo: 'T', contenido: 'C', hidden: false }],
      items: [],
    })
    expect(Object.keys(existing.empresa).sort()).toEqual([
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
      [ids.cliente_id, signerActive, signerInactivo, MARCA],
    )
    const { firmantes } = await readCatalogsEditor(activo.client)
    expect(await readLastSigner(activo.client, firmantes)).toBe(signerActive)
  })

  it('sin firmantes activos devuelve null', async () => {
    expect(await readLastSigner(activo.client, [])).toBeNull()
  })
})

describe('leerContactos', () => {
  it('devuelve los contactos del cliente', async () => {
    expect(await readContacts(activo.client, ids.client_with_contact_id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.contacto_id, nombre: 'Yanina Colman' })]),
    )
  })
})

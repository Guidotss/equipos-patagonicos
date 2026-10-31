import { parsePrice } from '@/lib/format/amounts'
import { isDate, todayArgentina } from '@/lib/format/dates'
import { buildDocument, type SourceDocument } from '../document'
import { nextUpdateInText } from './next-update'
import type { CatalogsEditor, PendingList, StatusEditor } from './types'

/**
 * El FuenteDocumento del estado sin guardar, para armarDocumento (pendientes en el navegador, vista previa en el
 * servidor). Equipo y firmante salen de los catálogos; el contacto lo pasa quien llama (null alcanza para las
 * variables). Lo que está a medio escribir no rompe: fecha inválida → hoy, validez inválida → 0, cantidad
 * inválida → 1, precio inválido → sin precio.
 */
export function sourceFromEditor(
  estado: StatusEditor,
  catalogs: CatalogsEditor,
  contacto: { nombre: string; email: string } | null,
): SourceDocument {
  const equipo = catalogs.equipos.find((candidate) => candidate.id === estado.equipoId)
  const firmante = catalogs.firmantes.find((candidate) => candidate.id === estado.firmanteId)
  const validity = Number(estado.validezDias.trim())
  return {
    cotizacion: {
      numero: estado.numero,
      fecha: isDate(estado.fecha) ? estado.fecha : todayArgentina(),
      formato: estado.formato,
      asunto: estado.asunto,
      intro: estado.intro,
      validez_dias: Number.isInteger(validity) && validity > 0 ? validity : 0,
      mostrar_total: estado.mostrarTotal,
      datos: {
        ...estado.datos,
        proxima_actualizacion: nextUpdateInText(estado.proximaActualizacion, estado.datos.proxima_actualizacion),
      },
      bloques: estado.bloques.map(({ titulo: title, contenido: content, hidden }) => ({
        titulo: title,
        contenido: content,
        hidden,
      })),
    },
    items: estado.items.map((item, index) => ({
      orden: index + 1,
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: parsePrice(item.cantidad) ?? 1,
      precio_unitario: parsePrice(item.precio),
      unidad: item.unidad,
    })),
    cliente: { razon_social: estado.cliente?.razon_social ?? '', cuit: estado.cliente?.cuit ?? null },
    contacto,
    equipo: equipo ? { capacidad_tn: equipo.capacidad_tn, descripcion: equipo.descripcion } : null,
    firmante: firmante ? { nombre: firmante.nombre, cargo: firmante.cargo, telefono: firmante.telefono } : null,
    empresa: catalogs.empresa,
  }
}

/** Lo que falta para poder enviar o aprobar, calculado con el mismo armarDocumento que dibuja el PDF. */
export function pendingListEditor(estado: StatusEditor, catalogs: CatalogsEditor): PendingList {
  const document = buildDocument(sourceFromEditor(estado, catalogs, null))
  return {
    // Sin guardar todavía no hay número: se asigna al guardar, no es algo que el usuario tenga que completar.
    variables: document.faltantes.filter((nombre) => nombre !== 'numero' || estado.id !== null),
    desconocidas: document.desconocidas,
    itemsWithoutPrice: estado.items.filter((item) => parsePrice(item.precio) === null).length,
    withoutItems: estado.items.length === 0,
  }
}

export function canSend(p: PendingList): boolean {
  return p.variables.length === 0 && p.desconocidas.length === 0 && p.itemsWithoutPrice === 0 && !p.withoutItems
}

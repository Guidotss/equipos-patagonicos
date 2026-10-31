import { parsePrice } from '@/lib/format/amounts'
import { isDate, todayArgentina } from '@/lib/format/dates'
import { buildDocument, type SourceDocument } from '../document'
import { nextUpdateInText } from './next-update'
import type { CatalogsEditor, PendingList, StatusEditor } from './types'

/**
 * El SourceDocument del estado sin guardar, para buildDocument (pendientes en el navegador, vista previa en el
 * servidor). Equipo y firmante salen de los catálogos; el contacto lo pasa quien llama (null alcanza para las
 * variables). Lo que está a medio escribir no rompe: fecha inválida → hoy, validez inválida → 0, cantidad
 * inválida → 1, precio inválido → sin precio.
 */
export function sourceFromEditor(
  state: StatusEditor,
  catalogs: CatalogsEditor,
  contact: { nombre: string; email: string } | null,
): SourceDocument {
  const equipment = catalogs.equipos.find((candidate) => candidate.id === state.equipoId)
  const signer = catalogs.firmantes.find((candidate) => candidate.id === state.firmanteId)
  const validity = Number(state.validezDias.trim())
  return {
    cotizacion: {
      numero: state.numero,
      fecha: isDate(state.fecha) ? state.fecha : todayArgentina(),
      formato: state.formato,
      asunto: state.asunto,
      intro: state.intro,
      validez_dias: Number.isInteger(validity) && validity > 0 ? validity : 0,
      mostrar_total: state.mostrarTotal,
      datos: {
        ...state.datos,
        proxima_actualizacion: nextUpdateInText(state.proximaActualizacion, state.datos.proxima_actualizacion),
      },
      bloques: state.bloques.map(({ titulo: title, contenido: content, hidden }) => ({
        titulo: title,
        contenido: content,
        hidden,
      })),
    },
    items: state.items.map((item, index) => ({
      orden: index + 1,
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: parsePrice(item.cantidad) ?? 1,
      precio_unitario: parsePrice(item.precio),
      unidad: item.unidad,
    })),
    cliente: { razon_social: state.cliente?.razon_social ?? '', cuit: state.cliente?.cuit ?? null },
    contacto: contact,
    equipo: equipment ? { capacidad_tn: equipment.capacidad_tn, descripcion: equipment.descripcion } : null,
    firmante: signer ? { nombre: signer.nombre, cargo: signer.cargo, telefono: signer.telefono } : null,
    empresa: catalogs.empresa,
  }
}

/** Lo que falta para poder enviar o aprobar, calculado con el mismo buildDocument que dibuja el PDF. */
export function pendingListEditor(state: StatusEditor, catalogs: CatalogsEditor): PendingList {
  const document = buildDocument(sourceFromEditor(state, catalogs, null))
  return {
    // Sin guardar todavía no hay número: se asigna al guardar, no es algo que el usuario tenga que completar.
    variables: document.faltantes.filter((name) => name !== 'numero' || state.id !== null),
    desconocidas: document.desconocidas,
    itemsWithoutPrice: state.items.filter((item) => parsePrice(item.precio) === null).length,
    withoutItems: state.items.length === 0,
  }
}

export function canSend(p: PendingList): boolean {
  return p.variables.length === 0 && p.desconocidas.length === 0 && p.itemsWithoutPrice === 0 && !p.withoutItems
}

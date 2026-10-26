// src/lib/cotizaciones/vista-previa.ts
// Qué muestra el panel de vista previa del editor y cómo lo explica. Puro: lo usa un componente de cliente.
import { formatFechaCorta, hoyArgentina } from '@/lib/format/fechas'
import { hayCambios, type EstadoEditor } from './editor'

/** Parámetros del visor de PDF del navegador: sin barra ni miniaturas y la hoja al ancho del panel. */
export const PARAMETROS_VISOR = '#toolbar=0&navpanes=0&view=FitH'

/** La URL que va en el <iframe> del panel. */
export function urlVisor(url: string): string {
  return `${url}${PARAMETROS_VISOR}`
}

/** El PDF de lo guardado en su versión actual (no el último envío): lo que abre "Vista previa" en el celular. */
export function urlPdfActual(id: string): string {
  return `/cotizaciones/${id}/pdf?actual=1`
}

export type ModoVistaPrevia =
  /** Se arma en el servidor con lo que hay en pantalla, aunque no esté guardado (POST /cotizaciones/vista-previa). */
  | { tipo: 'generada' }
  /** Un PDF que ya existe y no cambia con lo editado: el aprobado, el original de una cargada o lo enviado de una rechazada. */
  | { tipo: 'guardada'; url: string }
  /** Todavía no hay cliente: la cotización no tiene a quién dirigirse. */
  | { tipo: 'sin-cliente' }
  /** Un presupuesto directo no tiene PDF. */
  | { tipo: 'sin-pdf' }

export function modoVistaPrevia(estado: Pick<EstadoEditor, 'id' | 'estado' | 'origen' | 'cliente'>): ModoVistaPrevia {
  if (estado.origen === 'directa') return { tipo: 'sin-pdf' }
  const congelada = estado.origen === 'importada' || estado.estado === 'aprobada' || estado.estado === 'rechazada'
  if (estado.id && congelada) return { tipo: 'guardada', url: `/cotizaciones/${estado.id}/pdf` }
  if (!estado.cliente) return { tipo: 'sin-cliente' }
  return { tipo: 'generada' }
}

/** "20/10/2026" en hora argentina a partir de un timestamptz (por ejemplo, el enviada_at de un envío). */
export function fechaDeMarca(marca: string): string {
  return formatFechaCorta(hoyArgentina(new Date(marca)))
}

/**
 * La vista previa generada ya no muestra lo que hay en pantalla. El número cuenta aparte porque no está en lo que
 * se guarda: la primera vista previa de una nueva lo muestra como {{numero}} y, después de guardar, ya lo tiene.
 */
export function vistaDesactualizada(generadaCon: EstadoEditor | null, actual: EstadoEditor): boolean {
  if (!generadaCon) return false
  return generadaCon.numero !== actual.numero || hayCambios(generadaCon, actual)
}

/** La línea gris bajo el título "Vista previa". */
export function lineaVistaPrevia(args: {
  modo: ModoVistaPrevia
  estado: EstadoEditor['estado']
  origen: EstadoEditor['origen']
  desactualizada: boolean
  /** enviada_at del último envío, si hubo. */
  ultimoEnvio: string | null
  /** 'YYYY-MM-DD' */
  fechaAprobacion: string | null
}): string {
  switch (args.modo.tipo) {
    case 'sin-pdf':
      return ''
    case 'sin-cliente':
      return 'Elegí el cliente para verla.'
    case 'guardada':
      if (args.origen === 'importada') return 'PDF original cargado'
      if (args.estado === 'aprobada') {
        return args.fechaAprobacion ? `PDF aprobado el ${formatFechaCorta(args.fechaAprobacion)}` : 'PDF aprobado'
      }
      return args.ultimoEnvio ? `Último envío · ${fechaDeMarca(args.ultimoEnvio)}` : 'Versión guardada'
    case 'generada':
      if (args.desactualizada) return 'Hay cambios sin reflejar'
      if (args.ultimoEnvio) return `Versión actual · el último envío es del ${fechaDeMarca(args.ultimoEnvio)}`
      return 'Con lo que hay en pantalla, aunque no esté guardado'
  }
}

/** Mensaje del panel cuando la vista previa no se pudo generar (status null: no hubo respuesta). */
export function mensajeErrorVistaPrevia(status: number | null): string {
  if (status === 401) return 'Tu sesión venció: volvé a ingresar para ver la vista previa.'
  if (status === 400) return 'Hay datos que todavía no se pueden dibujar: revisalos y probá de nuevo.'
  return 'No se pudo generar la vista previa.'
}

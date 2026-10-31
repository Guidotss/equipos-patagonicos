import { z } from 'zod'
import { isDate } from '@/lib/format/dates'
import { parsePrice } from '@/lib/format/amounts'
import type { StatusEditor } from './editor/types'

export const FIELDS_SPECIAL = ['cliente_id', 'numero', 'fecha', 'fecha_aprobacion', 'formato', 'asunto', 'estado', 'notas'] as const

export function schemaSpecial(origin: 'importada' | 'directa') {
  return z.object({
    cliente_id: z.uuid('Elegí el cliente'),
    numero: z.string().trim().transform(Number).refine((n) => origin === 'directa' || (Number.isSafeInteger(n) && n > 0), 'Ingresá un número entero positivo'),
    fecha: z.string().refine(isDate, 'La fecha no es válida'),
    fecha_aprobacion: z.string().refine((v) => v === '' || isDate(v), 'La fecha no es válida'),
    formato: z.enum(['mensual', 'jornada']),
    asunto: z.string().trim().max(500).refine((v) => origin !== 'directa' || v.length > 0, 'Describí el trabajo'),
    estado: z.enum(['enviada', 'aprobada']),
    notas: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
  }).superRefine((v, ctx) => {
    if (v.fecha_aprobacion && (origin === 'directa' || v.estado === 'aprobada') && v.fecha_aprobacion < v.fecha) {
      ctx.addIssue({ code: 'custom', path: ['fecha_aprobacion'], message: 'La aprobación no puede ser anterior a la cotización' })
    }
  })
}

export function templateFromEditor(state: StatusEditor) {
  return {
    formato: state.formato,
    asunto: state.asunto,
    intro: state.intro,
    validez_dias: Number(state.validezDias),
    bloques: state.bloques.map(({ titulo: title, contenido: content, hidden }) => ({ titulo: title, contenido: content, hidden })),
    items: state.items.map(({ seccion: section, descripcion: description, cantidad: quantity, unidad: unit }) => ({ seccion: section, descripcion: description, cantidad: parsePrice(quantity), unidad: unit })),
  }
}

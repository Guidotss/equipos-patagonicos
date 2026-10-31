import { z } from 'zod'
import { isDate } from '@/lib/format/dates'
import { parsePrice } from '@/lib/format/amounts'
import type { StatusEditor } from './editor'

export const FIELDS_SPECIAL = ['cliente_id', 'numero', 'fecha', 'fecha_aprobacion', 'formato', 'asunto', 'estado', 'notas'] as const

export function schemaSpecial(origen: 'importada' | 'directa') {
  return z.object({
    cliente_id: z.uuid('Elegí el cliente'),
    numero: z.string().trim().transform(Number).refine((n) => origen === 'directa' || (Number.isSafeInteger(n) && n > 0), 'Ingresá un número entero positivo'),
    fecha: z.string().refine(isDate, 'La fecha no es válida'),
    fecha_aprobacion: z.string().refine((v) => v === '' || isDate(v), 'La fecha no es válida'),
    formato: z.enum(['mensual', 'jornada']),
    asunto: z.string().trim().max(500).refine((v) => origen !== 'directa' || v.length > 0, 'Describí el trabajo'),
    estado: z.enum(['enviada', 'aprobada']),
    notas: z.string().trim().max(2000, 'Máximo 2000 caracteres'),
  }).superRefine((v, ctx) => {
    if (v.fecha_aprobacion && (origen === 'directa' || v.estado === 'aprobada') && v.fecha_aprobacion < v.fecha) {
      ctx.addIssue({ code: 'custom', path: ['fecha_aprobacion'], message: 'La aprobación no puede ser anterior a la cotización' })
    }
  })
}

export function templateFromEditor(estado: StatusEditor) {
  return {
    formato: estado.formato,
    asunto: estado.asunto,
    intro: estado.intro,
    validez_dias: Number(estado.validezDias),
    bloques: estado.bloques.map(({ titulo: title, contenido: content, hidden }) => ({ titulo: title, contenido: content, hidden })),
    items: estado.items.map(({ seccion, descripcion, cantidad, unidad }) => ({ seccion, descripcion, cantidad: parsePrice(cantidad), unidad })),
  }
}

import { z } from 'zod'
import { esFecha } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import type { EstadoEditor } from './editor'

export const CAMPOS_ESPECIAL = ['cliente_id', 'numero', 'fecha', 'fecha_aprobacion', 'formato', 'asunto', 'estado', 'notas'] as const

export function esquemaEspecial(origen: 'importada' | 'directa') {
  return z.object({
    cliente_id: z.uuid('Elegí el cliente'),
    numero: z.string().trim().transform(Number).refine((n) => origen === 'directa' || (Number.isSafeInteger(n) && n > 0), 'Ingresá un número entero positivo'),
    fecha: z.string().refine(esFecha, 'La fecha no es válida'),
    fecha_aprobacion: z.string().refine((v) => v === '' || esFecha(v), 'La fecha no es válida'),
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

export function plantillaDesdeEditor(estado: EstadoEditor) {
  return {
    formato: estado.formato,
    asunto: estado.asunto,
    intro: estado.intro,
    validez_dias: Number(estado.validezDias),
    bloques: estado.bloques.map(({ titulo, contenido, oculto }) => ({ titulo, contenido, oculto })),
    items: estado.items.map(({ seccion, descripcion, cantidad, unidad }) => ({ seccion, descripcion, cantidad: parsePrecio(cantidad), unidad })),
  }
}

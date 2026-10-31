import type { Format } from '@/lib/templates/content'

/**
 * Lo que la página del editor lee de una cotización:
 * `supabase.from('cotizaciones').select(SELECT_EDITOR).eq('id', id).maybeSingle()`.
 * Los envíos vienen sin orden (la página los ordena por `enviada_at`); estadoDesdeFila no los usa, pero la página
 * los necesita para el historial y para avisar si se aprueba algo editado después del último envío.
 */
export const SELECT_EDITOR = `id, numero, estado, origen, fecha, formato, asunto, intro, datos, bloques, validez_dias,
  mostrar_total, fecha_proxima_actualizacion, contacto_id, plantilla_id, equipo_id, firmante_id, reemplaza_a,
  fecha_aprobacion, archivo_original_path, updated_at,
  cliente:clientes(id, razon_social, cuit),
  items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad),
  envios:cotizacion_envios(id, enviada_at)`

/**
 * El texto de private.exigir_version (supabase/migrations/20261025100200_cotizaciones_estados.sql) cuando la versión
 * que vio la pantalla ya no es la de la fila. El servicio da el mismo error antes de generar un PDF y el editor lo
 * reconoce para ofrecer "Recargar" (acciones-estado.ts): si cambia en la base, cambia acá.
 */
export const MESSAGE_CONFLICT = 'La cotización cambió desde que la abriste; volvé a intentarlo'

export const EDITOR_STATUSES = ['borrador', 'enviada', 'aprobada', 'rechazada'] as const
export const EDITOR_ORIGINS = ['app', 'importada', 'directa'] as const
export const EDITOR_FORMATS = ['mensual', 'jornada'] as const satisfies readonly Format[]

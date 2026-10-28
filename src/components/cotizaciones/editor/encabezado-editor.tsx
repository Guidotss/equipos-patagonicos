'use client'
// src/components/cotizaciones/editor/encabezado-editor.tsx

import { EncabezadoPagina } from '@/components/app-shell/encabezado'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { Button } from '@/components/ui/button'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import { resumenEncabezado } from '@/lib/cotizaciones/editor-pantalla'
import { cn } from '@/lib/utils'

export function EncabezadoEditor({
  estado,
  hoy,
  editable,
  cambios,
  guardando,
  ocupado,
  alGuardar,
  acciones,
}: {
  estado: EstadoEditor
  hoy: string
  editable: boolean
  cambios: boolean
  guardando: boolean
  /** Alguna acción corre: todos los botones de acción quedan deshabilitados (decisión 12). */
  ocupado: boolean
  alGuardar: () => void
  /** Botones de transición y menú ⋯ (Task 12), a la derecha de Guardar. Botones size="lg" (h-9). */
  acciones?: React.ReactNode
}) {
  const resumen = resumenEncabezado(estado, hoy)

  return (
    <EncabezadoPagina
      compacto
      titulo={resumen.titulo}
      extra={<EstadoCotizacion estado={estado.estado} vencida={resumen.vence?.vencida ?? false} />}
      descripcion={
        <>
          {resumen.detalle}
          {resumen.vence ? (
            <>
              {' · '}
              <span className={cn(resumen.vence.vencida && 'text-amber-700')}>{resumen.vence.texto}</span>
            </>
          ) : null}
        </>
      }
      acciones={
        <>
          {editable ? (
            // Debajo de 90rem Guardar está en la barra fija de abajo (BarraInferior).
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={alGuardar}
              disabled={ocupado || (estado.id !== null && !cambios)}
              className="hidden min-[90rem]:inline-flex"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          ) : null}
          {acciones}
        </>
      }
    />
  )
}

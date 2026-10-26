// src/components/cotizaciones/cotizacion-solo-lectura.tsx

import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { Button } from '@/components/ui/button'
import { formatFechaCorta } from '@/lib/format/fechas'

const ORIGEN = {
  importada: 'Cargada desde un PDF.',
  directa: 'Presupuesto directo: no tiene PDF.',
} as const

/** Cotización cargada o presupuesto directo: no se editan (decisión 24). La vista completa llega en el plan 3C. */
export function CotizacionSoloLectura({
  cotizacion,
}: {
  cotizacion: {
    id: string
    numero: number
    origen: keyof typeof ORIGEN
    estado: string
    vencida: boolean
    fecha: string
    cliente: string
    asunto: string
    tienePdf: boolean
  }
}) {
  return (
    <Contenido>
      <EncabezadoPagina
        compacto
        titulo={`Cotización N° ${cotizacion.numero}`}
        extra={<EstadoCotizacion estado={cotizacion.estado} vencida={cotizacion.vencida} />}
        descripcion={`${cotizacion.cliente} · ${formatFechaCorta(cotizacion.fecha)}`}
        acciones={
          cotizacion.tienePdf ? (
            <Button asChild variant="outline" size="lg">
              <a href={`/cotizaciones/${cotizacion.id}/pdf`} target="_blank" rel="noreferrer">
                <FileText aria-hidden />
                Ver el PDF original
              </a>
            </Button>
          ) : null
        }
      />
      <div className="max-w-3xl space-y-1 rounded-lg border bg-muted px-4 py-3 text-sm">
        <p>{ORIGEN[cotizacion.origen]}</p>
        {cotizacion.asunto ? (
          <p className="text-muted-foreground [overflow-wrap:anywhere]">Trabajo: {cotizacion.asunto}</p>
        ) : null}
      </div>
      <Link
        href="/cotizaciones"
        className="inline-flex items-center gap-1.5 text-[15px] text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a Cotizaciones
      </Link>
    </Contenido>
  )
}

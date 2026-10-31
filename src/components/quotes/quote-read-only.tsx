// src/components/quotes/quote-read-only.tsx

import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { Content, HeaderPage } from '@/components/app-shell/header'
import { StatusQuote } from '@/components/quotes/status-quote'
import { Button } from '@/components/ui/button'
import { formatShortDate } from '@/lib/format/dates'

const ORIGEN = {
  importada: 'Cargada desde un PDF.',
  directa: 'Presupuesto directo: no tiene PDF.',
} as const

/** Cotización cargada o presupuesto directo: no se editan (decisión 24). La vista completa llega en el plan 3C. */
export function ReadOnlyQuote({
  cotizacion: quote,
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
    <Content>
      <HeaderPage
        compact
        titulo={`Cotización N° ${quote.numero}`}
        extra={<StatusQuote estado={quote.estado} vencida={quote.vencida} />}
        descripcion={`${quote.cliente} · ${formatShortDate(quote.fecha)}`}
        actions={
          quote.tienePdf ? (
            <Button asChild variant="outline" size="lg">
              <a href={`/cotizaciones/${quote.id}/pdf`} target="_blank" rel="noreferrer">
                <FileText aria-hidden />
                Ver el PDF original
              </a>
            </Button>
          ) : null
        }
      />
      <div className="max-w-3xl space-y-1 rounded-lg border bg-muted px-4 py-3 text-sm">
        <p>{ORIGEN[quote.origen]}</p>
        {quote.asunto ? (
          <p className="text-muted-foreground [overflow-wrap:anywhere]">Trabajo: {quote.asunto}</p>
        ) : null}
      </div>
      <Link
        href="/cotizaciones"
        className="inline-flex items-center gap-1.5 text-[15px] text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a Cotizaciones
      </Link>
    </Content>
  )
}

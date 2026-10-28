import Link from 'next/link'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { formatFechaCorta } from '@/lib/format/fechas'
import { createClient } from '@/lib/supabase/server'

export async function HistorialComercial({ clienteId }: { clienteId: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.from('v_cotizaciones').select('id, numero, fecha, asunto, estado, vencida').eq('cliente_id', clienteId).order('numero', { ascending: false }).limit(10)
  if (error) throw error
  return <Tarjeta titulo="Actividad comercial" descripcion="Últimas cotizaciones y presupuestos del cliente.">
    <div className="mb-4 flex flex-wrap gap-2"><Button asChild variant="outline"><Link href={`/cotizaciones/nueva?cliente=${clienteId}`}>Nueva cotización</Link></Button><Button asChild variant="ghost"><Link href={`/cotizaciones?cliente=${clienteId}`}>Ver todas las cotizaciones</Link></Button><Button asChild variant="ghost"><Link href={`/presupuestos?cliente=${clienteId}`}>Ver presupuestos</Link></Button></div>
    {data.length ? <ul className="divide-y">{data.map((c) => <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3"><div className="min-w-0"><Link href={c.estado === 'aprobada' ? `/presupuestos/${c.id}` : `/cotizaciones/${c.id}`} className="font-medium text-primary hover:underline">{c.estado === 'aprobada' ? 'Presupuesto' : 'Cotización'} N° {c.numero}</Link><p className="text-sm text-muted-foreground">{c.fecha ? formatFechaCorta(c.fecha) : ''} · {c.asunto || 'Sin asunto'}</p></div><EstadoCotizacion estado={c.estado ?? ''} vencida={c.vencida ?? false} /></li>)}</ul> : <p className="text-sm text-muted-foreground">Todavía no hay cotizaciones para este cliente.</p>}
  </Tarjeta>
}

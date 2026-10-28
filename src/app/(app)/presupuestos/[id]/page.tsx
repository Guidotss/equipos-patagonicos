import { FileText } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { DocumentoForm } from '@/components/documentos/documento-form'
import { AccionesPresupuesto } from '@/components/presupuestos/acciones-presupuesto'
import { SeccionesDocumentos } from '@/components/presupuestos/secciones-documentos'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Pastilla } from '@/components/ui/pastilla'
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/documentos/esquemas'
import { contextoDocumento } from '@/lib/documentos/lecturas'
import { formatMoneda } from '@/lib/format/montos'
import { ESTADOS_PRESUPUESTO } from '@/lib/presupuestos/lista'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Presupuesto' }
export default async function PresupuestoPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { id } = await params
  if (!esUuid(id)) notFound()
  const consulta = await searchParams
  const supabase = await createClient()
  const { data: presupuesto, error } = await supabase.from('v_presupuestos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!presupuesto) notFound()
  const [contexto, vinculos] = await Promise.all([
    contextoDocumento(supabase, presupuesto.cliente_id),
    supabase.from('documento_presupuestos').select('documento_id').eq('cotizacion_id', id),
  ])
  if (vinculos.error) throw vinculos.error
  const ids = vinculos.data.map((item) => item.documento_id)
  const documentos = contexto.documentos.filter((item) => ids.includes(item.id))
  const [archivos, aplicaciones] = ids.length
    ? await Promise.all([
        supabase.from('documento_archivos').select('*').in('documento_id', ids).order('orden'),
        supabase.from('op_facturas').select('*').in('op_id', ids),
      ])
    : [
        { data: [], error: null },
        { data: [], error: null },
      ]
  if (archivos.error) throw archivos.error
  if (aplicaciones.error) throw aplicaciones.error
  const nuevo =
    typeof consulta.nuevo === 'string' && Object.hasOwn(TIPOS_DOCUMENTO, consulta.nuevo)
      ? (consulta.nuevo as TipoDocumento)
      : null
  const remitoId = typeof consulta.remito === 'string' && esUuid(consulta.remito) ? consulta.remito : undefined
  const facturaId = typeof consulta.factura === 'string' && esUuid(consulta.factura) ? consulta.factura : undefined
  const indicadores = [
    ['OC', presupuesto.ordenes_compra],
    ['Remitos', presupuesto.remitos],
    ['Facturas', presupuesto.facturas],
    ['OP', presupuesto.ordenes_pago],
  ] as const
  return (
    <>
      <BarraMigas migas={[{ texto: 'Presupuestos', href: '/presupuestos' }, { texto: String(presupuesto.numero) }]} />
      <EncabezadoFicha
        titulo={`Presupuesto N° ${presupuesto.numero}`}
        recuadro={<FileText className="size-10 text-primary" />}
        estado={
          <Pastilla
            tono={
              presupuesto.presupuesto_estado === 'en_curso'
                ? 'info'
                : presupuesto.presupuesto_estado === 'finalizado'
                  ? 'exito'
                  : 'neutro'
            }
          >
            {ESTADOS_PRESUPUESTO[presupuesto.presupuesto_estado as keyof typeof ESTADOS_PRESUPUESTO]}
          </Pastilla>
        }
        datos={
          <>
            <Link href={`/clientes/${presupuesto.cliente_id}`} className="hover:underline">
              {presupuesto.cliente_razon_social}
            </Link>
            <span className="mx-2">·</span>
            {presupuesto.asunto}
          </>
        }
        acciones={<AccionesPresupuesto id={id} estado={presupuesto.presupuesto_estado} />}
      />
      <Contenido>
        {presupuesto.presupuesto_motivo ? (
          <Alert>
            <AlertDescription>Motivo de anulación: {presupuesto.presupuesto_motivo}</AlertDescription>
          </Alert>
        ) : null}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-[repeat(4,minmax(0,1fr))_1.6fr]">
          {indicadores.map(([etiqueta, valor]) => (
            <div key={etiqueta} className="rounded-xl border bg-card px-4 py-3 shadow-tarjeta">
              <p className="text-xs text-muted-foreground">{etiqueta}</p>
              <p className="text-2xl font-semibold tabular-nums">{valor ?? 0}</p>
            </div>
          ))}
          <div className="col-span-2 rounded-xl border bg-card px-4 py-3 shadow-tarjeta sm:col-span-4 lg:col-span-1">
            <p className="text-xs text-muted-foreground">Saldo a cobrar</p>
            <p className="text-2xl font-semibold tabular-nums" data-testid="saldo-presupuesto">
              {formatMoneda(presupuesto.saldo ?? 0)}
            </p>
          </div>
        </div>
        {nuevo && presupuesto.presupuesto_estado !== 'anulado' ? (
          <DocumentoForm
            key={`${nuevo}-${remitoId}-${facturaId}`}
            presupuestoId={id}
            opciones={contexto.presupuestos}
            contextoInicial={contexto}
            tipo={nuevo}
            remitoId={remitoId}
            facturaId={facturaId}
          />
        ) : null}
        <SeccionesDocumentos
          presupuestoId={id}
          documentos={documentos}
          archivos={archivos.data!}
          facturas={contexto.facturas}
          anulados={presupuesto.presupuesto_estado === 'anulado'}
          aplicaciones={aplicaciones.data!}
        />
        <div className="flex justify-between gap-4 text-sm">
          <Link href={`/cotizaciones/${id}`} className="text-primary hover:underline">
            Ver {presupuesto.origen === 'directa' ? 'presupuesto original' : 'cotización original'}
          </Link>
          <Link href="/presupuestos" className="text-muted-foreground hover:underline">
            Volver a presupuestos
          </Link>
        </div>
      </Contenido>
    </>
  )
}

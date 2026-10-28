import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { BarraMigas, Contenido } from '@/components/app-shell/encabezado'
import { EncabezadoFormulario } from '@/components/formulario/estructura-formulario'
import { AccionesDocumento } from '@/components/documentos/acciones-documento'
import { DocumentoForm } from '@/components/documentos/documento-form'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/documentos/esquemas'
import { contextoDocumento } from '@/lib/documentos/lecturas'
import { numeroDocumento } from '@/lib/documentos/pantallas'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Documento' }
export default async function DocumentoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()
  const supabase = await createClient()
  const { data: documento, error } = await supabase.from('documentos').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!documento) notFound()
  const [contexto, archivos, vinculos, aplicaciones] = await Promise.all([
    contextoDocumento(supabase, documento.cliente_id),
    supabase.from('documento_archivos').select('*').eq('documento_id', id).order('orden'),
    supabase.from('documento_presupuestos').select('cotizacion_id').eq('documento_id', id),
    supabase.from('op_facturas').select('factura_id, monto_aplicado').eq('op_id', id),
  ])
  for (const resultado of [archivos, vinculos, aplicaciones]) if (resultado.error) throw resultado.error
  const presupuestoId = vinculos.data![0]?.cotizacion_id
  return (
    <>
      <BarraMigas
        migas={[
          { texto: 'Presupuestos', href: '/presupuestos' },
          ...(presupuestoId
            ? [
                {
                  texto: String(
                    contexto.presupuestos.find((item) => item.id === presupuestoId)?.numero ?? 'Presupuesto',
                  ),
                  href: `/presupuestos/${presupuestoId}`,
                },
              ]
            : []),
          { texto: numeroDocumento(documento) },
        ]}
      />
      <Contenido className="max-w-6xl">
        <EncabezadoFormulario
          titulo={`${TIPOS_DOCUMENTO[documento.tipo as TipoDocumento]} · ${numeroDocumento(documento)}`}
        />
        {documento.deleted_at ? (
          <>
            <Alert>
              <AlertDescription>
                Este documento está anulado. Sus archivos y vínculos se conservan. Para restaurar un pago, sus facturas
                deben estar vigentes y tener saldo disponible.
              </AlertDescription>
            </Alert>
            <AccionesDocumento id={id} anulado />
            {aplicaciones.data!.length ? (
              <ul className="flex flex-col gap-2">
                {aplicaciones.data!.map((item) => (
                  <li key={item.factura_id}>
                    <Link href={`/documentos/${item.factura_id}`} className="text-sm text-primary underline">
                      Revisar factura{' '}
                      {contexto.documentos.find((factura) => factura.id === item.factura_id)?.numero || 'sin número'}
                    </Link>
                  </li>
                ))}
              </ul>
            ) : null}
            <ul className="flex flex-col gap-2">
              {archivos.data!.map((archivo) => (
                <li key={archivo.id}>
                  <a
                    href={`/documentos/archivos/${archivo.id}`}
                    target="_blank"
                    className="text-sm text-primary underline"
                  >
                    {archivo.nombre_original}
                  </a>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <DocumentoForm
            opciones={contexto.presupuestos}
            presupuestoId={presupuestoId}
            contextoInicial={contexto}
            documento={documento}
            archivosExistentes={archivos.data!}
            vinculos={vinculos.data!.map((item) => item.cotizacion_id)}
            aplicacionesIniciales={aplicaciones.data!}
          />
        )}
      </Contenido>
    </>
  )
}

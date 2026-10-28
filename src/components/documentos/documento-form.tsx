'use client'

import { FileText, LoaderCircle, Save } from 'lucide-react'
import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { guardarDocumento, leerContextoDocumento } from '@/app/(app)/documentos/actions'
import { Campo } from '@/components/formulario/campo'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { CAMPOS_DOCUMENTO, TIPOS_COMPROBANTE, TIPOS_DOCUMENTO, type TipoDocumento } from '@/lib/documentos/esquemas'
import {
  type ArchivoDocumento,
  type ContextoDocumento,
  type Documento,
  type OpcionPresupuesto,
} from '@/lib/documentos/pantallas'
import type { ArchivoSubido } from '@/lib/documentos/servicio'
import { formatMoneda, formatMontoTabla, parsePrecio } from '@/lib/format/montos'
import { SubidaArchivos } from './subida-archivos'

type Valores = Record<(typeof CAMPOS_DOCUMENTO)[number], string>
const CONTEXTO_VACIO: ContextoDocumento = { presupuestos: [], documentos: [], facturas: [], equipos: [] }
const normalizarNumero = (numero: string) =>
  numero
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')

export function DocumentoForm({
  opciones,
  presupuestoId = '',
  contextoInicial = CONTEXTO_VACIO,
  tipo = 'remito',
  documento,
  archivosExistentes = [],
  vinculos = [],
  aplicacionesIniciales = [],
  remitoId,
  facturaId,
  cotizacion,
}: {
  opciones: OpcionPresupuesto[]
  presupuestoId?: string
  contextoInicial?: ContextoDocumento
  tipo?: TipoDocumento
  documento?: Documento
  archivosExistentes?: ArchivoDocumento[]
  vinculos?: string[]
  aplicacionesIniciales?: { factura_id: string; monto_aplicado: number }[]
  remitoId?: string
  facturaId?: string
  cotizacion?: { id: string; version: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const enviando = useRef(false)
  const [contexto, setContexto] = useState(contextoInicial)
  const [seleccionados, setSeleccionados] = useState(vinculos.length ? vinculos : presupuestoId ? [presupuestoId] : [])
  const [clienteId, setClienteId] = useState(
    documento?.cliente_id ?? opciones.find((opcion) => opcion.id === presupuestoId)?.cliente_id ?? '',
  )
  const [cargando, setCargando] = useState(false)
  const solicitudContexto = useRef(0)
  const [valores, setValores] = useState<Valores>(() => {
    const inicial = Object.fromEntries(
      CAMPOS_DOCUMENTO.map((campo) => [campo, documento?.[campo] == null ? '' : String(documento[campo])]),
    ) as Valores
    inicial.tipo = documento?.tipo ?? tipo
    inicial.tipo_comprobante = documento?.tipo_comprobante ?? 'FA'
    const factura = contextoInicial.facturas.find((item) => item.id === facturaId)
    if (factura?.saldo) inicial.monto = formatMontoTabla(factura.saldo)
    else if (documento?.monto) inicial.monto = formatMontoTabla(documento.monto)
    return inicial
  })
  const [remitos, setRemitos] = useState<string[]>(() =>
    documento
      ? contextoInicial.documentos.filter((item) => item.factura_id === documento.id).map((item) => item.id)
      : remitoId
        ? [remitoId]
        : [],
  )
  const [aplicaciones, setAplicaciones] = useState<Record<string, string>>(() => {
    if (documento)
      return Object.fromEntries(
        aplicacionesIniciales.map((item) => [item.factura_id, formatMontoTabla(item.monto_aplicado)]),
      )
    const factura = contextoInicial.facturas.find((item) => item.id === facturaId)
    return factura?.id && factura.saldo ? { [factura.id]: formatMontoTabla(factura.saldo) } : {}
  })
  const [nuevos, setNuevos] = useState<ArchivoSubido[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [quitar, setQuitar] = useState<string[]>([])
  const [mensaje, setMensaje] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const alCambiarArchivos = useCallback((archivos: ArchivoSubido[], pendientes: boolean) => {
    setNuevos(archivos)
    setSubiendo(pendientes)
  }, [])
  const cambiarCampo = (campo: keyof Valores, valor: string) =>
    setValores((anteriores) => ({ ...anteriores, [campo]: valor }))
  const cambiarLista = (lista: string[], id: string, checked: boolean) =>
    checked ? [...lista, id] : lista.filter((item) => item !== id)

  async function elegirPresupuesto(id: string) {
    const opcion = opciones.find((item) => item.id === id)
    setSeleccionados(id ? [id] : [])
    if (!opcion || opcion.cliente_id === clienteId) return
    setClienteId(opcion.cliente_id)
    setRemitos([])
    setAplicaciones({})
    setNuevos([])
    setSubiendo(false)
    const solicitud = ++solicitudContexto.current
    setCargando(true)
    try {
      const respuesta = await leerContextoDocumento(opcion.cliente_id)
      if (solicitud !== solicitudContexto.current) return
      if (respuesta.ok) {
        setContexto(respuesta.datos)
        setMensaje('')
      } else {
        setContexto(CONTEXTO_VACIO)
        setMensaje(respuesta.mensaje)
      }
    } catch {
      setMensaje('No se pudieron cargar los documentos del cliente. Volvé a seleccionar el presupuesto.')
    } finally {
      if (solicitud === solicitudContexto.current) setCargando(false)
    }
  }
  function cambiarAplicacion(id: string, valor: string | null) {
    const siguiente = { ...aplicaciones }
    if (valor === null) delete siguiente[id]
    else siguiente[id] = valor
    setAplicaciones(siguiente)
    const total = Object.values(siguiente).reduce((suma, monto) => suma + (parsePrecio(monto) ?? 0), 0)
    cambiarCampo('monto', total ? formatMontoTabla(total) : '')
  }
  function guardar(evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando.current || subiendo || cargando) return
    enviando.current = true
    setMensaje('')
    setErrores({})
    startTransition(async () => {
      try {
        const resultado = await guardarDocumento({
          id: documento?.id,
          clienteId,
          presupuestos: seleccionados,
          datos: valores,
          archivos: nuevos,
          quitar,
          remitos: valores.tipo === 'factura' ? remitos : [],
          aplicaciones:
            valores.tipo === 'orden_pago'
              ? Object.entries(aplicaciones).map(([factura_id, monto_aplicado]) => ({ factura_id, monto_aplicado }))
              : [],
          cotizacion,
        })
        if (!resultado.ok) {
          setMensaje(resultado.mensaje)
          setErrores(resultado.errores ?? {})
          return
        }
        router.push(`/presupuestos/${resultado.datos.presupuesto}`)
        router.refresh()
      } catch {
        setMensaje('No se pudo guardar. Tus datos y archivos siguen acá para reintentar.')
      } finally {
        enviando.current = false
      }
    })
  }
  function campo(nombre: keyof Valores, etiqueta: string, tipoInput = 'text', requerido = false) {
    return (
      <Campo id={nombre} etiqueta={etiqueta} error={errores[`datos.${nombre}`]}>
        <Input
          id={nombre}
          value={valores[nombre]}
          onChange={(evento) => cambiarCampo(nombre, evento.target.value)}
          type={tipoInput}
          required={requerido}
          maxLength={nombre === 'numero' || nombre === 'numero_oc_ref' ? 50 : undefined}
          inputMode={nombre === 'monto' ? 'decimal' : undefined}
          aria-invalid={Boolean(errores[`datos.${nombre}`])}
        />
      </Campo>
    )
  }
  const duplicado =
    valores.numero &&
    contexto.documentos.some(
      (item) =>
        item.id !== documento?.id &&
        !item.deleted_at &&
        item.tipo === valores.tipo &&
        normalizarNumero(item.numero) === normalizarNumero(valores.numero),
    )
  const presupuestosCliente = contexto.presupuestos.filter(
    (item) => item.presupuesto_estado !== 'anulado' || seleccionados.includes(item.id),
  )
  const facturasActivas = new Set(contexto.facturas.map((item) => item.id))
  const remitosDisponibles = contexto.documentos.filter(
    (item) =>
      item.tipo === 'remito' &&
      !item.deleted_at &&
      (!item.factura_id || item.factura_id === documento?.id || !facturasActivas.has(item.factura_id)),
  )
  const volver = presupuestoId ? `/presupuestos/${presupuestoId}` : '/presupuestos'

  return (
    <form onSubmit={guardar} id="nuevo-documento" className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      {mensaje ? (
        <Alert variant="destructive">
          <AlertDescription>{mensaje}</AlertDescription>
        </Alert>
      ) : null}
      {cotizacion ? (
        <Alert>
          <AlertDescription>
            Al guardar la orden de compra también se aprueba la cotización y se conserva su PDF.
          </AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending || cargando} className="flex min-w-0 flex-col gap-5">
        <Tarjeta titulo={documento ? 'Editar documento' : 'Subir documento'} icono={FileText} compacta>
          <div className="flex flex-col gap-4">
            {!documento && !cotizacion ? (
              <Campo id="presupuesto" etiqueta="Presupuesto" error={errores.presupuestos}>
                <NativeSelect
                  id="presupuesto"
                  className="w-full"
                  value={seleccionados[0] ?? ''}
                  onChange={(evento) => void elegirPresupuesto(evento.target.value)}
                  required
                >
                  <NativeSelectOption value="">Elegí un presupuesto</NativeSelectOption>
                  {opciones
                    .filter((item) => item.presupuesto_estado !== 'anulado')
                    .map((item) => (
                      <NativeSelectOption key={item.id} value={item.id}>
                        {item.numero} · {item.cliente_razon_social} · {item.asunto}
                      </NativeSelectOption>
                    ))}
                </NativeSelect>
              </Campo>
            ) : null}
            <Campo id="tipo-documento" etiqueta="Tipo de documento" error={errores['datos.tipo']}>
              <ToggleGroup
                id="tipo-documento"
                type="single"
                value={valores.tipo}
                onValueChange={(valor) => {
                  if (valor) cambiarCampo('tipo', valor)
                }}
                variant="outline"
                className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
                disabled={Boolean(cotizacion)}
                aria-label="Tipo de documento"
              >
                {Object.entries(TIPOS_DOCUMENTO).map(([valor, etiqueta]) => (
                  <ToggleGroupItem key={valor} value={valor} className="h-17 flex-col gap-1 text-xs">
                    <FileText aria-hidden />
                    {etiqueta}
                  </ToggleGroupItem>
                ))}
              </ToggleGroup>
            </Campo>
          </div>
        </Tarjeta>
        <Tarjeta titulo="Adjuntar archivos" compacta>
          <div className="flex flex-col gap-3">
            {archivosExistentes.length ? (
              <ul className="flex flex-col gap-2">
                {archivosExistentes.map((archivo) => (
                  <li
                    key={archivo.id}
                    className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
                  >
                    <a
                      href={`/documentos/archivos/${archivo.id}`}
                      target="_blank"
                      className={
                        quitar.includes(archivo.id)
                          ? 'truncate text-muted-foreground line-through'
                          : 'truncate text-primary underline underline-offset-4'
                      }
                    >
                      {archivo.nombre_original}
                    </a>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => setQuitar((lista) => cambiarLista(lista, archivo.id, !lista.includes(archivo.id)))}
                    >
                      {quitar.includes(archivo.id) ? 'Conservar' : 'Quitar'}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <SubidaArchivos key={clienteId} clienteId={clienteId} disabled={pending} alCambiar={alCambiarArchivos} />
            {errores.archivos ? <p className="text-sm text-destructive">{errores.archivos}</p> : null}
          </div>
        </Tarjeta>
        <Tarjeta titulo="Datos del documento" compacta>
          <div className="grid gap-4 sm:grid-cols-2">
            {campo('numero', 'Número (opcional)')}
            {campo('fecha', 'Fecha (opcional)', 'date')}
            {duplicado ? (
              <Alert className="sm:col-span-2">
                <AlertDescription>
                  Ya hay un documento del mismo tipo con este número. Revisalo antes de guardar.
                </AlertDescription>
              </Alert>
            ) : null}
            {campo(
              'monto',
              valores.tipo === 'factura'
                ? 'Monto total con IVA'
                : valores.tipo === 'orden_pago'
                  ? 'Monto de la orden de pago'
                  : 'Monto (opcional)',
              'text',
              valores.tipo === 'factura' || valores.tipo === 'orden_pago',
            )}
            {valores.tipo === 'factura' ? (
              <>
                <Campo id="tipo_comprobante" etiqueta="Comprobante" error={errores['datos.tipo_comprobante']}>
                  <NativeSelect
                    id="tipo_comprobante"
                    value={valores.tipo_comprobante}
                    onChange={(evento) => cambiarCampo('tipo_comprobante', evento.target.value)}
                    className="w-full"
                  >
                    {Object.entries(TIPOS_COMPROBANTE).map(([valor, etiqueta]) => (
                      <NativeSelectOption value={valor} key={valor}>
                        {etiqueta}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Campo>
                {campo('fecha_vencimiento', 'Vencimiento (opcional)', 'date')}
                {campo('numero_oc_ref', 'OC de referencia (opcional)')}
              </>
            ) : null}
            {valores.tipo === 'remito' ? (
              <>
                <Campo id="equipo_id" etiqueta="Equipo (opcional)">
                  <NativeSelect
                    id="equipo_id"
                    className="w-full"
                    value={valores.equipo_id}
                    onChange={(evento) => cambiarCampo('equipo_id', evento.target.value)}
                  >
                    <NativeSelectOption value="">Sin equipo</NativeSelectOption>
                    {contexto.equipos.map((equipo) => (
                      <NativeSelectOption value={equipo.id} key={equipo.id}>
                        {equipo.nombre}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </Campo>
                {campo('periodo_desde', 'Período desde (opcional)', 'date')}
                {campo('periodo_hasta', 'Período hasta (opcional)', 'date')}
              </>
            ) : null}
            <Campo id="notas" etiqueta="Notas (opcional)" error={errores['datos.notas']} className="sm:col-span-2">
              <Textarea
                id="notas"
                value={valores.notas}
                onChange={(evento) => cambiarCampo('notas', evento.target.value)}
                rows={3}
                maxLength={2000}
              />
            </Campo>
          </div>
        </Tarjeta>
        {!cotizacion && presupuestosCliente.length ? (
          <Tarjeta
            titulo="Presupuestos vinculados"
            descripcion="Podés compartir este documento entre presupuestos del mismo cliente."
            compacta
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Presupuestos vinculados</legend>
              {presupuestosCliente.map((item) => (
                <label key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1.5 text-sm">
                  <input
                    type="checkbox"
                    className="mt-0.5 size-4 accent-primary"
                    checked={seleccionados.includes(item.id)}
                    onChange={(evento) =>
                      setSeleccionados((lista) => cambiarLista(lista, item.id, evento.target.checked))
                    }
                  />
                  <span>
                    N° {item.numero} · {item.asunto}
                  </span>
                </label>
              ))}
            </fieldset>
          </Tarjeta>
        ) : null}
        {valores.tipo === 'factura' ? (
          <Tarjeta
            titulo="Remitos que cubre"
            descripcion="Elegí los remitos del cliente incluidos en esta factura."
            compacta
          >
            <fieldset className="flex flex-col gap-2">
              <legend className="sr-only">Remitos que cubre</legend>
              {remitosDisponibles.length ? (
                remitosDisponibles.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={remitos.includes(item.id)}
                      onChange={(evento) => setRemitos((lista) => cambiarLista(lista, item.id, evento.target.checked))}
                    />
                    Remito {item.numero || 'sin número'}
                  </label>
                ))
              ) : (
                <p className="text-sm text-muted-foreground">No hay remitos pendientes de facturar.</p>
              )}
            </fieldset>
          </Tarjeta>
        ) : null}
        {valores.tipo === 'orden_pago' ? (
          <Tarjeta
            titulo="Facturas que cancela"
            descripcion="El importe se completa con el saldo disponible; podés ajustarlo."
            compacta
          >
            <fieldset className="flex flex-col gap-3">
              <legend className="sr-only">Facturas que cancela</legend>
              {contexto.facturas
                .filter(
                  (item) =>
                    item.tipo_comprobante !== 'NC' &&
                    ((item.saldo ?? 0) > 0 || (item.id && aplicaciones[item.id] !== undefined)),
                )
                .map((item) => {
                  const id = item.id!
                  const disponible =
                    (item.saldo ?? 0) +
                    (aplicacionesIniciales.find((aplicacion) => aplicacion.factura_id === id)?.monto_aplicado ?? 0)
                  return (
                    <div key={id} className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
                      <label className="flex min-w-0 flex-1 items-start gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="mt-0.5 size-4 accent-primary"
                          checked={aplicaciones[id] !== undefined}
                          onChange={(evento) =>
                            cambiarAplicacion(id, evento.target.checked ? formatMontoTabla(disponible) : null)
                          }
                        />
                        <span>
                          {[item.tipo_comprobante, item.numero || 'Sin número'].join(' ')}
                          <span className="block text-xs text-muted-foreground">
                            Saldo disponible {formatMoneda(disponible)}
                          </span>
                        </span>
                      </label>
                      {aplicaciones[id] !== undefined ? (
                        <Input
                          className="w-36"
                          aria-label={`Importe aplicado a ${item.numero || 'factura sin número'}`}
                          inputMode="decimal"
                          value={aplicaciones[id]}
                          onChange={(evento) => cambiarAplicacion(id, evento.target.value)}
                          required
                        />
                      ) : null}
                    </div>
                  )
                })}
              {!contexto.facturas.some(
                (item) =>
                  item.tipo_comprobante !== 'NC' &&
                  ((item.saldo ?? 0) > 0 || (item.id && aplicaciones[item.id] !== undefined)),
              ) ? (
                <p className="text-sm text-muted-foreground">No hay facturas con saldo para este cliente.</p>
              ) : null}
            </fieldset>
          </Tarjeta>
        ) : null}
      </fieldset>
      {Object.entries(errores)
        .filter(([campo]) => !campo.startsWith('datos.') && campo !== 'archivos')
        .map(([campo, error]) => (
          <p key={campo} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      <div className="sticky bottom-0 flex items-center justify-end gap-3 border-t bg-background/95 py-4 backdrop-blur">
        <Button variant="outline" asChild disabled={pending}>
          <Link href={volver}>Cancelar</Link>
        </Button>
        <Button type="submit" size="lg" disabled={pending || subiendo || cargando || !clienteId}>
          {pending || cargando ? (
            <LoaderCircle data-icon="inline-start" className="animate-spin" />
          ) : (
            <Save data-icon="inline-start" />
          )}
          {pending
            ? 'Guardando…'
            : documento
              ? 'Guardar cambios'
              : cotizacion
                ? 'Aprobar y guardar OC'
                : 'Guardar documento'}
        </Button>
      </div>
    </form>
  )
}

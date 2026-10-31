'use client'

import { FileText, LoaderCircle } from 'lucide-react'
import { useCallback, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { saveDocument, readContextoDocument } from '@/app/(app)/documentos/actions'
import { Field } from '@/components/form/field'
import { ActionsForm, SheetForm } from '@/components/form/structure-form'
import { Card } from '@/components/form/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { FIELDS_DOCUMENT, TIPOS_COMPROBANTE, TIPOS_DOCUMENT, type TipoDocument } from '@/lib/documents/schemas'
import {
  type FileDocument,
  type ContextoDocument,
  type Document,
  type OptionBudget,
} from '@/lib/documents/screens'
import type { FileSubido } from '@/lib/documents/service'
import { formatMoneda, formatAmountTable, parsePrice } from '@/lib/format/amounts'
import { UploadFiles } from './upload-files'

type Values = Record<(typeof FIELDS_DOCUMENT)[number], string>
const CONTEXTO_EMPTY: ContextoDocument = { budgets: [], documentos: [], facturas: [], equipos: [] }
const normalizeNumber = (numero: string) =>
  numero
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')
    .replace(/^0+/, '')

export function DocumentForm({
  options,
  budgetId = '',
  contextoInitial = CONTEXTO_EMPTY,
  tipo = 'remito',
  document,
  filesExisting = [],
  vinculos = [],
  aplicacionesIniciales = [],
  deliveryNoteId,
  invoiceId,
  cotizacion: quote,
}: {
  options: OptionBudget[]
  budgetId?: string
  contextoInitial?: ContextoDocument
  tipo?: TipoDocument
  document?: Document
  filesExisting?: FileDocument[]
  vinculos?: string[]
  aplicacionesIniciales?: { factura_id: string; monto_aplicado: number }[]
  deliveryNoteId?: string
  invoiceId?: string
  cotizacion?: { id: string; version: string }
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const enviando = useRef(false)
  const [contexto, setContexto] = useState(contextoInitial)
  const [seleccionados, setSeleccionados] = useState(vinculos.length ? vinculos : budgetId ? [budgetId] : [])
  const [clientId, setClientId] = useState(
    document?.cliente_id ?? options.find((option) => option.id === budgetId)?.cliente_id ?? '',
  )
  const [cargando, setCargando] = useState(false)
  const [searchBudget, setSearchBudget] = useState('')
  const requestContexto = useRef(0)
  const [values, setValues] = useState<Values>(() => {
    const initial = Object.fromEntries(
      FIELDS_DOCUMENT.map((field) => [field, document?.[field] == null ? '' : String(document[field])]),
    ) as Values
    initial.tipo = document?.tipo ?? tipo
    initial.tipo_comprobante = document?.tipo_comprobante ?? 'FA'
    const invoice = contextoInitial.facturas.find((item) => item.id === invoiceId)
    if (invoice?.saldo) initial.monto = formatAmountTable(invoice.saldo)
    else if (document?.monto) initial.monto = formatAmountTable(document.monto)
    return initial
  })
  const [remitos, setDeliveryNotes] = useState<string[]>(() =>
    document
      ? contextoInitial.documentos.filter((item) => item.factura_id === document.id).map((item) => item.id)
      : deliveryNoteId
        ? [deliveryNoteId]
        : [],
  )
  const [aplicaciones, setAplicaciones] = useState<Record<string, string>>(() => {
    if (document)
      return Object.fromEntries(
        aplicacionesIniciales.map((item) => [item.factura_id, formatAmountTable(item.monto_aplicado)]),
      )
    const invoice = contextoInitial.facturas.find((item) => item.id === invoiceId)
    return invoice?.id && invoice.saldo ? { [invoice.id]: formatAmountTable(invoice.saldo) } : {}
  })
  const [nuevos, setNew] = useState<FileSubido[]>([])
  const [subiendo, setSubiendo] = useState(false)
  const [quitar, setQuitar] = useState<string[]>([])
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const onChangeFiles = useCallback((archivos: FileSubido[], pendingList: boolean) => {
    setNew(archivos)
    setSubiendo(pendingList)
  }, [])
  const changeField = (field: keyof Values, value: string) =>
    setValues((anteriores) => ({ ...anteriores, [field]: value }))
  const changeList = (list: string[], id: string, checked: boolean) =>
    checked ? [...list, id] : list.filter((item) => item !== id)

  async function chooseBudget(id: string) {
    const option = options.find((item) => item.id === id)
    setSeleccionados(id ? [id] : [])
    if (!option || option.cliente_id === clientId) return
    setClientId(option.cliente_id)
    setDeliveryNotes([])
    setAplicaciones({})
    setNew([])
    setSubiendo(false)
    const request = ++requestContexto.current
    setCargando(true)
    try {
      const response = await readContextoDocument(option.cliente_id)
      if (request !== requestContexto.current) return
      if (response.ok) {
        setContexto(response.datos)
        setMessage('')
      } else {
        setContexto(CONTEXTO_EMPTY)
        setMessage(response.message)
      }
    } catch {
      setMessage('No se pudieron cargar los documentos del cliente. Volvé a seleccionar el presupuesto.')
    } finally {
      if (request === requestContexto.current) setCargando(false)
    }
  }
  function changeAplicacion(id: string, value: string | null) {
    const next = { ...aplicaciones }
    if (value === null) delete next[id]
    else next[id] = value
    setAplicaciones(next)
    const total = Object.values(next).reduce((sum, monto) => sum + (parsePrice(monto) ?? 0), 0)
    changeField('monto', total ? formatAmountTable(total) : '')
  }
  function save(evento: React.FormEvent) {
    evento.preventDefault()
    if (enviando.current || subiendo || cargando) return
    enviando.current = true
    setMessage('')
    setErrors({})
    startTransition(async () => {
      try {
        const result = await saveDocument({
          id: document?.id,
          clientId,
          budgets: seleccionados,
          datos: values,
          archivos: nuevos,
          quitar,
          remitos: values.tipo === 'factura' ? remitos : [],
          aplicaciones:
            values.tipo === 'orden_pago'
              ? Object.entries(aplicaciones).map(([factura_id, monto_aplicado]) => ({ factura_id, monto_aplicado }))
              : [],
          cotizacion: quote,
        })
        if (!result.ok) {
          setMessage(result.message)
          setErrors(result.errors ?? {})
          return
        }
        router.push(`/presupuestos/${result.datos.presupuesto}`)
        router.refresh()
      } catch {
        setMessage('No se pudo guardar. Tus datos y archivos siguen acá para reintentar.')
      } finally {
        enviando.current = false
      }
    })
  }
  function field(nombre: keyof Values, label: string, tipoInput = 'text', required = false) {
    return (
      <Field id={nombre} label={label} error={errors[`datos.${nombre}`]}>
        <Input
          id={nombre}
          value={values[nombre]}
          onChange={(evento) => changeField(nombre, evento.target.value)}
          type={tipoInput}
          required={required}
          maxLength={nombre === 'numero' || nombre === 'numero_oc_ref' ? 50 : undefined}
          inputMode={nombre === 'monto' ? 'decimal' : undefined}
          aria-invalid={Boolean(errors[`datos.${nombre}`])}
        />
      </Field>
    )
  }
  const duplicado =
    values.numero &&
    contexto.documentos.some(
      (item) =>
        item.id !== document?.id &&
        !item.deleted_at &&
        item.tipo === values.tipo &&
        normalizeNumber(item.numero) === normalizeNumber(values.numero),
    )
  const budgetsClient = contexto.budgets.filter(
    (item) => item.presupuesto_estado !== 'anulado' || seleccionados.includes(item.id),
  )
  const invoicesActivas = new Set(contexto.facturas.map((item) => item.id))
  const deliveryNotesDisponibles = contexto.documentos.filter(
    (item) =>
      item.tipo === 'remito' &&
      (remitos.includes(item.id) || (!item.deleted_at &&
      (!item.factura_id || item.factura_id === document?.id || !invoicesActivas.has(item.factura_id)))),
  )
  const invoicesAnuladas = contexto.documentos.filter((item) => item.tipo === 'factura' && item.deleted_at && aplicaciones[item.id] !== undefined)
  const normalizeSearch = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('es-AR')
  const optionsVisible = options.filter((item) => item.presupuesto_estado !== 'anulado')
    .filter((item) => item.id === seleccionados[0] || normalizeSearch(`${item.numero} ${item.cliente_razon_social} ${item.asunto}`).includes(normalizeSearch(searchBudget)))
    .toSorted((a, b) => Number(b.presupuesto_estado === 'en_curso') - Number(a.presupuesto_estado === 'en_curso') || b.numero - a.numero)
  const back = budgetId ? `/presupuestos/${budgetId}` : '/presupuestos'

  return (
    <form onSubmit={save} id="nuevo-documento" className="mx-auto flex w-full max-w-6xl flex-col gap-6 pb-28">
      {message ? (
        <Alert variant="destructive">
          <AlertDescription>{message}</AlertDescription>
        </Alert>
      ) : null}
      {quote ? (
        <Alert>
          <AlertDescription>
            Al guardar la orden de compra también se aprueba la cotización y se conserva su PDF.
          </AlertDescription>
        </Alert>
      ) : null}
      <fieldset disabled={pending || cargando} className="min-w-0">
        <legend className="sr-only">Contenido del documento</legend>
        <SheetForm>
          <Card titulo="Presupuesto y tipo" descripcion="Seleccioná el presupuesto y el tipo de documento que vas a registrar.">
            <div className="flex flex-col gap-4">
              {!document && !quote ? (
                <div className="flex flex-col gap-3">
                <Field id="buscar-presupuesto" label="Buscar presupuesto"><Input id="buscar-presupuesto" placeholder="Número, cliente o trabajo" value={searchBudget} onChange={(evento) => setSearchBudget(evento.target.value)} /></Field>
                <Field id="presupuesto" label="Presupuesto" error={errors.budgets}>
                  <NativeSelect
                    id="presupuesto"
                    className="w-full"
                    value={seleccionados[0] ?? ''}
                    onChange={(evento) => void chooseBudget(evento.target.value)}
                    required
                  >
                    <NativeSelectOption value="">Elegí un presupuesto</NativeSelectOption>
                    {optionsVisible.map((item) => (
                        <NativeSelectOption key={item.id} value={item.id}>
                          {item.numero} · {item.cliente_razon_social} · {item.asunto}{item.presupuesto_estado === 'finalizado' ? ' · Finalizado' : ''}
                        </NativeSelectOption>
                      ))}
                  </NativeSelect>
                </Field>
                {optionsVisible.length === 0 ? <p className="text-sm text-muted-foreground">No hay presupuestos con esa búsqueda.</p> : null}
                </div>
              ) : null}
              <Field id="tipo-documento" label="Tipo de documento" error={errors['datos.tipo']}>
                <ToggleGroup
                  id="tipo-documento"
                  type="single"
                  value={values.tipo}
                  onValueChange={(value) => {
                    if (value) changeField('tipo', value)
                  }}
                  variant="outline"
                  className="grid w-full grid-cols-2 gap-2 sm:grid-cols-4"
                  disabled={Boolean(quote)}
                  aria-label="Tipo de documento"
                >
                  {Object.entries(TIPOS_DOCUMENT).map(([value, label]) => (
                    <ToggleGroupItem key={value} value={value} className="h-17 flex-col gap-1 text-xs">
                      <FileText aria-hidden />
                      {label}
                    </ToggleGroupItem>
                  ))}
                </ToggleGroup>
              </Field>
            </div>
          </Card>
          <Card titulo="Adjuntar archivos">
            <div className="flex flex-col gap-3">
              {filesExisting.length ? (
                <ul className="flex flex-col gap-2">
                  {filesExisting.map((archivo) => (
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
                        onClick={() => setQuitar((list) => changeList(list, archivo.id, !list.includes(archivo.id)))}
                      >
                        {quitar.includes(archivo.id) ? 'Conservar' : 'Quitar'}
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : null}
              <UploadFiles key={clientId} clientId={clientId} disabled={pending} onChange={onChangeFiles} />
              {errors.archivos ? <p className="text-sm text-destructive">{errors.archivos}</p> : null}
            </div>
          </Card>
          <Card titulo="Datos del documento">
            <div className="grid gap-4 sm:grid-cols-2">
              {field('numero', 'Número (opcional)')}
              {field('fecha', 'Fecha (opcional)', 'date')}
              {duplicado ? (
                <Alert className="sm:col-span-2">
                  <AlertDescription>
                    Ya hay un documento del mismo tipo con este número. Revisalo antes de guardar.
                  </AlertDescription>
                </Alert>
              ) : null}
              {field(
                'monto',
                values.tipo === 'factura'
                  ? 'Monto total con IVA'
                  : values.tipo === 'orden_pago'
                    ? 'Monto de la orden de pago'
                    : 'Monto (opcional)',
                'text',
                values.tipo === 'factura' || values.tipo === 'orden_pago',
              )}
              {values.tipo === 'factura' ? (
                <>
                  <Field id="tipo_comprobante" label="Comprobante" error={errors['datos.tipo_comprobante']}>
                    <NativeSelect
                      id="tipo_comprobante"
                      value={values.tipo_comprobante}
                      onChange={(evento) => changeField('tipo_comprobante', evento.target.value)}
                      className="w-full"
                    >
                      {Object.entries(TIPOS_COMPROBANTE).map(([value, label]) => (
                        <NativeSelectOption value={value} key={value}>
                          {label}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  {field('fecha_vencimiento', 'Vencimiento (opcional)', 'date')}
                  {field('numero_oc_ref', 'OC de referencia (opcional)')}
                </>
              ) : null}
              {values.tipo === 'remito' ? (
                <>
                  <Field id="equipo_id" label="Equipo (opcional)">
                    <NativeSelect
                      id="equipo_id"
                      className="w-full"
                      value={values.equipo_id}
                      onChange={(evento) => changeField('equipo_id', evento.target.value)}
                    >
                      <NativeSelectOption value="">Sin equipo</NativeSelectOption>
                      {contexto.equipos.map((equipo) => (
                        <NativeSelectOption value={equipo.id} key={equipo.id}>
                          {equipo.nombre}
                        </NativeSelectOption>
                      ))}
                    </NativeSelect>
                  </Field>
                  {field('periodo_desde', 'Período desde (opcional)', 'date')}
                  {field('periodo_hasta', 'Período hasta (opcional)', 'date')}
                </>
              ) : null}
              <Field id="notas" label="Notas (opcional)" error={errors['datos.notas']} className="sm:col-span-2">
                <Textarea
                  id="notas"
                  value={values.notas}
                  onChange={(evento) => changeField('notas', evento.target.value)}
                  rows={3}
                  maxLength={2000}
                />
              </Field>
            </div>
          </Card>
          {!quote && budgetsClient.length ? (
            <Card
              titulo="Presupuestos vinculados"
              descripcion="Podés compartir este documento entre presupuestos del mismo cliente."
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Presupuestos vinculados</legend>
                {budgetsClient.map((item) => (
                  <label key={item.id} className="flex items-start gap-2 rounded-md px-1 py-1.5 text-sm">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-primary"
                      checked={seleccionados.includes(item.id)}
                      onChange={(evento) =>
                        setSeleccionados((list) => changeList(list, item.id, evento.target.checked))
                      }
                    />
                    <span>
                      N° {item.numero} · {item.asunto}
                    </span>
                  </label>
                ))}
              </fieldset>
            </Card>
          ) : null}
          {values.tipo === 'factura' ? (
            <Card
              titulo="Remitos que cubre"
              descripcion="Elegí los remitos del cliente incluidos en esta factura."
            >
              <fieldset className="flex flex-col gap-2">
                <legend className="sr-only">Remitos que cubre</legend>
                {deliveryNotesDisponibles.length ? (
                  deliveryNotesDisponibles.map((item) => (
                    <label key={item.id} className="flex items-start gap-2 py-1.5 text-sm">
                      <input
                        type="checkbox"
                        className="mt-0.5 size-4 accent-primary"
                        checked={remitos.includes(item.id)}
                        onChange={(evento) => setDeliveryNotes((list) => changeList(list, item.id, evento.target.checked))}
                      />
                      <span>Remito {item.numero || 'sin número'}{item.deleted_at ? <span className="block text-xs text-destructive">Anulado: desmarcalo para desvincularlo o <Link href={`/documentos/${item.id}`} className="underline">abrilo para restaurarlo</Link>.</span> : null}</span>
                    </label>
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground">No hay remitos pendientes de facturar.</p>
                )}
              </fieldset>
            </Card>
          ) : null}
          {values.tipo === 'orden_pago' ? (
            <Card
              titulo="Facturas que cancela"
              descripcion="El importe se completa con el saldo disponible; podés ajustarlo."
            >
              <fieldset className="flex flex-col gap-3">
                <legend className="sr-only">Facturas que cancela</legend>
                {invoicesAnuladas.map((item) => <Alert key={item.id} variant="destructive"><AlertDescription><p>La factura {item.numero || 'sin número'} está anulada. <Link href={`/documentos/${item.id}`} className="underline">Abrila para restaurarla</Link> o quitá esta aplicación antes de guardar.</p><Button type="button" variant="outline" size="sm" onClick={() => changeAplicacion(item.id, null)}>Desvincular factura {item.numero || 'sin número'}</Button></AlertDescription></Alert>)}
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
                              changeAplicacion(id, evento.target.checked ? formatAmountTable(disponible) : null)
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
                            onChange={(evento) => changeAplicacion(id, evento.target.value)}
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
            </Card>
          ) : null}
        </SheetForm>
      </fieldset>
      {Object.entries(errors)
        .filter(([field]) => !field.startsWith('datos.') && field !== 'archivos')
        .map(([field, error]) => (
          <p key={field} role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ))}
      <ActionsForm
        back={back}
        textButton={document ? 'Guardar cambios' : quote ? 'Aprobar y guardar OC' : 'Guardar documento'}
        pendiente={pending}
        disabled={subiendo || cargando || !clientId}
      >
        {subiendo || cargando ? (
          <span role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle aria-hidden className="size-4 animate-spin" />
            <span className="sr-only sm:not-sr-only">{subiendo ? 'Subiendo archivos…' : 'Cargando documentos…'}</span>
          </span>
        ) : null}
      </ActionsForm>
    </form>
  )
}

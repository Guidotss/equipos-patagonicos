'use client'
// src/components/cotizaciones/editor/tarjeta-cliente.tsx

import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { contactsOfClient } from '@/app/(app)/cotizaciones/actions'
import { basarInLast } from '@/app/(app)/cotizaciones/specials-actions'
import { ConfirmationInLugar } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/form/card'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CatalogsEditor, StatusEditor } from '@/lib/quotes/editor/types'
import { ID_FIELD, contactInitial, type ContactEditor, type Despachar } from '@/lib/quotes/editor-screen'
import { SelectorClient, type ClientBuscado } from './selector-client'

export function CardClient({
  estado,
  contactos,
  errors,
  despachar,
  onChangeContacts,
  onChangeCatalogs,
}: {
  estado: StatusEditor
  contactos: ContactEditor[]
  errors: Record<string, string>
  despachar: Despachar
  onChangeContacts: (contactos: ContactEditor[]) => void
  onChangeCatalogs: (catalogs: CatalogsEditor) => void
}) {
  const [cargando, setCargando] = useState(false)
  const lastPedido = useRef(0)
  const [confirmBase, setConfirmBase] = useState(false)
  async function basar() {
    if (!estado.cliente || cargando) return
    const clientId = estado.cliente.id
    const pedido = ++lastPedido.current
    setCargando(true)
    try {
      const r = await basarInLast(clientId)
      if (pedido !== lastPedido.current) return
      if (r.ok) { onChangeCatalogs(r.datos.catalogs); despachar({ tipo: 'reemplazar', estado: r.datos.estado }); setConfirmBase(false); toast.success('Se copió la última cotización sin crear una renegociación') }
      else toast.error(r.message)
    } catch { toast.error('No se pudo leer la última cotización') }
    finally { if (pedido === lastPedido.current) setCargando(false) }
  }

  async function choose(cliente: ClientBuscado) {
    if (!cliente.activo) {
      toast.warning(`${cliente.razon_social} está inactivo. Podés cotizarle igual; reactivalo desde Clientes.`)
    }
    if (cliente.id === estado.cliente?.id) return
    const pedido = ++lastPedido.current
    onChangeContacts([])
    despachar({
      tipo: 'cliente',
      cliente: { id: cliente.id, razon_social: cliente.razon_social, cuit: cliente.cuit },
      contactoId: '',
    })
    setCargando(true)
    let list: ContactEditor[] = []
    let contactId = ''
    try {
      const result = await contactsOfClient(cliente.id)
      if (result.ok) {
        list = result.datos.contactos
        contactId = contactInitial(list, result.datos.lastContactId)
      } else {
        toast.error(result.message)
      }
    } catch (error) {
      unstable_rethrow(error)
      toast.error('No se pudieron leer los contactos del cliente.')
    }
    if (pedido !== lastPedido.current) return
    setCargando(false)
    onChangeContacts(list)
    if (contactId) despachar({ tipo: 'campo', campo: 'contactoId', value: contactId })
  }

  const errorClient = errors.cliente
  const errorContact = errors.contactoId
  // Sin contactos lo dice la misma opción: no suma una línea debajo (densidad de la referencia 03). Corto, para que
  // entre entero a 1200 px junto al prefijo "Atte." (que ya está a la vista: no se repite).
  const textWithoutAtte = contactos.length === 0 ? 'Sin contactos' : 'Sin Atte.'
  // A 1200 px el select no muestra entero un texto largo: el title lo deja leer sin abrirlo.
  const textAtte =
    estado.cliente && !cargando
      ? (contactos.find((contacto) => contacto.id === estado.contactoId)?.nombre ?? textWithoutAtte)
      : undefined

  return (
    <Card compacta titulo="Cliente">
      {estado.id === null && estado.cliente ? <div className="mb-2"><Button type="button" variant="ghost" size="sm" onClick={() => setConfirmBase(true)} disabled={cargando}>Basar en la última cotización</Button></div> : null}
      {confirmBase ? <ConfirmationInLugar pregunta="¿Usar la última cotización de este cliente?" detail="Se reemplazará lo escrito en esta nueva cotización." textConfirm="Usar última cotización" pendiente={cargando} onConfirm={() => void basar()} onCancelar={() => setConfirmBase(false)} /> : null}
      {/* 5fr | 3fr: a 1200 px "VERTICE SERVICIOS INTEGRALES S.R.L." entra entera en el combobox. En una columna,
          grid-cols-1 (minmax(0,1fr)): una razón social más larga se corta con "…" en vez de desbordar la tarjeta. */}
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-1">
          <Label htmlFor={ID_FIELD.cliente} className="sr-only">
            Cliente
          </Label>
          <SelectorClient
            id={ID_FIELD.cliente}
            cliente={estado.cliente}
            error={errorClient}
            onChoose={(cliente) => void choose(cliente)}
          />
          {errorClient ? (
            <p id={`${ID_FIELD.cliente}-error`} className="text-sm text-destructive">
              {errorClient}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          {/* "Atte." como prefijo dentro del borde (referencia 03), sin repetirlo en cada opción. */}
          <div className="flex h-8 items-center rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[select:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive">
            <label htmlFor={ID_FIELD.contacto} className="shrink-0 pl-2.5 text-sm text-muted-foreground">
              Atte.
            </label>
            <NativeSelect
              id={ID_FIELD.contacto}
              value={estado.contactoId}
              disabled={!estado.cliente || cargando}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'contactoId', value: evento.target.value })}
              aria-invalid={Boolean(errorContact)}
              aria-describedby={errorContact ? `${ID_FIELD.contacto}-error` : undefined}
              title={textAtte}
              className="min-w-0 flex-1 has-[select:disabled]:opacity-100 [&_select]:border-0 [&_select]:pl-1.5 [&_select]:focus-visible:ring-0"
            >
              {!estado.cliente ? (
                <NativeSelectOption value="">Elegí primero el cliente</NativeSelectOption>
              ) : cargando ? (
                <NativeSelectOption value="">Cargando…</NativeSelectOption>
              ) : (
                <>
                  <NativeSelectOption value="">{textWithoutAtte}</NativeSelectOption>
                  {contactos.map((contacto) => (
                    <NativeSelectOption key={contacto.id} value={contacto.id}>
                      {contacto.nombre}
                    </NativeSelectOption>
                  ))}
                </>
              )}
            </NativeSelect>
          </div>
          {errorContact ? (
            <p id={`${ID_FIELD.contacto}-error`} className="text-sm text-destructive">
              {errorContact}
            </p>
          ) : null}
        </div>
      </div>
    </Card>
  )
}

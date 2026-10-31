'use client'
// src/components/cotizaciones/editor/tarjeta-cliente.tsx

import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { contactsOfClient } from '@/app/(app)/cotizaciones/actions'
import { baseOnLastQuote } from '@/app/(app)/cotizaciones/specials-actions'
import { InlineConfirmation } from '@/components/form/confirmation-inline'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/form/card'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CatalogsEditor, StatusEditor } from '@/lib/quotes/editor/types'
import { ID_FIELD, contactInitial, type ContactEditor, type EditorDispatch } from '@/lib/quotes/editor-screen'
import { SelectorClient, type ClientSearchResult } from './selector-client'

export function CardClient({
  state,
  contacts,
  errors,
  dispatch,
  onChangeContacts,
  onChangeCatalogs,
}: {
  state: StatusEditor
  contacts: ContactEditor[]
  errors: Record<string, string>
  dispatch: EditorDispatch
  onChangeContacts: (contacts: ContactEditor[]) => void
  onChangeCatalogs: (catalogs: CatalogsEditor) => void
}) {
  const [loading, setLoading] = useState(false)
  const latestRequest = useRef(0)
  const [confirmBase, setConfirmBase] = useState(false)
  async function applyBaseQuote() {
    if (!state.cliente || loading) return
    const clientId = state.cliente.id
    const request = ++latestRequest.current
    setLoading(true)
    try {
      const r = await baseOnLastQuote(clientId)
      if (request !== latestRequest.current) return
      if (r.ok) { onChangeCatalogs(r.datos.catalogs); dispatch({ tipo: 'reemplazar', estado: r.datos.estado }); setConfirmBase(false); toast.success('Se copió la última cotización sin crear una renegociación') }
      else toast.error(r.message)
    } catch { toast.error('No se pudo leer la última cotización') }
    finally { if (request === latestRequest.current) setLoading(false) }
  }

  async function choose(client: ClientSearchResult) {
    if (!client.activo) {
      toast.warning(`${client.razon_social} está inactivo. Podés cotizarle igual; reactivalo desde Clientes.`)
    }
    if (client.id === state.cliente?.id) return
    const request = ++latestRequest.current
    onChangeContacts([])
    dispatch({
      tipo: 'cliente',
      cliente: { id: client.id, razon_social: client.razon_social, cuit: client.cuit },
      contactoId: '',
    })
    setLoading(true)
    let list: ContactEditor[] = []
    let contactId = ''
    try {
      const result = await contactsOfClient(client.id)
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
    if (request !== latestRequest.current) return
    setLoading(false)
    onChangeContacts(list)
    if (contactId) dispatch({ tipo: 'campo', campo: 'contactoId', value: contactId })
  }

  const errorClient = errors.cliente
  const errorContact = errors.contactoId
  // Sin contactos lo dice la misma opción: no suma una línea debajo (densidad de la referencia 03). Corto, para que
  // entre entero a 1200 px junto al prefijo "Atte." (que ya está a la vista: no se repite).
  const textWithoutAtte = contacts.length === 0 ? 'Sin contactos' : 'Sin Atte.'
  // A 1200 px el select no muestra entero un texto largo: el title lo deja leer sin abrirlo.
  const textAtte =
    state.cliente && !loading
      ? (contacts.find((contact) => contact.id === state.contactoId)?.nombre ?? textWithoutAtte)
      : undefined

  return (
    <Card compacta titulo="Cliente">
      {state.id === null && state.cliente ? <div className="mb-2"><Button type="button" variant="ghost" size="sm" onClick={() => setConfirmBase(true)} disabled={loading}>Basar en la última cotización</Button></div> : null}
      {confirmBase ? <InlineConfirmation pregunta="¿Usar la última cotización de este cliente?" detail="Se reemplazará lo escrito en esta nueva cotización." textConfirm="Usar última cotización" pendiente={loading} onConfirm={() => void applyBaseQuote()} onCancelar={() => setConfirmBase(false)} /> : null}
      {/* 5fr | 3fr: a 1200 px "VERTICE SERVICIOS INTEGRALES S.R.L." entra entera en el combobox. En una columna,
          grid-cols-1 (minmax(0,1fr)): una razón social más larga se corta con "…" en vez de desbordar la tarjeta. */}
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-1">
          <Label htmlFor={ID_FIELD.cliente} className="sr-only">
            Cliente
          </Label>
          <SelectorClient
            id={ID_FIELD.cliente}
            cliente={state.cliente}
            error={errorClient}
            onChoose={(client) => void choose(client)}
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
              value={state.contactoId}
              disabled={!state.cliente || loading}
              onChange={(event) => dispatch({ tipo: 'campo', campo: 'contactoId', value: event.target.value })}
              aria-invalid={Boolean(errorContact)}
              aria-describedby={errorContact ? `${ID_FIELD.contacto}-error` : undefined}
              title={textAtte}
              className="min-w-0 flex-1 has-[select:disabled]:opacity-100 [&_select]:border-0 [&_select]:pl-1.5 [&_select]:focus-visible:ring-0"
            >
              {!state.cliente ? (
                <NativeSelectOption value="">Elegí primero el cliente</NativeSelectOption>
              ) : loading ? (
                <NativeSelectOption value="">Cargando…</NativeSelectOption>
              ) : (
                <>
                  <NativeSelectOption value="">{textWithoutAtte}</NativeSelectOption>
                  {contacts.map((contact) => (
                    <NativeSelectOption key={contact.id} value={contact.id}>
                      {contact.nombre}
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

'use client'
// src/components/cotizaciones/editor/tarjeta-cliente.tsx

import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { contactosDeCliente } from '@/app/(app)/cotizaciones/actions'
import { basarEnUltima } from '@/app/(app)/cotizaciones/especiales-actions'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { CatalogosEditor, EstadoEditor } from '@/lib/cotizaciones/editor'
import { ID_CAMPO, contactoInicial, type ContactoEditor, type Despachar } from '@/lib/cotizaciones/editor-pantalla'
import { SelectorCliente, type ClienteBuscado } from './selector-cliente'

export function TarjetaCliente({
  estado,
  contactos,
  errores,
  despachar,
  alCambiarContactos,
  alCambiarCatalogos,
}: {
  estado: EstadoEditor
  contactos: ContactoEditor[]
  errores: Record<string, string>
  despachar: Despachar
  alCambiarContactos: (contactos: ContactoEditor[]) => void
  alCambiarCatalogos: (catalogos: CatalogosEditor) => void
}) {
  const [cargando, setCargando] = useState(false)
  const ultimoPedido = useRef(0)
  const [confirmarBase, setConfirmarBase] = useState(false)
  async function basar() {
    if (!estado.cliente || cargando) return
    const clienteId = estado.cliente.id
    const pedido = ++ultimoPedido.current
    setCargando(true)
    try {
      const r = await basarEnUltima(clienteId)
      if (pedido !== ultimoPedido.current) return
      if (r.ok) { alCambiarCatalogos(r.datos.catalogos); despachar({ tipo: 'reemplazar', estado: r.datos.estado }); setConfirmarBase(false); toast.success('Se copió la última cotización sin crear una renegociación') }
      else toast.error(r.mensaje)
    } catch { toast.error('No se pudo leer la última cotización') }
    finally { if (pedido === ultimoPedido.current) setCargando(false) }
  }

  async function elegir(cliente: ClienteBuscado) {
    if (!cliente.activo) {
      toast.warning(`${cliente.razon_social} está inactivo. Podés cotizarle igual; reactivalo desde Clientes.`)
    }
    if (cliente.id === estado.cliente?.id) return
    const pedido = ++ultimoPedido.current
    alCambiarContactos([])
    despachar({
      tipo: 'cliente',
      cliente: { id: cliente.id, razon_social: cliente.razon_social, cuit: cliente.cuit },
      contactoId: '',
    })
    setCargando(true)
    let lista: ContactoEditor[] = []
    let contactoId = ''
    try {
      const resultado = await contactosDeCliente(cliente.id)
      if (resultado.ok) {
        lista = resultado.datos.contactos
        contactoId = contactoInicial(lista, resultado.datos.ultimoContactoId)
      } else {
        toast.error(resultado.mensaje)
      }
    } catch (error) {
      unstable_rethrow(error)
      toast.error('No se pudieron leer los contactos del cliente.')
    }
    if (pedido !== ultimoPedido.current) return
    setCargando(false)
    alCambiarContactos(lista)
    if (contactoId) despachar({ tipo: 'campo', campo: 'contactoId', valor: contactoId })
  }

  const errorCliente = errores.cliente
  const errorContacto = errores.contactoId
  // Sin contactos lo dice la misma opción: no suma una línea debajo (densidad de la referencia 03). Corto, para que
  // entre entero a 1200 px junto al prefijo "Atte." (que ya está a la vista: no se repite).
  const textoSinAtte = contactos.length === 0 ? 'Sin contactos' : 'Sin Atte.'
  // A 1200 px el select no muestra entero un texto largo: el title lo deja leer sin abrirlo.
  const textoAtte =
    estado.cliente && !cargando
      ? (contactos.find((contacto) => contacto.id === estado.contactoId)?.nombre ?? textoSinAtte)
      : undefined

  return (
    <Tarjeta compacta titulo="Cliente">
      {estado.id === null && estado.cliente ? <div className="mb-2"><Button type="button" variant="ghost" size="sm" onClick={() => setConfirmarBase(true)} disabled={cargando}>Basar en la última cotización</Button></div> : null}
      {confirmarBase ? <ConfirmacionEnLugar pregunta="¿Usar la última cotización de este cliente?" detalle="Se reemplazará lo escrito en esta nueva cotización." textoConfirmar="Usar última cotización" pendiente={cargando} alConfirmar={() => void basar()} alCancelar={() => setConfirmarBase(false)} /> : null}
      {/* 5fr | 3fr: a 1200 px "VERTICE SERVICIOS INTEGRALES S.R.L." entra entera en el combobox. En una columna,
          grid-cols-1 (minmax(0,1fr)): una razón social más larga se corta con "…" en vez de desbordar la tarjeta. */}
      <div className="grid grid-cols-1 gap-2.5 @md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)]">
        <div className="space-y-1">
          <Label htmlFor={ID_CAMPO.cliente} className="sr-only">
            Cliente
          </Label>
          <SelectorCliente
            id={ID_CAMPO.cliente}
            cliente={estado.cliente}
            error={errorCliente}
            alElegir={(cliente) => void elegir(cliente)}
          />
          {errorCliente ? (
            <p id={`${ID_CAMPO.cliente}-error`} className="text-sm text-destructive">
              {errorCliente}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          {/* "Atte." como prefijo dentro del borde (referencia 03), sin repetirlo en cada opción. */}
          <div className="flex h-8 items-center rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[select:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive">
            <label htmlFor={ID_CAMPO.contacto} className="shrink-0 pl-2.5 text-sm text-muted-foreground">
              Atte.
            </label>
            <NativeSelect
              id={ID_CAMPO.contacto}
              value={estado.contactoId}
              disabled={!estado.cliente || cargando}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'contactoId', valor: evento.target.value })}
              aria-invalid={Boolean(errorContacto)}
              aria-describedby={errorContacto ? `${ID_CAMPO.contacto}-error` : undefined}
              title={textoAtte}
              className="min-w-0 flex-1 has-[select:disabled]:opacity-100 [&_select]:border-0 [&_select]:pl-1.5 [&_select]:focus-visible:ring-0"
            >
              {!estado.cliente ? (
                <NativeSelectOption value="">Elegí primero el cliente</NativeSelectOption>
              ) : cargando ? (
                <NativeSelectOption value="">Cargando…</NativeSelectOption>
              ) : (
                <>
                  <NativeSelectOption value="">{textoSinAtte}</NativeSelectOption>
                  {contactos.map((contacto) => (
                    <NativeSelectOption key={contacto.id} value={contacto.id}>
                      {contacto.nombre}
                    </NativeSelectOption>
                  ))}
                </>
              )}
            </NativeSelect>
          </div>
          {errorContacto ? (
            <p id={`${ID_CAMPO.contacto}-error`} className="text-sm text-destructive">
              {errorContacto}
            </p>
          ) : null}
        </div>
      </div>
    </Tarjeta>
  )
}

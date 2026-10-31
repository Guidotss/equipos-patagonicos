'use client'

import { Pencil, Plus, Printer, UserRound } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Content } from '@/components/app-shell/header'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { FormAction } from '@/components/form/form-action'
import { MessageForm } from '@/components/form/message-form'
import { FieldsGrid, BandView, Highlight, Card, useViewInLive, type DefinitionField } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { Pill } from '@/components/ui/pill'
import type { FieldSigner } from '@/lib/catalogs/schemas'
import { iniciales } from '@/lib/format/text'
import type { ActionForm } from '@/lib/forms'
import { cn } from '@/lib/utils'

const LISTA = '/configuracion/firmantes'

export type Signer = {
  id: string
  nombre: string
  cargo: string
  telefono: string
  email: string
  activo: boolean
}

export type SignerWithActions = Signer & { button: React.ReactNode }

// En el orden en que los imprime Firma (src/lib/pdf/comunes.tsx); el email va último porque no se imprime.
const CAMPOS: (DefinitionField & { campo: FieldSigner })[] = [
  { campo: 'nombre', label: 'Nombre', ancho: true },
  { campo: 'cargo', label: 'Cargo' },
  { campo: 'telefono', label: 'Teléfono', props: { type: 'tel' } },
  { campo: 'email', label: 'Email', ancho: true, props: { type: 'email' } },
]

const FIELDS_VIEW = ['nombre', 'cargo', 'telefono'] as const

/** La firma como la arma el PDF: una línea por dato y sin las vacías, salvo el nombre. */
function BandSignature({ view }: { view: Record<(typeof FIELDS_VIEW)[number], string> }) {
  return (
    <BandView icon={Printer} titulo="Así firma la cotización">
      <div className="[overflow-wrap:anywhere]">
        <p>
          <Highlight>{view.nombre || '—'}</Highlight>
        </p>
        {view.cargo ? (
          <p>
            <Highlight>{view.cargo}</Highlight>
          </p>
        ) : null}
        {view.telefono ? (
          <p>
            <Highlight>{view.telefono}</Highlight>
          </p>
        ) : null}
      </div>
    </BandView>
  )
}

/** Alta y edición de un firmante en pantalla propia. Sin `inicial` es un alta. */
export function SignerForm({
  accion,
  initial,
  buttonStatus,
}: {
  accion: ActionForm
  initial?: Signer
  /** Activar/Desactivar, ligado al registro en el servidor (solo edición). */
  buttonStatus?: React.ReactNode
}) {
  const router = useRouter()
  const values = initial ? { nombre: initial.nombre, cargo: initial.cargo, telefono: initial.telefono, email: initial.email } : {}
  const { view, onEscribir, sincronizar } = useViewInLive(FIELDS_VIEW, values)
  const textSave = initial ? 'Guardar cambios' : 'Guardar firmante'
  const dataKey = initial ? [initial.cargo, initial.telefono, initial.email].filter(Boolean).join(' · ') : ''
  const pill = !initial ? null : initial.activo ? <Pill tone="exito">Activo</Pill> : <Pill>Inactivo</Pill>

  return (
    <FormAction
      accion={accion}
      textButton={textSave}
      button={false}
      onSave={() => router.push(LISTA)}
      header={() => (
        <Content className="max-w-6xl pb-0">
          <HeaderForm
            titulo={initial?.nombre || 'Nuevo firmante'}
            estado={pill}
            descripcion={dataKey || 'Datos de la persona que firma las cotizaciones.'}
            actions={buttonStatus}
          />
        </Content>
      )}
    >
      {(estado, pending) => (
        <Content className="max-w-6xl pt-6 pb-28">
          <MessageForm estado={estado} />
          <SheetForm ref={sincronizar} onInput={onEscribir}>
            <Card
              icon={UserRound}
              titulo="Datos del firmante"
              descripcion="El nombre, el cargo y el teléfono cierran cada cotización; el email no se imprime."
              band={<BandSignature view={view} />}
            >
              <FieldsGrid estado={estado} initial={values} fields={CAMPOS} prefix="firmante" />
            </Card>
          </SheetForm>
          <ActionsForm back={LISTA} textButton={textSave} pendiente={pending} />
        </Content>
      )}
    </FormAction>
  )
}

export function NewSigner() {
  return (
    <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
      <Link href={`${LISTA}/nuevo`}>
        <Plus aria-hidden />
        Nuevo firmante
      </Link>
    </Button>
  )
}

export function Signers({ firmantes }: { firmantes: SignerWithActions[] }) {
  if (firmantes.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
        Todavía no hay firmantes. Agregá el primero con &quot;Nuevo firmante&quot;.
      </p>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      {firmantes.map((firmante) => (
        <li key={firmante.id} className="flex items-center gap-4 p-4 sm:p-5">
          <span
            aria-hidden
            className={cn(
              'grid size-10 shrink-0 place-items-center self-start rounded-full text-sm font-semibold sm:size-12 sm:self-center sm:text-[15px]',
              firmante.activo ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            {iniciales(firmante.nombre)}
          </span>
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-4 gap-y-3">
            <div className="min-w-0 flex-1 basis-64">
              <p className={cn('text-lg font-medium', firmante.activo ? null : 'text-muted-foreground')}>{firmante.nombre}</p>
              <p
                className={cn(
                  'flex flex-wrap gap-x-3 text-[15px]',
                  firmante.activo ? 'text-foreground/80' : 'text-muted-foreground',
                )}
              >
                {firmante.cargo ? <span>{firmante.cargo}</span> : null}
                {firmante.telefono ? <span className="tabular-nums">{firmante.telefono}</span> : null}
                {firmante.email ? <span className="min-w-0 [overflow-wrap:anywhere]">{firmante.email}</span> : null}
              </p>
            </div>
            <div className="ml-auto flex items-center gap-2">
              {firmante.activo ? <Pill tone="exito">Activo</Pill> : <Pill>Inactivo</Pill>}
              <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                <Link href={`${LISTA}/${firmante.id}`} aria-label={`Editar a ${firmante.nombre}`}>
                  <Pencil />
                </Link>
              </Button>
              {firmante.button}
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}

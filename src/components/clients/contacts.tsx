import { Pencil, Plus } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { iniciales } from '@/lib/format/texto'

export type ContactoFicha = {
  id: string
  nombre: string
  cargo: string
  email: string
  telefono: string
}

/** Contactos de la ficha de cliente; el alta y la edición tienen pantalla propia. */
export function Contactos({ clienteId, contactos }: { clienteId: string; contactos: ContactoFicha[] }) {
  const base = `/clientes/${clienteId}/contactos`
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Contactos</h2>
        <Button asChild variant="outline">
          <Link href={`${base}/nuevo`}>
            <Plus aria-hidden />
            Agregar contacto
          </Link>
        </Button>
      </div>

      {contactos.length === 0 ? (
        <p className="rounded-xl border border-dashed px-4 py-8 text-center text-sm text-muted-foreground">
          Sin contactos. El contacto es el &quot;Atte.&quot; de la cotización.
        </p>
      ) : (
        <ul className="space-y-4">
          {contactos.map((contacto) => (
            <li key={contacto.id} className="rounded-xl border bg-card p-4 shadow-tarjeta">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="grid size-11 shrink-0 place-items-center rounded-full bg-slate-100 text-[15px] font-medium text-slate-600"
                >
                  {iniciales(contacto.nombre)}
                </span>
                <div className="min-w-0 flex-1 pt-0.5">
                  <p className="font-semibold break-words">{contacto.nombre}</p>
                  {contacto.cargo ? <p className="text-sm text-muted-foreground">{contacto.cargo}</p> : null}
                </div>
                <Button asChild variant="ghost" size="icon" className="-mt-1 -mr-1 text-muted-foreground">
                  <Link href={`${base}/${contacto.id}`} aria-label={`Editar a ${contacto.nombre}`}>
                    <Pencil />
                  </Link>
                </Button>
              </div>
              {contacto.email || contacto.telefono ? (
                <div className="mt-3 space-y-1 text-[15px]">
                  {contacto.email ? (
                    <a className="block [overflow-wrap:anywhere] hover:text-primary hover:underline" href={`mailto:${contacto.email}`}>
                      {contacto.email}
                    </a>
                  ) : null}
                  {contacto.telefono ? (
                    <a className="block tabular-nums hover:text-primary hover:underline" href={`tel:${contacto.telefono}`}>
                      {contacto.telefono}
                    </a>
                  ) : null}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

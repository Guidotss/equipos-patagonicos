'use client'

import { Pencil, Plus, Trash2 } from 'lucide-react'
import { Campo } from '@/components/formulario/campo'
import { DialogoFormulario } from '@/components/formulario/dialogo-formulario'
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { CampoContacto } from '@/lib/clientes/esquemas'
import { iniciales } from '@/lib/format/texto'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'

export type ContactoConAcciones = {
  id: string
  nombre: string
  cargo: string
  email: string
  telefono: string
  actualizar: AccionFormulario
  borrar: () => Promise<void>
}

function CamposContacto({ estado, inicial }: { estado: EstadoFormulario; inicial?: Partial<Record<CampoContacto, string>> }) {
  const campo = (nombre: CampoContacto, etiqueta: string, props: React.ComponentProps<typeof Input> = {}) => (
    <Campo id={`contacto-${nombre}`} etiqueta={etiqueta} error={estado.errores[nombre]}>
      <Input
        id={`contacto-${nombre}`}
        name={nombre}
        defaultValue={valorCampo(estado, inicial, nombre)}
        aria-invalid={Boolean(estado.errores[nombre])}
        {...props}
      />
    </Campo>
  )
  return (
    <div className="space-y-4">
      {campo('nombre', 'Nombre')}
      {campo('cargo', 'Cargo')}
      {campo('email', 'Email', { type: 'email' })}
      {campo('telefono', 'Teléfono', { type: 'tel' })}
    </div>
  )
}

function BorrarContacto({ nombre, accion }: { nombre: string; accion: () => Promise<void> }) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground hover:text-destructive"
          aria-label={`Borrar a ${nombre}`}
        >
          <Trash2 />
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Borrar a {nombre}?</AlertDialogTitle>
          <AlertDialogDescription>Se quita el contacto de este cliente. No se puede deshacer.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancelar</AlertDialogCancel>
          {/* Botón común (no AlertDialogAction): si el diálogo se cerrara al hacer clic, el form se desmontaría antes de enviarse. */}
          <form action={accion}>
            <Button type="submit" variant="destructive">
              Borrar
            </Button>
          </form>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

export function Contactos({ contactos, crear }: { contactos: ContactoConAcciones[]; crear: AccionFormulario }) {
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-lg font-semibold tracking-tight">Contactos</h2>
        <DialogoFormulario
          titulo="Nuevo contacto"
          accion={crear}
          textoBoton="Guardar contacto"
          disparador={
            <Button variant="outline">
              <Plus aria-hidden />
              Agregar contacto
            </Button>
          }
        >
          {(estado) => <CamposContacto estado={estado} />}
        </DialogoFormulario>
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
                <div className="-mt-1 -mr-1 flex items-center">
                  <DialogoFormulario
                    titulo={`Editar a ${contacto.nombre}`}
                    accion={contacto.actualizar}
                    textoBoton="Guardar contacto"
                    disparador={
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground"
                        aria-label={`Editar a ${contacto.nombre}`}
                      >
                        <Pencil />
                      </Button>
                    }
                  >
                    {(estado) => <CamposContacto estado={estado} inicial={contacto} />}
                  </DialogoFormulario>
                  <BorrarContacto nombre={contacto.nombre} accion={contacto.borrar} />
                </div>
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

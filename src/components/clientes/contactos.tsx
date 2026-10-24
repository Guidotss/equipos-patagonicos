'use client'

import { Mail, Pencil, Phone, Plus, Trash2 } from 'lucide-react'
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
        <Button variant="ghost" size="icon" aria-label={`Borrar a ${nombre}`}>
          <Trash2 className="size-4" />
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
        <h2 className="text-lg font-semibold">Contactos</h2>
        <DialogoFormulario
          titulo="Nuevo contacto"
          accion={crear}
          textoBoton="Guardar contacto"
          disparador={
            <Button variant="outline" size="sm">
              <Plus className="size-4" aria-hidden />
              Agregar contacto
            </Button>
          }
        >
          {(estado) => <CamposContacto estado={estado} />}
        </DialogoFormulario>
      </div>

      {contactos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin contactos. El contacto es el &quot;Atte.&quot; de la cotización.</p>
      ) : (
        <ul className="divide-y rounded-md border">
          {contactos.map((contacto) => (
            <li key={contacto.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
              <div className="min-w-0">
                <p className="font-medium">{contacto.nombre}</p>
                <p className="flex flex-wrap gap-x-4 text-sm text-muted-foreground">
                  {contacto.cargo ? <span>{contacto.cargo}</span> : null}
                  {contacto.email ? (
                    <a className="inline-flex items-center gap-1 hover:underline" href={`mailto:${contacto.email}`}>
                      <Mail className="size-3" aria-hidden />
                      {contacto.email}
                    </a>
                  ) : null}
                  {contacto.telefono ? (
                    <a className="inline-flex items-center gap-1 hover:underline" href={`tel:${contacto.telefono}`}>
                      <Phone className="size-3" aria-hidden />
                      {contacto.telefono}
                    </a>
                  ) : null}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <DialogoFormulario
                  titulo={`Editar a ${contacto.nombre}`}
                  accion={contacto.actualizar}
                  textoBoton="Guardar contacto"
                  disparador={
                    <Button variant="ghost" size="icon" aria-label={`Editar a ${contacto.nombre}`}>
                      <Pencil className="size-4" />
                    </Button>
                  }
                >
                  {(estado) => <CamposContacto estado={estado} inicial={contacto} />}
                </DialogoFormulario>
                <BorrarContacto nombre={contacto.nombre} accion={contacto.borrar} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

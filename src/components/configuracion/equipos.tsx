'use client'

import { PanelsLeftBottom, Pencil, Plus, Printer, StickyNote } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Contenido } from '@/components/app-shell/encabezado'
import { Campo } from '@/components/formulario/campo'
import { AccionesFormulario, EncabezadoFormulario, HojaFormulario } from '@/components/formulario/estructura-formulario'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { FranjaVista, FrasesResueltas, Tarjeta, useVistaEnVivo } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { Textarea } from '@/components/ui/textarea'
import type { CampoEquipo } from '@/lib/catalogos/esquemas'
import { valorCampo, type AccionFormulario, type EstadoFormulario } from '@/lib/formularios'
import { cn } from '@/lib/utils'
import { IconoGrua } from './icono-grua'

/** Un equipo con la capacidad ya como texto ("60,5"). */
export type Equipo = {
  id: string
  nombre: string
  capacidad_tn: string
  marca: string
  modelo: string
  identificacion: string
  descripcion: string
  activo: boolean
}

const LISTA = '/configuracion/equipos'

type DefinicionCampo = { campo: CampoEquipo; etiqueta: string; ancho?: boolean; props?: React.ComponentProps<typeof Input> }

const CAMPOS_DATOS: DefinicionCampo[] = [
  { campo: 'nombre', etiqueta: 'Nombre', ancho: true },
  { campo: 'capacidad_tn', etiqueta: 'Capacidad (TN)', props: { inputMode: 'decimal' } },
  { campo: 'identificacion', etiqueta: 'N° interno o dominio' },
  { campo: 'marca', etiqueta: 'Marca' },
  { campo: 'modelo', etiqueta: 'Modelo' },
]

const CAMPOS_VISTA = ['capacidad_tn', 'descripcion'] as const

type Inicial = Partial<Record<CampoEquipo, string>>

function Dato({ activo, className, children }: { activo: boolean; className?: string; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-slate-200/70 px-2 text-sm',
        activo ? 'text-foreground' : 'text-muted-foreground',
        className,
      )}
    >
      {children}
    </span>
  )
}

function PastillaEstado({ activo }: { activo: boolean }) {
  return activo ? <Pastilla tono="exito">Activo</Pastilla> : <Pastilla>Inactivo</Pastilla>
}

/** Capacidad y marca · modelo, como chips. */
function datosClave(equipo: Equipo): string[] {
  return [
    equipo.capacidad_tn ? `${equipo.capacidad_tn} TN` : '',
    [equipo.marca, equipo.modelo].filter(Boolean).join(' · '),
  ].filter(Boolean)
}

function CamposDatos({ estado, inicial }: { estado: EstadoFormulario; inicial: Inicial }) {
  return (
    <div className="grid gap-x-4 gap-y-3 @sm:grid-cols-2">
      {CAMPOS_DATOS.map(({ campo, etiqueta, ancho, props }) => (
        <Campo
          key={campo}
          id={`equipo-${campo}`}
          etiqueta={etiqueta}
          error={estado.errores[campo]}
          className={ancho ? '@sm:col-span-2' : undefined}
        >
          <Input
            id={`equipo-${campo}`}
            name={campo}
            defaultValue={valorCampo(estado, inicial, campo)}
            aria-invalid={Boolean(estado.errores[campo])}
            {...props}
          />
        </Campo>
      ))}
    </div>
  )
}

/** Alta (sin equipo) o edición de un equipo en pantalla propia. */
export function FormularioEquipo({
  accion,
  equipo,
  botonEstado,
  frases,
}: {
  accion: AccionFormulario
  equipo?: Equipo
  /** Activar/Desactivar, solo en edición. */
  botonEstado?: React.ReactNode
  /** Oraciones de las plantillas activas con {{capacidad}} o {{equipo_descripcion}}. */
  frases: string[]
}) {
  const router = useRouter()
  const inicial: Inicial = equipo ?? {}
  const { vista, alEscribir, sincronizar } = useVistaEnVivo(CAMPOS_VISTA, inicial)
  const textoGuardar = equipo ? 'Guardar cambios' : 'Guardar equipo'
  const chips = equipo ? datosClave(equipo) : []

  return (
    <FormularioAccion
      accion={accion}
      textoBoton={textoGuardar}
      boton={false}
      alGuardar={() => router.push(LISTA)}
      encabezado={() => (
        <Contenido className="max-w-6xl pb-0">
          <EncabezadoFormulario
            titulo={equipo?.nombre || 'Nuevo equipo'}
            estado={equipo ? <PastillaEstado activo={equipo.activo} /> : null}
            descripcion={chips.length > 0 ? chips.join(' · ') : 'Datos del equipo y descripción que se usa al cotizar.'}
            acciones={botonEstado}
          />
        </Contenido>
      )}
    >
      {(estado, pendiente) => (
        <Contenido className="max-w-6xl pt-6 pb-28">
          <MensajeFormulario estado={estado} />
          <HojaFormulario ref={sincronizar} onInput={alEscribir}>
            <Tarjeta
              icono={PanelsLeftBottom}
              titulo="Datos del equipo"
              descripcion="Identifican la grúa en las listas y en el combo de la cotización."
            >
              <CamposDatos estado={estado} inicial={inicial} />
            </Tarjeta>
            <Tarjeta
              icono={StickyNote}
              titulo="Texto para la cotización"
              descripcion="Es el texto de “Equipo ofrecido”."
              franja={
                frases.length > 0 ? (
                  <FranjaVista icono={Printer} titulo="Así sale en la cotización">
                    <FrasesResueltas
                      frases={frases}
                      valores={{ capacidad: vista.capacidad_tn, equipo_descripcion: vista.descripcion }}
                    />
                  </FranjaVista>
                ) : null
              }
            >
              <Campo id="equipo-descripcion" etiqueta="Descripción para la cotización" error={estado.errores.descripcion}>
                <Textarea
                  id="equipo-descripcion"
                  name="descripcion"
                  defaultValue={valorCampo(estado, inicial, 'descripcion')}
                  aria-invalid={Boolean(estado.errores.descripcion)}
                  className="min-h-56"
                />
              </Campo>
            </Tarjeta>
          </HojaFormulario>
          <AccionesFormulario volver={LISTA} textoBoton={textoGuardar} pendiente={pendiente} />
        </Contenido>
      )}
    </FormularioAccion>
  )
}

export function NuevoEquipo() {
  return (
    <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
      <Link href={`${LISTA}/nuevo`}>
        <Plus aria-hidden />
        Nuevo equipo
      </Link>
    </Button>
  )
}

export function Equipos({ equipos }: { equipos: (Equipo & { boton: React.ReactNode })[] }) {
  if (equipos.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-6 py-12 text-center text-muted-foreground">
        Todavía no hay equipos. Agregá el primero con &quot;Nuevo equipo&quot;.
      </p>
    )
  }

  return (
    <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      {equipos.map((equipo) => (
        <li key={equipo.id} className="flex items-start gap-4 p-4 sm:p-5">
          <span
            className={cn(
              'grid size-12 shrink-0 place-items-center rounded-xl sm:size-[72px]',
              equipo.activo ? 'bg-accent text-primary' : 'bg-muted text-muted-foreground',
            )}
          >
            <IconoGrua className="size-6 stroke-[1.5] sm:size-9" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-3">
              <div className="min-w-0 flex-1 basis-56 space-y-1.5">
                <p className={cn('text-lg font-medium', equipo.activo ? null : 'text-muted-foreground')}>{equipo.nombre}</p>
                {equipo.capacidad_tn || equipo.marca || equipo.modelo || equipo.identificacion ? (
                  <div className="flex flex-wrap gap-1.5">
                    {[...datosClave(equipo), equipo.identificacion].filter(Boolean).map((dato, indice) => (
                      <Dato key={indice} activo={equipo.activo}>
                        {dato}
                      </Dato>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="flex items-center gap-2">
                <PastillaEstado activo={equipo.activo} />
                <Button asChild variant="ghost" size="icon" className="text-muted-foreground">
                  <Link href={`${LISTA}/${equipo.id}`} aria-label={`Editar ${equipo.nombre}`}>
                    <Pencil />
                  </Link>
                </Button>
                {equipo.boton}
              </div>
            </div>
            {equipo.descripcion ? (
              <p className={cn('mt-2 max-w-3xl text-[15px]', equipo.activo ? 'text-foreground/80' : 'text-muted-foreground')}>
                {equipo.descripcion}
              </p>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  )
}

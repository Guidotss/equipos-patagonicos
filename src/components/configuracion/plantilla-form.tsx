'use client'

import { AlignLeft, ArrowLeft, FileText, ListOrdered, ScrollText, Tag } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Contenido, EncabezadoFicha } from '@/components/app-shell/encabezado'
import { Campo } from '@/components/formulario/campo'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'
import type { Bloque, ItemPlantilla } from '@/lib/plantillas/contenido'
import { parsearFormato, type Segmento } from '@/lib/plantillas/formato'
import { esVariable, partirVariables, VARIABLES } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

const LISTA = '/configuracion/plantillas'

export type Plantilla = {
  nombre: string
  /** Ya traducido: "Mensual", "Por jornada". */
  formato: string
  activa: boolean
  validez_dias: number
  asunto: string
  intro: string
  items: ItemPlantilla[]
  bloques: Bloque[]
}

function Chip({ activa, children }: { activa: boolean; children: React.ReactNode }) {
  return (
    <span
      className={cn(
        'inline-flex h-6 items-center rounded-md bg-slate-200/70 px-2 text-[15px]',
        activa ? 'text-foreground' : 'text-muted-foreground',
      )}
    >
      {children}
    </span>
  )
}

function BotonGuardar({
  pendiente,
  className,
  ...props
}: React.ComponentProps<typeof Button> & { pendiente: boolean }) {
  return (
    <Button
      type="submit"
      size="lg"
      disabled={pendiente}
      className={cn('h-10 px-3.5 text-[15px] shadow-md shadow-primary/20', className)}
      {...props}
    >
      {pendiente ? 'Guardando…' : 'Guardar cambios'}
    </Button>
  )
}

/** Texto de la plantilla con las variables ({{capacidad}}) marcadas en amarillo: se completan en cada cotización. */
function ConVariables({ texto }: { texto: string }) {
  return partirVariables(texto).map((parte, indice) =>
    indice % 2 === 0 ? (
      parte
    ) : (
      <mark
        key={indice}
        title={esVariable(parte) ? VARIABLES[parte] : 'Variable desconocida'}
        className="rounded-sm bg-brand-yellow/40 px-0.5 text-inherit"
      >
        {`{{${parte}}}`}
      </mark>
    ),
  )
}

function Segmentos({ segmentos }: { segmentos: Segmento[] }) {
  return segmentos.map((segmento, indice) =>
    segmento.negrita ? (
      <strong key={indice} className="font-semibold text-foreground">
        <ConVariables texto={segmento.texto} />
      </strong>
    ) : (
      <ConVariables key={indice} texto={segmento.texto} />
    ),
  )
}

/** El contenido de un bloque con el formato mínimo (viñetas y negritas), como en el PDF. */
function TextoBloque({ contenido }: { contenido: string }) {
  return (
    <div className="space-y-1.5 text-[15px] text-foreground/80">
      {parsearFormato(contenido).map((nodo, indice) =>
        nodo.tipo === 'parrafo' ? (
          <p key={indice}>
            <Segmentos segmentos={nodo.segmentos} />
          </p>
        ) : (
          <p key={indice} className={cn('flex gap-2', nodo.nivel === 2 && 'pl-5')}>
            <span aria-hidden className="shrink-0 text-muted-foreground">
              {nodo.nivel === 1 ? '-' : '•'}
            </span>
            <span className="min-w-0">
              <Segmentos segmentos={nodo.segmentos} />
            </span>
          </p>
        ),
      )}
    </div>
  )
}

function TextoLibre({ etiqueta, texto }: { etiqueta: string; texto: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[13px] text-muted-foreground">{etiqueta}</dt>
      <dd className={cn('text-[15px] whitespace-pre-wrap', texto ? 'text-foreground/80' : 'text-muted-foreground')}>
        {texto ? <ConVariables texto={texto} /> : 'No tiene'}
      </dd>
    </div>
  )
}

/** Edición de una plantilla: por ahora solo el nombre; el resto se muestra como referencia. */
export function PlantillaForm({
  accion,
  plantilla,
  botonEstado,
}: {
  accion: AccionFormulario
  plantilla: Plantilla
  botonEstado: React.ReactNode
}) {
  const router = useRouter()
  const conSeccion = plantilla.items.some((item) => item.seccion)

  return (
    <FormularioAccion
      accion={accion}
      textoBoton="Guardar cambios"
      boton={false}
      alGuardar={() => router.push(LISTA)}
      encabezado={({ pendiente, formulario }) => (
        <EncabezadoFicha
          titulo={plantilla.nombre}
          recuadro={<FileText className={cn('size-12 stroke-[1.5]', plantilla.activa ? 'text-primary' : null)} />}
          estado={plantilla.activa ? <Pastilla tono="exito">Activa</Pastilla> : <Pastilla>Inactiva</Pastilla>}
          datos={
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              <Chip activa={plantilla.activa}>{plantilla.formato}</Chip>
              <Chip activa={plantilla.activa}>Validez {plantilla.validez_dias} días</Chip>
            </div>
          }
          acciones={
            <>
              {botonEstado}
              <BotonGuardar pendiente={pendiente} form={formulario} />
            </>
          }
        />
      )}
    >
      {(estado, pendiente) => (
        <Contenido>
          {/* Arriba, cerca de Guardar: los errores generales no tienen un campo donde mostrarse. */}
          <MensajeFormulario estado={estado} />
          <p className="text-[15px] text-muted-foreground">
            Desde acá solo se cambia el nombre. Los textos y los ítems se editan desde una cotización con “Guardar como
            plantilla” (próxima etapa).
          </p>
          <div className="grid items-start gap-6 lg:grid-cols-2">
            <Tarjeta
              icono={Tag}
              titulo="Datos de la plantilla"
              descripcion="El nombre la identifica al armar una cotización; no se imprime."
            >
              <Campo id="plantilla-nombre" etiqueta="Nombre" error={estado.errores.nombre}>
                <Input
                  id="plantilla-nombre"
                  name="nombre"
                  defaultValue={valorCampo(estado, { nombre: plantilla.nombre }, 'nombre')}
                  aria-invalid={Boolean(estado.errores.nombre)}
                />
              </Campo>
            </Tarjeta>

            <Tarjeta
              icono={AlignLeft}
              titulo="Asunto e introducción"
              descripcion="El texto con el que arranca la cotización."
            >
              <dl className="space-y-3">
                <TextoLibre etiqueta="Asunto" texto={plantilla.asunto} />
                <TextoLibre etiqueta="Introducción" texto={plantilla.intro} />
              </dl>
            </Tarjeta>

            <div className="lg:col-span-2">
              <Tarjeta
                icono={ListOrdered}
                titulo="Ítems precargados"
                descripcion="Se cargan sin precio en cada cotización nueva."
              >
                {plantilla.items.length === 0 ? (
                  <p className="text-[15px] text-muted-foreground">No tiene ítems precargados.</p>
                ) : (
                  <div className="-mx-5 -mb-5 border-t sm:-mx-6 sm:-mb-6">
                    <Table>
                      <TableHeader className="bg-muted/50">
                        <TableRow className="hover:bg-transparent">
                          {conSeccion ? (
                            <TableHead className="h-11 pl-5 text-muted-foreground sm:pl-6">Sección</TableHead>
                          ) : null}
                          <TableHead className={cn('h-11 text-muted-foreground', conSeccion ? null : 'pl-5 sm:pl-6')}>
                            Descripción
                          </TableHead>
                          <TableHead className="h-11 text-muted-foreground">Unidad</TableHead>
                          <TableHead className="h-11 pr-5 text-right text-muted-foreground sm:pr-6">Cantidad</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {plantilla.items.map((item, indice) => (
                          <TableRow key={indice}>
                            {conSeccion ? (
                              <TableCell className="py-3 pl-5 sm:pl-6">{item.seccion || '—'}</TableCell>
                            ) : null}
                            <TableCell className={cn('py-3 whitespace-normal', conSeccion ? null : 'pl-5 sm:pl-6')}>
                              <ConVariables texto={item.descripcion} />
                            </TableCell>
                            <TableCell className="py-3">{item.unidad}</TableCell>
                            <TableCell className="py-3 pr-5 text-right tabular-nums sm:pr-6">{item.cantidad}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </Tarjeta>
            </div>

            <div className="lg:col-span-2">
              <Tarjeta
                icono={ScrollText}
                titulo="Textos de la cotización"
                descripcion="Condiciones que se imprimen en cada cotización hecha con esta plantilla."
              >
                {plantilla.bloques.length === 0 ? (
                  <p className="text-[15px] text-muted-foreground">No tiene textos.</p>
                ) : (
                  <div className="-mx-5 -mb-5 divide-y border-t sm:-mx-6 sm:-mb-6">
                    {plantilla.bloques.map((bloque, indice) => (
                      <article key={indice} className="space-y-2 px-5 py-4 sm:px-6">
                        {bloque.titulo ? <h3 className="font-medium">{bloque.titulo}</h3> : null}
                        <TextoBloque contenido={bloque.contenido} />
                      </article>
                    ))}
                  </div>
                )}
              </Tarjeta>
            </div>
          </div>
          {/* En celular el botón de arriba queda lejos del campo. */}
          <BotonGuardar pendiente={pendiente} className="w-full lg:hidden" />
          <Link href={LISTA} className="inline-flex items-center gap-1.5 text-[15px] text-primary hover:underline">
            <ArrowLeft className="size-4" aria-hidden />
            Volver a Plantillas
          </Link>
        </Contenido>
      )}
    </FormularioAccion>
  )
}

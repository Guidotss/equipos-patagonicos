'use client'

import { AlignLeft, ListOrdered, ScrollText, Tag } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Contenido } from '@/components/app-shell/encabezado'
import { Campo } from '@/components/formulario/campo'
import { AccionesFormulario, EncabezadoFormulario, HojaFormulario } from '@/components/formulario/estructura-formulario'
import { FormularioAccion } from '@/components/formulario/formulario-accion'
import { MensajeFormulario } from '@/components/formulario/mensaje-formulario'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { ConVariables, TextoBloque } from '@/components/plantillas/texto-formateado'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { valorCampo, type AccionFormulario } from '@/lib/formularios'
import type { Bloque, ItemPlantilla } from '@/lib/plantillas/contenido'
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

/** Nombre editable y contenido de referencia, con acceso al editor completo. */
export function PlantillaForm({
  accion,
  plantilla,
  botonEstado,
  editarHref,
}: {
  accion: AccionFormulario
  plantilla: Plantilla
  botonEstado: React.ReactNode
  editarHref?: string
}) {
  const router = useRouter()
  const conSeccion = plantilla.items.some((item) => item.seccion)

  return (
    <FormularioAccion
      accion={accion}
      textoBoton="Guardar cambios"
      boton={false}
      alGuardar={() => router.push(LISTA)}
      encabezado={() => (
        <Contenido className="max-w-6xl pb-0">
          <EncabezadoFormulario
            titulo={plantilla.nombre}
            estado={plantilla.activa ? <Pastilla tono="exito">Activa</Pastilla> : <Pastilla>Inactiva</Pastilla>}
            descripcion={`${plantilla.formato} · Validez ${plantilla.validez_dias} días`}
            acciones={botonEstado}
          />
        </Contenido>
      )}
    >
      {(estado, pendiente) => (
        <Contenido className="max-w-6xl pt-6 pb-28">
          <MensajeFormulario estado={estado} />
          <HojaFormulario>
            <Tarjeta
              icono={Tag}
              titulo="Datos de la plantilla"
              descripcion="El nombre la identifica al armar una cotización; no se imprime. Los textos e ítems se cambian desde el editor."
              acciones={editarHref ? <Button asChild variant="outline"><Link href={editarHref}>Editar textos e ítems</Link></Button> : null}
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

            <Tarjeta
              icono={ListOrdered}
              titulo="Ítems precargados"
              descripcion="Se cargan sin precio en cada cotización nueva."
            >
              {plantilla.items.length === 0 ? (
                <p className="text-[15px] text-muted-foreground">No tiene ítems precargados.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-transparent">
                        {conSeccion ? (
                          <TableHead className="h-11 px-3 text-muted-foreground">Sección</TableHead>
                        ) : null}
                        <TableHead className="h-11 px-3 text-muted-foreground">
                          Descripción
                        </TableHead>
                        <TableHead className="h-11 px-3 text-muted-foreground">Unidad</TableHead>
                        <TableHead className="h-11 px-3 text-right text-muted-foreground">Cantidad</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {plantilla.items.map((item, indice) => (
                        <TableRow key={indice}>
                          {conSeccion ? (
                            <TableCell className="px-3 py-3">{item.seccion || '—'}</TableCell>
                          ) : null}
                          <TableCell className="px-3 py-3 whitespace-normal">
                            <ConVariables texto={item.descripcion} />
                          </TableCell>
                          <TableCell className="px-3 py-3">{item.unidad}</TableCell>
                          <TableCell className="px-3 py-3 text-right tabular-nums">{item.cantidad}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Tarjeta>

            <Tarjeta
              icono={ScrollText}
              titulo="Textos de la cotización"
              descripcion="Condiciones que se imprimen en cada cotización hecha con esta plantilla."
            >
              {plantilla.bloques.length === 0 ? (
                <p className="text-[15px] text-muted-foreground">No tiene textos.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {plantilla.bloques.map((bloque, indice) => (
                    <article key={indice} className="space-y-2 px-4 py-4">
                      {bloque.titulo ? <h3 className="font-medium">{bloque.titulo}</h3> : null}
                      <TextoBloque contenido={bloque.contenido} />
                    </article>
                  ))}
                </div>
              )}
            </Tarjeta>
          </HojaFormulario>
          <AccionesFormulario volver={LISTA} textoBoton="Guardar cambios" pendiente={pendiente} />
        </Contenido>
      )}
    </FormularioAccion>
  )
}

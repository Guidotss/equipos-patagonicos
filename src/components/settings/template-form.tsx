'use client'

import { AlignLeft, ListOrdered, ScrollText, Tag } from 'lucide-react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Content } from '@/components/app-shell/header'
import { Field } from '@/components/form/field'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { FormAction } from '@/components/form/form-action'
import { MessageForm } from '@/components/form/message-form'
import { Card } from '@/components/form/card'
import { WithVariables, TextBlock } from '@/components/templates/text-formatted'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pill } from '@/components/ui/pill'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { valueField, type ActionForm } from '@/lib/forms'
import type { Block, ItemTemplate } from '@/lib/templates/content'
import { cn } from '@/lib/utils'

const LISTA = '/configuracion/plantillas'

export type Template = {
  nombre: string
  /** Ya traducido: "Mensual", "Por jornada". */
  formato: string
  activa: boolean
  validez_dias: number
  asunto: string
  intro: string
  items: ItemTemplate[]
  bloques: Block[]
}

function TextFree({ label, texto }: { label: string; texto: string }) {
  return (
    <div className="space-y-1">
      <dt className="text-[13px] text-muted-foreground">{label}</dt>
      <dd className={cn('text-[15px] whitespace-pre-wrap', texto ? 'text-foreground/80' : 'text-muted-foreground')}>
        {texto ? <WithVariables texto={texto} /> : 'No tiene'}
      </dd>
    </div>
  )
}

/** Nombre editable y contenido de referencia, con acceso al editor completo. */
export function TemplateForm({
  accion,
  plantilla: template,
  buttonStatus,
  editHref,
}: {
  accion: ActionForm
  plantilla: Template
  buttonStatus: React.ReactNode
  editHref?: string
}) {
  const router = useRouter()
  const withSection = template.items.some((item) => item.seccion)

  return (
    <FormAction
      accion={accion}
      textButton="Guardar cambios"
      button={false}
      onSave={() => router.push(LISTA)}
      header={() => (
        <Content className="max-w-6xl pb-0">
          <HeaderForm
            titulo={template.nombre}
            estado={template.activa ? <Pill tone="exito">Activa</Pill> : <Pill>Inactiva</Pill>}
            descripcion={`${template.formato} · Validez ${template.validez_dias} días`}
            actions={buttonStatus}
          />
        </Content>
      )}
    >
      {(estado, pending) => (
        <Content className="max-w-6xl pt-6 pb-28">
          <MessageForm estado={estado} />
          <SheetForm>
            <Card
              icon={Tag}
              titulo="Datos de la plantilla"
              descripcion="El nombre la identifica al armar una cotización; no se imprime. Los textos e ítems se cambian desde el editor."
              actions={editHref ? <Button asChild variant="outline"><Link href={editHref}>Editar textos e ítems</Link></Button> : null}
            >
              <Field id="plantilla-nombre" label="Nombre" error={estado.errors.nombre}>
                <Input
                  id="plantilla-nombre"
                  name="nombre"
                  defaultValue={valueField(estado, { nombre: template.nombre }, 'nombre')}
                  aria-invalid={Boolean(estado.errors.nombre)}
                />
              </Field>
            </Card>

            <Card
              icon={AlignLeft}
              titulo="Asunto e introducción"
              descripcion="El texto con el que arranca la cotización."
            >
              <dl className="space-y-3">
                <TextFree label="Asunto" texto={template.asunto} />
                <TextFree label="Introducción" texto={template.intro} />
              </dl>
            </Card>

            <Card
              icon={ListOrdered}
              titulo="Ítems precargados"
              descripcion="Se cargan sin precio en cada cotización nueva."
            >
              {template.items.length === 0 ? (
                <p className="text-[15px] text-muted-foreground">No tiene ítems precargados.</p>
              ) : (
                <div className="overflow-hidden rounded-lg border">
                  <Table>
                    <TableHeader className="bg-muted/50">
                      <TableRow className="hover:bg-transparent">
                        {withSection ? (
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
                      {template.items.map((item, index) => (
                        <TableRow key={index}>
                          {withSection ? (
                            <TableCell className="px-3 py-3">{item.seccion || '—'}</TableCell>
                          ) : null}
                          <TableCell className="px-3 py-3 whitespace-normal">
                            <WithVariables texto={item.descripcion} />
                          </TableCell>
                          <TableCell className="px-3 py-3">{item.unidad}</TableCell>
                          <TableCell className="px-3 py-3 text-right tabular-nums">{item.cantidad}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </Card>

            <Card
              icon={ScrollText}
              titulo="Textos de la cotización"
              descripcion="Condiciones que se imprimen en cada cotización hecha con esta plantilla."
            >
              {template.bloques.length === 0 ? (
                <p className="text-[15px] text-muted-foreground">No tiene textos.</p>
              ) : (
                <div className="divide-y rounded-lg border">
                  {template.bloques.map((block, index) => (
                    <article key={index} className="space-y-2 px-4 py-4">
                      {block.titulo ? <h3 className="font-medium">{block.titulo}</h3> : null}
                      <TextBlock contenido={block.contenido} />
                    </article>
                  ))}
                </div>
              )}
            </Card>
          </SheetForm>
          <ActionsForm back={LISTA} textButton="Guardar cambios" pendiente={pending} />
        </Content>
      )}
    </FormAction>
  )
}

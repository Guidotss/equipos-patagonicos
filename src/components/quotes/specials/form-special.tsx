'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FileUp, FileCheck2, Paperclip } from 'lucide-react'
import { createSpecial, preparePdfExisting } from '@/app/(app)/cotizaciones/specials-actions'
import { Content } from '@/components/app-shell/header'
import { SelectorClient, type ClientSearchResult } from '@/components/quotes/editor/selector-client'
import { Field } from '@/components/form/field'
import { ActionsForm, HeaderForm, SheetForm } from '@/components/form/structure-form'
import { Card } from '@/components/form/card'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { schemaSpecial } from '@/lib/quotes/specials'
import { errorsByPath } from '@/lib/forms'
import { createClient } from '@/lib/supabase/client'

export function FormSpecial({ origen, today }: { origen: 'importada' | 'directa'; today: string }) {
  const router = useRouter()
  const [cliente, setClient] = useState<ClientSearchResult | null>(null)
  const [values, setValues] = useState({ numero: '', fecha: today, fecha_aprobacion: '', formato: 'jornada', estado: 'enviada', asunto: '', notas: '' })
  const [archivo, setFile] = useState<File | null>(null)
  const [subido, setSubido] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const inCurso = useRef(false)
  const form = useRef<HTMLFormElement>(null)
  const [message, setMessage] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [progreso, setProgreso] = useState('')
  const imported = origen === 'importada'

  useEffect(() => {
    if (busy || !message) return
    const destination = form.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
    destination?.focus()
  }, [busy, message, errors])

  async function save(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (inCurso.current) return
    const entrada = { ...values, cliente_id: cliente?.id ?? '' }
    const validation = schemaSpecial(origen).safeParse(entrada)
    const errorsData = validation.success ? {} : errorsByPath(validation.error)
    if (imported && !archivo && !subido) errorsData.archivo = 'Elegí el PDF de la cotización'
    if (Object.keys(errorsData).length) {
      setErrors(errorsData)
      setMessage('Revisá los datos marcados')
      return
    }
    inCurso.current = true
    setBusy(true)
    setMessage('')
    setErrors({})
    try {
      let path = subido ?? undefined
      if (imported && !path) {
        if (!archivo) return
        setProgreso('Subiendo PDF…')
        const permiso = await preparePdfExisting(archivo.size, archivo.type)
        if (!permiso.ok) { setMessage(permiso.message); setErrors({ archivo: permiso.message }); return }
        const { error } = await createClient().storage.from('documentos').uploadToSignedUrl(permiso.datos.path, permiso.datos.token, archivo, { contentType: 'application/pdf' })
        if (error) {
          const messageFile = 'No se pudo subir el PDF. Probá nuevamente.'
          setMessage(messageFile)
          setErrors({ archivo: messageFile })
          return
        }
        path = permiso.datos.path; setSubido(path)
      }
      setProgreso('Guardando…')
      const r = await createSpecial(origen, entrada, path)
      if (!r.ok) { setMessage(r.message); setErrors(r.errors ?? {}); return }
      router.push(imported ? `/cotizaciones/${r.datos.id}` : `/presupuestos/${r.datos.id}`)
    } catch { setMessage('No se pudo completar la operación. Podés reintentar sin perder los datos.') }
    finally { inCurso.current = false; setBusy(false); setProgreso('') }
  }
  function field(nombre: keyof typeof values) { return { value: values[nombre], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValues((v) => ({ ...v, [nombre]: e.target.value })), 'aria-invalid': Boolean(errors[nombre]) } }

  return <Content className="mx-auto w-full max-w-6xl pb-28">
    <HeaderForm titulo={imported ? 'Cargar cotización existente' : 'Presupuesto directo'} descripcion={imported ? 'Conservá el número y el PDF original de la cotización.' : 'Registrá un trabajo acordado sin cotización formal.'} />
    <form ref={form} onSubmit={save} noValidate className="space-y-6">
      <fieldset disabled={busy} className="min-w-0">
        <legend className="sr-only">{imported ? 'Datos de la cotización existente' : 'Datos del presupuesto directo'}</legend>
        <SheetForm>
          <Card titulo="Datos del trabajo" descripcion="Identificá al cliente y registrá los datos acordados." icon={imported ? FileUp : FileCheck2}>
            <div className="flex flex-col gap-4">
              <Field id="especial-cliente" label="Cliente" error={errors.cliente_id}><SelectorClient id="especial-cliente" cliente={cliente} onChoose={setClient} error={errors.cliente_id} /></Field>
              <div className="grid gap-4 sm:grid-cols-2">
                {imported ? <Field id="especial-numero" label="Número original" error={errors.numero}><Input id="especial-numero" inputMode="numeric" {...field('numero')} /></Field> : null}
                <Field id="especial-fecha" label="Fecha" error={errors.fecha}><Input id="especial-fecha" type="date" {...field('fecha')} /></Field>
                {imported ? <Field id="especial-formato" label="Formato"><NativeSelect id="especial-formato" {...field('formato')} className="w-full"><NativeSelectOption value="jornada">Por jornada</NativeSelectOption><NativeSelectOption value="mensual">Mensual</NativeSelectOption></NativeSelect></Field> : null}
                {imported ? <Field id="especial-estado" label="Estado"><NativeSelect id="especial-estado" {...field('estado')} className="w-full"><NativeSelectOption value="enviada">Enviada</NativeSelectOption><NativeSelectOption value="aprobada">Aprobada</NativeSelectOption></NativeSelect></Field> : null}
                {!imported || values.estado === 'aprobada' ? <Field id="especial-aprobacion" label="Fecha de aprobación" help="Si queda vacía, se usa la fecha del trabajo." error={errors.fecha_aprobacion}><Input id="especial-aprobacion" type="date" min={values.fecha} {...field('fecha_aprobacion')} /></Field> : null}
              </div>
              <Field id="especial-asunto" label="Descripción del trabajo" error={errors.asunto}><Input id="especial-asunto" {...field('asunto')} /></Field>
              <Field id="especial-notas" label="Notas internas" error={errors.notas}><Textarea id="especial-notas" maxLength={2000} {...field('notas')} /></Field>
            </div>
          </Card>
          {imported ? <Card titulo="PDF original" icon={FileUp}>
            <label
              htmlFor="especial-archivo"
              className="relative flex min-h-14 cursor-pointer items-center justify-center gap-3 rounded-lg border border-dashed border-primary/50 bg-primary/5 px-4 py-3 text-sm font-medium text-primary transition-colors hover:bg-primary/10 focus-within:ring-3 focus-within:ring-ring/50 has-[:disabled]:pointer-events-none has-[:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive"
            >
              <input
                id="especial-archivo"
                aria-label="Archivo PDF"
                type="file"
                accept="application/pdf"
                className="sr-only"
                aria-invalid={Boolean(errors.archivo)}
                aria-describedby={`especial-archivo-ayuda${errors.archivo ? ' especial-archivo-error' : ''}`}
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null)
                  setSubido(null)
                  setErrors((actuales) => ({ ...actuales, archivo: '' }))
                }}
              />
              <Paperclip aria-hidden className="size-5" />
              {archivo ? 'Cambiar PDF' : 'Seleccionar PDF'}
            </label>
            <p id="especial-archivo-ayuda" className="mt-2 text-xs text-muted-foreground">Un archivo PDF de hasta 10 MB.</p>
            {archivo ? <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{archivo.name} · {(archivo.size / 1024).toFixed(0)} KB{subido ? ' · Subido' : ''}</p> : null}
            {errors.archivo ? <p id="especial-archivo-error" className="mt-2 text-sm text-destructive">{errors.archivo}</p> : null}
          </Card> : null}
        </SheetForm>
      </fieldset>
      {message ? <Alert variant="destructive" tabIndex={-1}><AlertDescription>{message}</AlertDescription></Alert> : null}
      <ActionsForm
        back="/cotizaciones"
        textButton={progreso || (imported ? 'Cargar cotización' : 'Crear presupuesto')}
        disabled={busy}
      />
    </form>
  </Content>
}

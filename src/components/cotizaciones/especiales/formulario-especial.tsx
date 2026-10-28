'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState } from 'react'
import { FileUp, FileCheck2, Paperclip } from 'lucide-react'
import { crearEspecial, prepararPdfExistente } from '@/app/(app)/cotizaciones/especiales-actions'
import { Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { SelectorCliente, type ClienteBuscado } from '@/components/cotizaciones/editor/selector-cliente'
import { Campo } from '@/components/formulario/campo'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { esquemaEspecial } from '@/lib/cotizaciones/especiales'
import { erroresPorRuta } from '@/lib/formularios'
import { createClient } from '@/lib/supabase/client'

export function FormularioEspecial({ origen, hoy }: { origen: 'importada' | 'directa'; hoy: string }) {
  const router = useRouter()
  const [cliente, setCliente] = useState<ClienteBuscado | null>(null)
  const [valores, setValores] = useState({ numero: '', fecha: hoy, fecha_aprobacion: '', formato: 'jornada', estado: 'enviada', asunto: '', notas: '' })
  const [archivo, setArchivo] = useState<File | null>(null)
  const [subido, setSubido] = useState<string | null>(null)
  const [ocupado, setOcupado] = useState(false)
  const enCurso = useRef(false)
  const formulario = useRef<HTMLFormElement>(null)
  const [mensaje, setMensaje] = useState('')
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [progreso, setProgreso] = useState('')
  const importada = origen === 'importada'

  useEffect(() => {
    if (ocupado || !mensaje) return
    const destino = formulario.current?.querySelector<HTMLElement>('[aria-invalid="true"], [role="alert"]')
    destino?.focus()
  }, [ocupado, mensaje, errores])

  async function guardar(evento: React.FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    if (enCurso.current) return
    const entrada = { ...valores, cliente_id: cliente?.id ?? '' }
    const validacion = esquemaEspecial(origen).safeParse(entrada)
    const erroresDatos = validacion.success ? {} : erroresPorRuta(validacion.error)
    if (importada && !archivo && !subido) erroresDatos.archivo = 'Elegí el PDF de la cotización'
    if (Object.keys(erroresDatos).length) {
      setErrores(erroresDatos)
      setMensaje('Revisá los datos marcados')
      return
    }
    enCurso.current = true
    setOcupado(true)
    setMensaje('')
    setErrores({})
    try {
      let path = subido ?? undefined
      if (importada && !path) {
        if (!archivo) return
        setProgreso('Subiendo PDF…')
        const permiso = await prepararPdfExistente(archivo.size, archivo.type)
        if (!permiso.ok) { setMensaje(permiso.mensaje); setErrores({ archivo: permiso.mensaje }); return }
        const { error } = await createClient().storage.from('documentos').uploadToSignedUrl(permiso.datos.path, permiso.datos.token, archivo, { contentType: 'application/pdf' })
        if (error) {
          const mensajeArchivo = 'No se pudo subir el PDF. Probá nuevamente.'
          setMensaje(mensajeArchivo)
          setErrores({ archivo: mensajeArchivo })
          return
        }
        path = permiso.datos.path; setSubido(path)
      }
      setProgreso('Guardando…')
      const r = await crearEspecial(origen, entrada, path)
      if (!r.ok) { setMensaje(r.mensaje); setErrores(r.errores ?? {}); return }
      router.push(importada ? `/cotizaciones/${r.datos.id}` : `/presupuestos/${r.datos.id}`)
    } catch { setMensaje('No se pudo completar la operación. Podés reintentar sin perder los datos.') }
    finally { enCurso.current = false; setOcupado(false); setProgreso('') }
  }
  function campo(nombre: keyof typeof valores) { return { value: valores[nombre], onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setValores((v) => ({ ...v, [nombre]: e.target.value })), 'aria-invalid': Boolean(errores[nombre]) } }

  return <Contenido>
    <EncabezadoPagina titulo={importada ? 'Cargar cotización existente' : 'Presupuesto directo'} descripcion={importada ? 'Conservá el número y el PDF original de la cotización.' : 'Registrá un trabajo acordado sin cotización formal.'} />
    <form ref={formulario} onSubmit={guardar} noValidate className="max-w-3xl">
      <fieldset disabled={ocupado} className="flex min-w-0 flex-col gap-5">
        <Tarjeta titulo="Datos del trabajo" icono={importada ? FileUp : FileCheck2}>
          <div className="flex flex-col gap-4">
            <Campo id="especial-cliente" etiqueta="Cliente" error={errores.cliente_id}><SelectorCliente id="especial-cliente" cliente={cliente} alElegir={setCliente} error={errores.cliente_id} /></Campo>
            <div className="grid gap-4 sm:grid-cols-2">
              {importada ? <Campo id="especial-numero" etiqueta="Número original" error={errores.numero}><Input id="especial-numero" inputMode="numeric" {...campo('numero')} /></Campo> : null}
              <Campo id="especial-fecha" etiqueta="Fecha" error={errores.fecha}><Input id="especial-fecha" type="date" {...campo('fecha')} /></Campo>
              {importada ? <Campo id="especial-formato" etiqueta="Formato"><NativeSelect id="especial-formato" {...campo('formato')} className="w-full"><NativeSelectOption value="jornada">Por jornada</NativeSelectOption><NativeSelectOption value="mensual">Mensual</NativeSelectOption></NativeSelect></Campo> : null}
              {importada ? <Campo id="especial-estado" etiqueta="Estado"><NativeSelect id="especial-estado" {...campo('estado')} className="w-full"><NativeSelectOption value="enviada">Enviada</NativeSelectOption><NativeSelectOption value="aprobada">Aprobada</NativeSelectOption></NativeSelect></Campo> : null}
              {!importada || valores.estado === 'aprobada' ? <Campo id="especial-aprobacion" etiqueta="Fecha de aprobación" ayuda="Si queda vacía, se usa la fecha del trabajo." error={errores.fecha_aprobacion}><Input id="especial-aprobacion" type="date" min={valores.fecha} {...campo('fecha_aprobacion')} /></Campo> : null}
            </div>
            <Campo id="especial-asunto" etiqueta="Descripción del trabajo" error={errores.asunto}><Input id="especial-asunto" {...campo('asunto')} /></Campo>
            <Campo id="especial-notas" etiqueta="Notas internas" error={errores.notas}><Textarea id="especial-notas" maxLength={2000} {...campo('notas')} /></Campo>
          </div>
        </Tarjeta>
        {importada ? <Tarjeta titulo="PDF original" icono={FileUp}>
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
              aria-invalid={Boolean(errores.archivo)}
              aria-describedby={`especial-archivo-ayuda${errores.archivo ? ' especial-archivo-error' : ''}`}
              onChange={(e) => {
                setArchivo(e.target.files?.[0] ?? null)
                setSubido(null)
                setErrores((actuales) => ({ ...actuales, archivo: '' }))
              }}
            />
            <Paperclip aria-hidden className="size-5" />
            {archivo ? 'Cambiar PDF' : 'Seleccionar PDF'}
          </label>
          <p id="especial-archivo-ayuda" className="mt-2 text-xs text-muted-foreground">Un archivo PDF de hasta 10 MB.</p>
          {archivo ? <p className="mt-2 text-sm text-muted-foreground [overflow-wrap:anywhere]">{archivo.name} · {(archivo.size / 1024).toFixed(0)} KB{subido ? ' · Subido' : ''}</p> : null}
          {errores.archivo ? <p id="especial-archivo-error" className="mt-2 text-sm text-destructive">{errores.archivo}</p> : null}
        </Tarjeta> : null}
        {mensaje ? <Alert variant="destructive" tabIndex={-1}><AlertDescription>{mensaje}</AlertDescription></Alert> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center"><Button type="submit" disabled={ocupado}>{progreso || (importada ? 'Cargar cotización' : 'Crear presupuesto')}</Button><Button asChild variant="outline"><Link href="/cotizaciones">Cancelar</Link></Button></div>
      </fieldset>
    </form>
  </Contenido>
}

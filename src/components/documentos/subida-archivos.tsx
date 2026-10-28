'use client'
/* eslint-disable @next/next/no-img-element -- Previsualizaciones locales de archivos mediante URL.createObjectURL. */

import { Camera, FileText, Paperclip, RotateCw, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { prepararArchivo } from '@/app/(app)/documentos/actions'
import { Button } from '@/components/ui/button'
import { prepararFoto, subirConProgreso } from '@/lib/documentos/subida'
import type { ArchivoSubido } from '@/lib/documentos/servicio'

type Subida = {
  id: string
  archivo: File
  vista: string
  progreso: number
  estado: 'subiendo' | 'error' | 'listo'
  error?: string
  subido?: ArchivoSubido
}

export function SubidaArchivos({
  clienteId,
  disabled,
  alCambiar,
}: {
  clienteId: string
  disabled?: boolean
  alCambiar: (archivos: ArchivoSubido[], pendientes: boolean) => void
}) {
  const [archivos, setArchivos] = useState<Subida[]>([])
  const [error, setError] = useState('')
  const selector = useRef<HTMLInputElement>(null)
  const camara = useRef<HTMLInputElement>(null)
  const vistas = useRef<string[]>([])
  useEffect(() => () => vistas.current.forEach(URL.revokeObjectURL), [])
  useEffect(() => {
    alCambiar(
      archivos.flatMap((archivo) => (archivo.subido ? [archivo.subido] : [])),
      archivos.some((archivo) => archivo.estado !== 'listo'),
    )
  }, [archivos, alCambiar])

  function actualizar(id: string, cambios: Partial<Subida>) {
    setArchivos((anteriores) => anteriores.map((archivo) => (archivo.id === id ? { ...archivo, ...cambios } : archivo)))
  }
  async function subir(entrada: Subida) {
    actualizar(entrada.id, { estado: 'subiendo', progreso: 0, error: undefined })
    try {
      if (entrada.archivo.name.length > 255) throw new Error('El nombre del archivo puede tener hasta 255 caracteres')
      const archivo = await prepararFoto(entrada.archivo)
      const resultado = await prepararArchivo({ clienteId, mime: archivo.type, tamano: archivo.size })
      if (!resultado.ok) throw new Error(resultado.mensaje)
      await subirConProgreso(resultado.datos.signedUrl, archivo, (progreso) => actualizar(entrada.id, { progreso }))
      actualizar(entrada.id, {
        estado: 'listo',
        progreso: 100,
        subido: { path: resultado.datos.path, nombre_original: entrada.archivo.name },
      })
    } catch (problema) {
      actualizar(entrada.id, {
        estado: 'error',
        error: problema instanceof Error ? problema.message : 'No se pudo subir. Reintentá.',
      })
    }
  }
  function seleccionar(lista: FileList | null) {
    if (!lista) return
    if (lista.length + archivos.length > 50) {
      setError('Podés adjuntar hasta 50 archivos por vez.')
      return
    }
    setError('')
    const nuevas = Array.from(lista).map((archivo): Subida => {
      const vista = URL.createObjectURL(archivo)
      vistas.current.push(vista)
      return { id: crypto.randomUUID(), archivo, vista, progreso: 0, estado: 'subiendo' }
    })
    setArchivos((anteriores) => [...anteriores, ...nuevas])
    for (const archivo of nuevas) void subir(archivo)
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        <Button
          type="button"
          variant="outline"
          className="h-20 flex-col"
          disabled={disabled || !clienteId}
          onClick={() => camara.current?.click()}
        >
          <Camera data-icon="inline-start" />
          Tomar foto
        </Button>
        <Button
          type="button"
          variant="outline"
          className="h-20 flex-col"
          disabled={disabled || !clienteId}
          onClick={() => selector.current?.click()}
        >
          <Paperclip data-icon="inline-start" />
          Seleccionar archivos
        </Button>
      </div>
      <input
        ref={selector}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        multiple
        className="sr-only"
        aria-label="Seleccionar archivos del documento"
        disabled={disabled || !clienteId}
        onChange={(evento) => {
          seleccionar(evento.target.files)
          evento.target.value = ''
        }}
      />
      <input
        ref={camara}
        type="file"
        accept="image/jpeg,image/png"
        capture="environment"
        className="sr-only"
        aria-label="Tomar foto del documento"
        disabled={disabled || !clienteId}
        onChange={(evento) => {
          seleccionar(evento.target.files)
          evento.target.value = ''
        }}
      />
      <p className="text-xs text-muted-foreground">
        PDF, JPG o PNG · hasta 10 MB por archivo. Las fotos se comprimen para facilitar la subida.
      </p>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      {archivos.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {archivos.map((archivo) => (
            <li key={archivo.id} className="relative flex gap-3 rounded-lg border p-3">
              <a
                href={archivo.vista}
                target="_blank"
                rel="noreferrer"
                aria-label={`Previsualizar ${archivo.archivo.name}`}
                className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-md bg-muted"
              >
                {archivo.archivo.type.startsWith('image/') ? (
                  <img src={archivo.vista} alt="" className="size-full object-cover" />
                ) : (
                  <FileText className="size-7 text-muted-foreground" />
                )}
              </a>
              <div className="flex min-w-0 flex-1 flex-col gap-1 pr-5">
                <p className="truncate text-sm" title={archivo.archivo.name}>
                  {archivo.archivo.name}
                </p>
                {archivo.estado === 'subiendo' ? (
                  <>
                    <progress
                      value={archivo.progreso}
                      max={100}
                      aria-label={`Subiendo ${archivo.archivo.name}`}
                      className="h-2 w-full accent-primary"
                    />
                    <p className="text-xs text-muted-foreground">Subiendo {archivo.progreso}%</p>
                  </>
                ) : archivo.estado === 'listo' ? (
                  <p className="text-xs text-muted-foreground">Listo para guardar</p>
                ) : (
                  <>
                    <p role="alert" className="text-xs text-destructive">
                      {archivo.error}
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => void subir(archivo)}
                      disabled={disabled}
                    >
                      <RotateCw data-icon="inline-start" />
                      Reintentar
                    </Button>
                  </>
                )}
              </div>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Quitar ${archivo.archivo.name}`}
                className="absolute top-1 right-1"
                disabled={disabled || archivo.estado === 'subiendo'}
                onClick={() => setArchivos((anteriores) => anteriores.filter((item) => item.id !== archivo.id))}
              >
                <X />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

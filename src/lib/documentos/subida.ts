'use client'

import { validarArchivo } from './archivos'

/** Corrige orientación EXIF y limita el lado mayor antes de convertir fotos a JPEG. */
export async function prepararFoto(archivo: File): Promise<File> {
  const problema = validarArchivo({ mime: archivo.type, tamano: archivo.size })
  if (problema) throw new Error(problema)
  if (!archivo.type.startsWith('image/')) return archivo
  const imagen = await createImageBitmap(archivo, { imageOrientation: 'from-image' })
  try {
    const escala = Math.min(1, 2000 / Math.max(imagen.width, imagen.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(imagen.width * escala)
    canvas.height = Math.round(imagen.height * escala)
    const contexto = canvas.getContext('2d')
    if (!contexto) throw new Error('No se pudo preparar la foto')
    contexto.fillStyle = '#ffffff'
    contexto.fillRect(0, 0, canvas.width, canvas.height)
    contexto.drawImage(imagen, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob(
        (valor) => (valor ? resolve(valor) : reject(new Error('No se pudo comprimir la foto'))),
        'image/jpeg',
        0.85,
      ),
    )
    return new File([blob], archivo.name.replace(/\.[^.]+$/, '') + '.jpg', { type: 'image/jpeg' })
  } finally {
    imagen.close()
  }
}

/** XHR permite informar avance real sin enviar binarios a una Server Action. */
export function subirConProgreso(url: string, archivo: File, progreso: (porcentaje: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const solicitud = new XMLHttpRequest()
    solicitud.open('PUT', url)
    solicitud.setRequestHeader('content-type', archivo.type)
    solicitud.setRequestHeader('x-upsert', 'false')
    solicitud.upload.onprogress = (evento) => {
      if (evento.lengthComputable) progreso(Math.round((evento.loaded / evento.total) * 100))
    }
    solicitud.onerror = () => reject(new Error('Se interrumpió la subida. Podés reintentar.'))
    solicitud.onload = () =>
      solicitud.status >= 200 && solicitud.status < 300
        ? resolve()
        : reject(new Error('No se pudo subir el archivo. Podés reintentar.'))
    solicitud.send(archivo)
  })
}

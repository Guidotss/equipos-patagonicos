'use client'

import { validateFile } from './files'

/** Corrige orientación EXIF y limita el lado mayor antes de convertir fotos a JPEG. */
export async function prepareFoto(archivo: File): Promise<File> {
  const problema = validateFile({ mime: archivo.type, tamano: archivo.size })
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
        (value) => (value ? resolve(value) : reject(new Error('No se pudo comprimir la foto'))),
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
export function uploadWithProgreso(url: string, archivo: File, progreso: (porcentaje: number) => void): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('PUT', url)
    request.setRequestHeader('content-type', archivo.type)
    request.setRequestHeader('x-upsert', 'false')
    request.upload.onprogress = (evento) => {
      if (evento.lengthComputable) progreso(Math.round((evento.loaded / evento.total) * 100))
    }
    request.onerror = () => reject(new Error('Se interrumpió la subida. Podés reintentar.'))
    request.onload = () =>
      request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error('No se pudo subir el archivo. Podés reintentar.'))
    request.send(archivo)
  })
}

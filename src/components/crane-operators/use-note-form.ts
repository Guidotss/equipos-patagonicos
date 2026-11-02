'use client'

import { useCallback, useEffect, useRef, useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { prepareOperatorUpload, sendOperatorNote } from '@/app/(operator)/operator/actions'
import type { UploadPreparer } from '@/components/documents/upload-files'
import type { UploadedFile } from '@/lib/documents/service'
import { craneDeliveryNoteSubmissionSchema } from '@/lib/crane-operators/schemas'
import { errorsByPath } from '@/lib/forms'

export const prepareNoteUpload: UploadPreparer = ({ mime, tamano }) => prepareOperatorUpload({ mime, size: tamano })

export function useNoteForm(today: string) {
  const router = useRouter()
  const [values, setValues] = useState({ budgetId: '', serviceDate: today, number: '', customerName: '', workDescription: '', notes: '' })
  const [files, setFiles] = useState<UploadedFile[]>([])
  const [uploading, setUploading] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState('')
  const [pending, startTransition] = useTransition()
  const submissionId = useRef<string | null>(null)
  const submitting = useRef(false)
  const formRef = useRef<HTMLFormElement>(null)

  useEffect(() => {
    if (!message) return
    const invalid = formRef.current?.querySelector<HTMLElement>('[aria-invalid="true"]')
    const fallback = formRef.current?.querySelector<HTMLElement>('[data-form-error]')
    ;(invalid ?? fallback)?.focus()
  }, [errors, message])

  const onChangeFiles = useCallback((uploaded: UploadedFile[], busy: boolean) => {
    setFiles(uploaded)
    setUploading(busy)
  }, [])

  function changeField(field: keyof typeof values, value: string) {
    setValues((previous) => ({ ...previous, [field]: value }))
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current || uploading) return
    submissionId.current ??= crypto.randomUUID()
    const input = { id: submissionId.current, data: { ...values, budgetId: values.budgetId || null }, files: files.map((file) => ({ path: file.path, originalName: file.nombre_original })) }
    const parsed = craneDeliveryNoteSubmissionSchema.safeParse(input)
    if (!parsed.success) {
      setErrors(errorsByPath(parsed.error))
      setMessage('Revisá los datos marcados')
      return
    }
    submitting.current = true
    setErrors({})
    setMessage('')
    startTransition(async () => {
      try {
        const result = await sendOperatorNote(parsed.data)
        if (!result.ok) {
          setErrors(result.errors ?? {})
          setMessage(result.message)
          return
        }
        router.push(`/operator/notes/${result.datos.id}`)
      } catch {
        setMessage('Se interrumpió el envío. Reintentá sin volver a cargar los archivos.')
      } finally {
        submitting.current = false
      }
    })
  }

  return { values, errors, message, pending, uploading, formRef, changeField, onChangeFiles, submit }
}

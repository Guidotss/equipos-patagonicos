'use client'

import Link from 'next/link'
import { ChevronDown } from 'lucide-react'
import { Field } from '@/components/form/field'
import { SectionForm, SheetForm } from '@/components/form/structure-form'
import { UploadFiles } from '@/components/documents/upload-files'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useNoteForm } from './use-note-form'

export function NoteForm({
  equipmentId,
  today,
}: {
  equipmentId: string
  today: string
}) {
  const {
    values,
    errors,
    message,
    pending,
    uploading,
    formRef,
    changeField,
    prepareUpload,
    onChangeFiles,
    submit,
  } = useNoteForm(equipmentId, today)
  return (
    <form
      ref={formRef}
      onSubmit={submit}
      noValidate
      className="flex min-w-0 flex-col gap-5 pb-24"
    >
      {message ? (
        <div
          tabIndex={-1}
          data-form-error
          className="rounded-lg outline-ring focus-visible:outline-2"
        >
          <Alert variant="destructive">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        </div>
      ) : null}
      <fieldset
        disabled={pending}
        className="min-w-0 [&_:is(input,textarea,button,summary,[tabindex])]:scroll-mb-28"
      >
        <legend className="sr-only">Carga de remito</legend>
        <SheetForm>
          <div className="p-4 sm:p-6">
            <Field
              id="serviceDate"
              label="Fecha del servicio"
              error={errors['data.serviceDate']}
            >
              <Input
                id="serviceDate"
                type="date"
                required
                value={values.serviceDate}
                onChange={(event) =>
                  changeField('serviceDate', event.target.value)
                }
                aria-describedby="link-note-help"
              />
            </Field>
            <p
              id="link-note-help"
              className="mt-2 text-sm text-muted-foreground"
            >
              Administración lo vinculará después.
            </p>
          </div>
          <SectionForm titulo="Archivos" stacked>
            <div
              id="files"
              tabIndex={-1}
              aria-invalid={Boolean(errors.files)}
              aria-describedby={errors.files ? 'files-error' : undefined}
            >
              <UploadFiles
                disabled={pending}
                uploadPreparer={prepareUpload}
                onChange={onChangeFiles}
              />
              {errors.files ? (
                <p id="files-error" className="mt-3 text-sm text-destructive">
                  {errors.files}
                </p>
              ) : null}
            </div>
          </SectionForm>
          <details className="group">
            <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring sm:px-6 [&::-webkit-details-marker]:hidden">
              <span className="space-y-1">
                <span className="block font-semibold">Datos opcionales</span>
                <span className="block text-sm text-muted-foreground">
                  Número, cliente, trabajo y observaciones.
                </span>
              </span>
              <ChevronDown
                className="size-4 shrink-0 text-muted-foreground group-open:rotate-180"
                aria-hidden
              />
            </summary>
            <div className="grid gap-4 px-4 pt-2 pb-4 sm:grid-cols-2 sm:px-6 sm:pb-6">
              <Field
                id="number"
                label="Número de remito"
                error={errors['data.number']}
              >
                <Input
                  id="number"
                  maxLength={100}
                  value={values.number}
                  onChange={(event) =>
                    changeField('number', event.target.value)
                  }
                />
              </Field>
              <Field
                id="customerName"
                label="Cliente o lugar del trabajo"
                error={errors['data.customerName']}
              >
                <Input
                  id="customerName"
                  maxLength={2000}
                  value={values.customerName}
                  onChange={(event) =>
                    changeField('customerName', event.target.value)
                  }
                />
              </Field>
              <Field
                id="workDescription"
                label="Descripción del trabajo"
                error={errors['data.workDescription']}
              >
                <Textarea
                  id="workDescription"
                  maxLength={2000}
                  rows={3}
                  value={values.workDescription}
                  onChange={(event) =>
                    changeField('workDescription', event.target.value)
                  }
                />
              </Field>
              <Field
                id="notes"
                label="Observaciones"
                error={errors['data.notes']}
              >
                <Textarea
                  id="notes"
                  maxLength={2000}
                  rows={3}
                  value={values.notes}
                  onChange={(event) => changeField('notes', event.target.value)}
                />
              </Field>
            </div>
          </details>
        </SheetForm>
      </fieldset>
      <div
        data-note-actions
        className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6"
      >
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
          {uploading ? (
            <p
              role="status"
              className="w-full text-sm text-muted-foreground sm:mr-auto sm:w-auto"
            >
              Subiendo archivos…
            </p>
          ) : null}
          <Button asChild variant="outline" className="h-11 px-5 max-sm:flex-1">
            <Link href="/operator">Cancelar</Link>
          </Button>
          <Button
            type="submit"
            disabled={pending || uploading}
            className="h-11 px-5 max-sm:flex-1"
          >
            {pending ? 'Enviando…' : 'Enviar remito'}
          </Button>
        </div>
      </div>
    </form>
  )
}

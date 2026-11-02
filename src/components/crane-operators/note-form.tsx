'use client'

import Link from 'next/link'
import { Field } from '@/components/form/field'
import { SectionForm, SheetForm } from '@/components/form/structure-form'
import { UploadFiles } from '@/components/documents/upload-files'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import type { CraneOperatorContext } from '@/lib/crane-operators/schemas'
import { prepareNoteUpload, useNoteForm } from './use-note-form'

export function NoteForm({ context, today }: { context: CraneOperatorContext; today: string }) {
  const { values, errors, message, pending, uploading, formRef, changeField, onChangeFiles, submit } = useNoteForm(today)
  const active = Boolean(context.equipment?.active)
  const selectedJob = context.jobs.find((job) => job.id === values.budgetId)
  return <form ref={formRef} onSubmit={submit} noValidate className="flex min-w-0 flex-col gap-5 pb-24">
    {message ? <div tabIndex={-1} data-form-error className="rounded-lg outline-ring focus-visible:outline-2"><Alert variant="destructive"><AlertDescription>{message}</AlertDescription></Alert></div> : null}
    <fieldset disabled={pending || !active} className="min-w-0">
      <legend className="sr-only">Carga de remito</legend>
      <SheetForm>
        <SectionForm titulo="Trabajo" stacked>
          <div className="flex flex-col gap-5">
            <Field id="budgetId" label="Presupuesto (opcional)" error={errors['data.budgetId']} help={values.budgetId ? 'Este remito quedará vinculado al presupuesto elegido.' : 'Administración lo vinculará después.'}>
              <NativeSelect id="budgetId" className="w-full" value={values.budgetId} onChange={(event) => changeField('budgetId', event.target.value)}>
                <NativeSelectOption value="">Trabajo sin presupuesto</NativeSelectOption>
                {context.jobs.map((job) => <NativeSelectOption key={job.id} value={job.id}>{job.number} · {job.customerName} · {job.subject}</NativeSelectOption>)}
              </NativeSelect>
            </Field>
            <div className="grid gap-5 sm:grid-cols-2">
              <Field id="serviceDate" label="Fecha del servicio" error={errors['data.serviceDate']}><Input id="serviceDate" type="date" required value={values.serviceDate} onChange={(event) => changeField('serviceDate', event.target.value)} /></Field>
              <Field id="number" label="Número de remito (opcional)" error={errors['data.number']}><Input id="number" maxLength={100} value={values.number} onChange={(event) => changeField('number', event.target.value)} /></Field>
            </div>
            {selectedJob ? <div className="flex flex-col gap-1 text-sm"><p className="text-muted-foreground">Cliente y lugar del presupuesto</p><p className="break-words">{selectedJob.customerName}</p>{selectedJob.location ? <p className="break-words text-muted-foreground">{selectedJob.location}</p> : null}</div> : <Field id="customerName" label="Cliente o lugar del trabajo" error={errors['data.customerName']}><Input id="customerName" required maxLength={2000} value={values.customerName} onChange={(event) => changeField('customerName', event.target.value)} /></Field>}
            <Field id="workDescription" label="Descripción del trabajo" error={errors['data.workDescription']}><Textarea id="workDescription" required maxLength={2000} rows={3} value={values.workDescription} onChange={(event) => changeField('workDescription', event.target.value)} /></Field>
          </div>
        </SectionForm>
        <SectionForm titulo="Archivos" stacked>
          <div id="files" tabIndex={-1} aria-invalid={Boolean(errors.files)} aria-describedby={errors.files ? 'files-error' : undefined}>
            <UploadFiles disabled={pending || !active} uploadPreparer={prepareNoteUpload} onChange={onChangeFiles} />
            {errors.files ? <p id="files-error" className="mt-3 text-sm text-destructive">{errors.files}</p> : null}
          </div>
        </SectionForm>
        <SectionForm titulo="Observaciones" stacked>
          <Field id="notes" label="Observaciones (opcional)" error={errors['data.notes']}><Textarea id="notes" maxLength={2000} rows={3} value={values.notes} onChange={(event) => changeField('notes', event.target.value)} /></Field>
        </SectionForm>
      </SheetForm>
    </fieldset>
    <div className="fixed inset-x-0 bottom-0 z-20 border-t bg-background px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-6">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-end gap-3">
        {uploading ? <p role="status" className="w-full text-sm text-muted-foreground sm:mr-auto sm:w-auto">Subiendo archivos…</p> : null}
        <Button asChild variant="outline" className="h-11 flex-1 sm:flex-none"><Link href="/operator">Cancelar</Link></Button>
        <Button type="submit" disabled={pending || uploading || !active} className="h-11 flex-1 sm:flex-none">{pending ? 'Enviando…' : 'Enviar remito'}</Button>
      </div>
    </div>
  </form>
}

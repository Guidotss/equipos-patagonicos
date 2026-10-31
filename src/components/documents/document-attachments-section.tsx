import { Card } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { UploadFiles } from './upload-files'

import { changeList } from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import type { DocumentFormState } from './use-document-form'

export function DocumentAttachmentsSection({
  filesExisting,
  quitar,
  setQuitar,
  clientId,
  pending,
  onChangeFiles,
  errors,
}: { filesExisting: NonNullable<DocumentFormProps['filesExisting']> } & Pick<
  DocumentFormState,
  'quitar' | 'setQuitar' | 'clientId' | 'pending' | 'onChangeFiles' | 'errors'
>) {
  return (
    <Card titulo="Adjuntar archivos">
      <div className="flex flex-col gap-3">
        {filesExisting.length ? (
          <ul className="flex flex-col gap-2">
            {filesExisting.map((archivo) => (
              <li
                key={archivo.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <a
                  href={`/documentos/archivos/${archivo.id}`}
                  target="_blank"
                  className={
                    quitar.includes(archivo.id)
                      ? 'truncate text-muted-foreground line-through'
                      : 'truncate text-primary underline underline-offset-4'
                  }
                >
                  {archivo.nombre_original}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setQuitar((list) => changeList(list, archivo.id, !list.includes(archivo.id)))}
                >
                  {quitar.includes(archivo.id) ? 'Conservar' : 'Quitar'}
                </Button>
              </li>
            ))}
          </ul>
        ) : null}
        <UploadFiles key={clientId} clientId={clientId} disabled={pending} onChange={onChangeFiles} />
        {errors.archivos ? <p className="text-sm text-destructive">{errors.archivos}</p> : null}
      </div>
    </Card>
  )
}

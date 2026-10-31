import { Card } from '@/components/form/card'
import { Button } from '@/components/ui/button'
import { UploadFiles } from './upload-files'

import { changeList } from './document-form-model'
import type { DocumentFormProps } from './document-form.types'
import type { DocumentFormState } from './use-document-form'

export function DocumentAttachmentsSection({
  filesExisting,
  removedFileIds: remove,
  setRemovedFileIds,
  clientId,
  pending,
  onChangeFiles,
  errors,
}: { filesExisting: NonNullable<DocumentFormProps['filesExisting']> } & Pick<
  DocumentFormState,
  'removedFileIds' | 'setRemovedFileIds' | 'clientId' | 'pending' | 'onChangeFiles' | 'errors'
>) {
  return (
    <Card titulo="Adjuntar archivos">
      <div className="flex flex-col gap-3">
        {filesExisting.length ? (
          <ul className="flex flex-col gap-2">
            {filesExisting.map((file) => (
              <li
                key={file.id}
                className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm"
              >
                <a
                  href={`/documentos/archivos/${file.id}`}
                  target="_blank"
                  className={
                    remove.includes(file.id)
                      ? 'truncate text-muted-foreground line-through'
                      : 'truncate text-primary underline underline-offset-4'
                  }
                >
                  {file.nombre_original}
                </a>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setRemovedFileIds((list) => changeList(list, file.id, !list.includes(file.id)))}
                >
                  {remove.includes(file.id) ? 'Conservar' : 'Quitar'}
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

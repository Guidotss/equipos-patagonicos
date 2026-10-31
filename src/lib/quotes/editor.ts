// Punto de entrada compatible con los consumidores existentes del editor de cotizaciones.
export { MESSAGE_CONFLICT, SELECT_EDITOR } from './editor/constants'
export { canSend, pendingListEditor, sourceFromEditor } from './editor/document'
export { newKey } from './editor/keys'
export { textPrice, textQuantity } from './editor/numbers'
export { reduceEditor } from './editor/reducer'
export { applyTemplate, statusFromRow, statusNew } from './editor/state'
export type {
  ActionEditor,
  BlockEditor,
  CatalogsEditor,
  FieldEditor,
  ItemEditor,
  PayloadSave,
  PendingList,
  RowEditor,
  StatusEditor,
  TemplateEditor,
} from './editor/types'
export { hasChanges, payloadSave, schemaStatusEditor } from './editor/validation'

import type { ActionConfirmable } from '@/lib/quotes/actions-status'
import type { StatusContext } from '@/lib/quotes/context-status'
import type { ContactEditor } from '@/lib/quotes/editor-screen'
import type { CatalogsEditor, StatusEditor } from '@/lib/quotes/editor/types'

export type QuoteEditorProps = {
  initial: StatusEditor
  catalogs: CatalogsEditor
  /** Contactos del cliente de `initial` (vacío en una nueva). */
  contacts: ContactEditor[]
  /** Hoy en Argentina ('YYYY-MM-DD'), calculado en el servidor. */
  today: string
  /** Envíos, vencimiento, aprobación y anterior (readStatusContext). Una nueva no tiene. */
  context?: StatusContext
  /** ?accion= de la URL: abre esa confirmación al entrar (la página la lee con actionFromParam). */
  actionInitial?: ActionConfirmable | null
}

import type { ActionConfirmable } from '@/lib/quotes/actions-status'
import type { ContextoStatus } from '@/lib/quotes/context-status'
import type { ContactEditor } from '@/lib/quotes/editor-screen'
import type { CatalogsEditor, StatusEditor } from '@/lib/quotes/editor/types'

export type QuoteEditorProps = {
  initial: StatusEditor
  catalogs: CatalogsEditor
  /** Contactos del cliente de `inicial` (vacío en una nueva). */
  contactos: ContactEditor[]
  /** Hoy en Argentina ('YYYY-MM-DD'), calculado en el servidor. */
  today: string
  /** Envíos, vencimiento, aprobación y anterior (leerContextoEstado). Una nueva no tiene. */
  contexto?: ContextoStatus
  /** ?accion= de la URL: abre esa confirmación al entrar (la página la lee con accionDesdeParametro). */
  actionInitial?: ActionConfirmable | null
}

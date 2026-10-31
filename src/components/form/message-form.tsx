import { Alert, AlertDescription } from '@/components/ui/alert'
import type { StatusForm } from '@/lib/forms'

/** Muestra el error general del formulario. Los éxitos se avisan con un toast. */
export function MessageForm({ estado }: { estado: StatusForm }) {
  if (estado.ok || !estado.message) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{estado.message}</AlertDescription>
    </Alert>
  )
}

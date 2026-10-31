import { Alert, AlertDescription } from '@/components/ui/alert'
import type { EstadoFormulario } from '@/lib/formularios'

/** Muestra el error general del formulario. Los éxitos se avisan con un toast. */
export function MensajeFormulario({ estado }: { estado: EstadoFormulario }) {
  if (estado.ok || !estado.mensaje) return null
  return (
    <Alert variant="destructive">
      <AlertDescription>{estado.mensaje}</AlertDescription>
    </Alert>
  )
}

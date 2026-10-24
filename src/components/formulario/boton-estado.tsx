import { Button } from '@/components/ui/button'

/** Botón Activar/Desactivar que envía una Server Action ya ligada al registro. */
export function BotonEstado({
  activo,
  accion,
  etiqueta,
}: {
  activo: boolean
  accion: () => Promise<void>
  etiqueta: string
}) {
  return (
    <form action={accion}>
      <Button type="submit" variant="outline" aria-label={`${activo ? 'Desactivar' : 'Activar'} ${etiqueta}`}>
        {activo ? 'Desactivar' : 'Activar'}
      </Button>
    </form>
  )
}

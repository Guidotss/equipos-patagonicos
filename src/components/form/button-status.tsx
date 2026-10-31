import { Button } from '@/components/ui/button'

/** Botón Activar/Desactivar que envía una Server Action ya ligada al registro. */
export function ButtonStatus({
  activo,
  accion,
  label,
  grande = false,
}: {
  activo: boolean
  accion: () => Promise<void>
  label: string
  /** Al lado del botón de guardar de una ficha, con su mismo alto. */
  grande?: boolean
}) {
  return (
    <form action={accion}>
      <Button
        type="submit"
        variant="outline"
        className={grande ? 'h-10 px-3.5 text-[15px]' : undefined}
        aria-label={`${activo ? 'Desactivar' : 'Activar'} ${label}`}
      >
        {activo ? 'Desactivar' : 'Activar'}
      </Button>
    </form>
  )
}

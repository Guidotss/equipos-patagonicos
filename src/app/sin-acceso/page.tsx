import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getEstadoSesion } from '@/lib/auth'
import { cerrarSesion } from '../login/actions'

export default async function SinAccesoPage() {
  const sesion = await getEstadoSesion()
  if (sesion.estado === 'activo') redirect('/')

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Tu usuario todavía no está habilitado</h1>
        <p className="text-sm text-muted-foreground">
          Pedile a un administrador que active tu cuenta
          {sesion.estado === 'inactivo' && sesion.email ? ` (${sesion.email})` : ''}.
        </p>
        <form action={cerrarSesion}>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  )
}

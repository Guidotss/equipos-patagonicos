import { redirect } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { getStatusSession } from '@/lib/auth'
import { cerrarSession } from '../login/actions'

export default async function WithoutAccesoPage() {
  const session = await getStatusSession()
  if (session.estado === 'activo') redirect('/')

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Tu usuario todavía no está habilitado</h1>
        <p className="text-sm text-muted-foreground">
          Pedile a un administrador que active tu cuenta
          {session.estado === 'inactivo' && session.email ? ` (${session.email})` : ''}.
        </p>
        <form action={cerrarSession}>
          <Button type="submit" variant="outline">
            Cerrar sesión
          </Button>
        </form>
      </div>
    </main>
  )
}

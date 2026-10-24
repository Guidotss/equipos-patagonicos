import Link from 'next/link'
import { Button } from '@/components/ui/button'

export default function NoEncontrado() {
  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">No encontramos esta página</h1>
        <p className="text-sm text-muted-foreground">Puede que el enlace esté mal o que el registro ya no exista.</p>
        <Button asChild>
          <Link href="/">Volver al inicio</Link>
        </Button>
      </div>
    </main>
  )
}

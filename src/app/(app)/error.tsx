'use client'

import { Button } from '@/components/ui/button'

export default function ErrorSeccion({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <section className="max-w-lg space-y-4">
      <h1 className="text-2xl font-semibold tracking-tight">Algo salió mal</h1>
      <p className="text-muted-foreground">
        No pudimos cargar esta sección. Probá de nuevo; si el problema sigue, avisale al administrador.
      </p>
      {error.digest ? <p className="text-xs text-muted-foreground">Código: {error.digest}</p> : null}
      <Button onClick={reset}>Reintentar</Button>
    </section>
  )
}

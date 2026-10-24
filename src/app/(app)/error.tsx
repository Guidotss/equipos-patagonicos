'use client'

import { Contenido } from '@/components/app-shell/encabezado'
import { Button } from '@/components/ui/button'

export default function ErrorSeccion({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <Contenido>
      <section className="max-w-lg space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">Algo salió mal</h1>
        <p className="text-muted-foreground">
          No pudimos cargar esta sección. Probá de nuevo; si el problema sigue, avisale al administrador.
        </p>
        {digest ? <p className="text-xs text-muted-foreground">Código: {digest}</p> : null}
        <Button onClick={() => retry()}>Reintentar</Button>
      </section>
    </Contenido>
  )
}

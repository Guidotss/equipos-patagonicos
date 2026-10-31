'use client'

import { Button } from '@/components/ui/button'

/**
 * Envuelve los layouts de primer nivel ((app), /sin-acceso), que no cubre (app)/error.tsx:
 * por ejemplo, cuando Auth no responde al validar la sesión.
 */
export default function ErrorPage({ error, retry }: { error: unknown; retry: () => void }) {
  const digest = error instanceof Error ? (error as Error & { digest?: string }).digest : undefined

  return (
    <main className="flex min-h-svh items-center justify-center p-4">
      <div className="max-w-sm space-y-4 text-center">
        <h1 className="text-xl font-semibold">Algo salió mal</h1>
        <p className="text-sm text-muted-foreground">
          No pudimos cargar la página. Probá de nuevo; si el problema sigue, avisale al administrador.
        </p>
        {digest ? <p className="text-xs text-muted-foreground">Código: {digest}</p> : null}
        <Button onClick={() => retry()}>Reintentar</Button>
      </div>
    </main>
  )
}

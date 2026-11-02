'use client'

import { Button } from '@/components/ui/button'

export default function OperatorError({ retry }: { error: unknown; retry: () => void }) {
  return <section className="flex flex-col items-start gap-4"><h1 className="text-2xl font-semibold">No pudimos cargar los remitos</h1><p className="text-muted-foreground">Reintentá. Si el problema sigue, avisale a administración.</p><Button className="min-h-11" onClick={() => retry()}>Reintentar</Button></section>
}

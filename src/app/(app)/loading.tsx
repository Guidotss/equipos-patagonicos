import { Content } from '@/components/app-shell/header'

export default function CargandoSection() {
  return (
    <div>
      <div aria-hidden className="h-14 border-b bg-background/90" />
      <Content>
        <p role="status" className="text-sm text-muted-foreground">Cargando sección…</p>
        <div aria-hidden className="space-y-6 motion-safe:animate-pulse">
          <div className="h-7 w-56 rounded-md bg-muted" />
          <div className="space-y-5 rounded-xl border p-4 md:p-6">
            <div className="h-10 max-w-sm rounded-lg bg-muted" />
            <div className="h-px bg-border" />
            <div className="h-4 w-3/4 rounded bg-muted" />
            <div className="h-4 w-2/3 rounded bg-muted" />
            <div className="h-4 w-1/2 rounded bg-muted" />
          </div>
        </div>
      </Content>
    </div>
  )
}

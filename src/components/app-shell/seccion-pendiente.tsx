export function SeccionPendiente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold tracking-tight">{titulo}</h1>
      <p className="text-muted-foreground">{descripcion}</p>
    </section>
  )
}

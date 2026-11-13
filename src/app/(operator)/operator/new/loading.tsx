export default function NewOperatorNoteLoading() {
  return (
    <>
      <p role="status" className="text-sm text-muted-foreground">
        Cargando formulario…
      </p>
      <div aria-hidden className="space-y-6 motion-safe:animate-pulse">
        <div className="h-8 w-52 rounded-md bg-muted" />
        <div className="h-20 rounded-xl bg-muted" />
        <div className="h-72 rounded-xl border bg-background" />
      </div>
    </>
  )
}

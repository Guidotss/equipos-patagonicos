/** Chip gris con el total, al lado del título de una lista (Clientes, Cotizaciones). */
export function Count({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-base font-medium text-muted-foreground tabular-nums">
      {children}
    </span>
  )
}

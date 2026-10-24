import { Building2, FileStack, PenLine, Truck } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'

export const metadata: Metadata = { title: 'Configuración' }

const SECCIONES = [
  { href: '/configuracion/empresa', titulo: 'Empresa', descripcion: 'Membrete, contacto e índice de actualización vigente.', icono: Building2 },
  { href: '/configuracion/firmantes', titulo: 'Firmantes', descripcion: 'Quiénes firman las cotizaciones.', icono: PenLine },
  { href: '/configuracion/equipos', titulo: 'Equipos', descripcion: 'Grúas que se ofrecen en las cotizaciones.', icono: Truck },
  { href: '/configuracion/plantillas', titulo: 'Plantillas', descripcion: 'Textos e ítems de las cotizaciones mensual y por jornada.', icono: FileStack },
]

export default function ConfiguracionPage() {
  return (
    <section className="space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
      <div className="grid gap-4 sm:grid-cols-2">
        {SECCIONES.map(({ href, titulo, descripcion, icono: Icono }) => (
          <Link key={href} href={href} className="rounded-xl focus-visible:outline-2 focus-visible:outline-ring">
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Icono className="size-4 text-primary" aria-hidden />
                  {titulo}
                </CardTitle>
                <CardDescription>{descripcion}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </section>
  )
}

import { Building2, ChevronRight, FileText, PenLine } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { BarraMigas, Contenido, EncabezadoSeccion } from '@/components/app-shell/encabezado'
import { IconoGrua } from '@/components/configuracion/equipos'

export const metadata: Metadata = { title: 'Configuración' }

const SECCIONES = [
  { href: '/configuracion/empresa', titulo: 'Empresa', descripcion: 'Membrete, contacto e índice de actualización vigente.', icono: Building2 },
  { href: '/configuracion/firmantes', titulo: 'Firmantes', descripcion: 'Quiénes firman las cotizaciones.', icono: PenLine },
  { href: '/configuracion/equipos', titulo: 'Equipos', descripcion: 'Grúas que se ofrecen en las cotizaciones.', icono: IconoGrua },
  { href: '/configuracion/plantillas', titulo: 'Plantillas', descripcion: 'Textos e ítems de las cotizaciones mensual y por jornada.', icono: FileText },
]

export default function ConfiguracionPage() {
  return (
    <>
      <BarraMigas migas={[{ texto: 'Configuración' }]} />
      <EncabezadoSeccion titulo="Configuración" descripcion="Datos que usan las cotizaciones y sus PDF." />
      <Contenido>
        <div className="grid gap-6 lg:grid-cols-2">
          {SECCIONES.map(({ href, titulo, descripcion, icono: Icono }) => (
            <Link
              key={href}
              href={href}
              className="group flex items-center gap-4 rounded-xl border bg-card p-4 shadow-sm transition hover:border-primary/30 hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring sm:gap-5 sm:p-6"
            >
              <span className="grid size-14 shrink-0 place-items-center rounded-xl bg-accent text-slate-600 transition-colors group-hover:text-primary sm:size-[88px]">
                <Icono className="size-7 stroke-[1.4] sm:size-10" aria-hidden />
              </span>
              <span className="min-w-0 flex-1 space-y-1">
                <span className="block text-lg font-medium tracking-tight sm:text-[22px]">{titulo}</span>
                <span className="block text-sm leading-snug text-foreground/80 sm:text-base">{descripcion}</span>
              </span>
              <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      </Contenido>
    </>
  )
}

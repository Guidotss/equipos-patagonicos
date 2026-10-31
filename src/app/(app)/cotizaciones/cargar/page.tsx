import { BarCrumbs } from '@/components/app-shell/header'
import { FormSpecial } from '@/components/quotes/specials/form-special'
import { todayArgentina } from '@/lib/format/dates'
export default function CargarQuotePage() {
  return <><BarCrumbs crumbs={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Cargar existente' }]} /><FormSpecial origen="importada" today={todayArgentina()} /></>
}

import { BarCrumbs } from '@/components/app-shell/header'
import { FormSpecial } from '@/components/quotes/specials/form-special'
import { todayArgentina } from '@/lib/format/dates'
export default function BudgetDirectoPage() {
  return <><BarCrumbs crumbs={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Presupuesto directo' }]} /><FormSpecial origen="directa" today={todayArgentina()} /></>
}

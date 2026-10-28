import { BarraMigas } from '@/components/app-shell/encabezado'
import { FormularioEspecial } from '@/components/cotizaciones/especiales/formulario-especial'
import { hoyArgentina } from '@/lib/format/fechas'
export default function PresupuestoDirectoPage() {
  return <><BarraMigas migas={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Presupuesto directo' }]} /><FormularioEspecial origen="directa" hoy={hoyArgentina()} /></>
}

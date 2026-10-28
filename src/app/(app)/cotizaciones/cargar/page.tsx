import { BarraMigas } from '@/components/app-shell/encabezado'
import { FormularioEspecial } from '@/components/cotizaciones/especiales/formulario-especial'
import { hoyArgentina } from '@/lib/format/fechas'
export default function CargarCotizacionPage() {
  return <><BarraMigas migas={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Cargar existente' }]} /><FormularioEspecial origen="importada" hoy={hoyArgentina()} /></>
}

import { PaginacionListado } from '@/components/listados/paginacion-listado'
import { hrefConFiltros, POR_PAGINA, type FiltrosLista } from '@/lib/cotizaciones/lista'

export function Paginacion({ filtros, total }: { filtros: FiltrosLista; total: number }) {
  return (
    <PaginacionListado
      total={total}
      pagina={filtros.pagina}
      tamano={POR_PAGINA}
      href={(pagina) => hrefConFiltros(filtros, { pagina })}
    />
  )
}

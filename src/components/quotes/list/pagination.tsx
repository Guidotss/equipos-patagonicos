import { PaginationListing } from '@/components/listings/pagination-listing'
import { hrefWithFilters, PER_PAGE, type FiltersList } from '@/lib/quotes/list'

export function Pagination({ filters, total }: { filters: FiltersList; total: number }) {
  return (
    <PaginationListing
      total={total}
      pagina={filters.pagina}
      tamano={PER_PAGE}
      href={(pagina) => hrefWithFilters(filters, { pagina })}
    />
  )
}

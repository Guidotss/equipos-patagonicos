import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ChevronRight } from 'lucide-react'
import { requireCraneOperator } from '@/lib/auth'
import { createClient } from '@/lib/supabase/server'
import {
  listCraneDeliveryNotes,
  listOperatorCranes,
} from '@/lib/crane-operators/queries'
import { HeaderForm } from '@/components/form/structure-form'
import { IconCrane } from '@/components/settings/icon-crane'
import { NoteList } from '@/components/crane-operators/note-list'
import { FrameListing } from '@/components/listings/frame-listing'
import { PaginationListing } from '@/components/listings/pagination-listing'

export const metadata: Metadata = { title: 'Mis remitos' }

export default async function OperatorHome({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>
}) {
  const user = await requireCraneOperator()
  const { page: rawPage } = await searchParams
  const page = rawPage && /^[1-9]\d{0,3}$/.test(rawPage) ? Number(rawPage) : 1
  const client = await createClient()
  const [cranes, history] = await Promise.all([
    listOperatorCranes(client),
    listCraneDeliveryNotes(client, { operatorId: user.id, page }),
  ])
  const validPage = Math.min(
    history.page,
    Math.max(1, Math.ceil(history.total / history.pageSize)),
  )
  if (page !== validPage)
    redirect(validPage === 1 ? '/operator' : `/operator?page=${validPage}`)
  return (
    <>
      <HeaderForm
        titulo="Mis remitos"
        descripcion="Remitos de los trabajos que realizaste."
      />
      <section aria-labelledby="available-cranes">
        <FrameListing
          tools={
            <div className="space-y-1">
              <h2 id="available-cranes" className="font-semibold">
                Grúas disponibles
              </h2>
              {cranes.length > 0 ? (
                <p className="text-sm text-muted-foreground">
                  Elegí la grúa que usaste para cargar el remito.
                </p>
              ) : null}
            </div>
          }
        >
          {cranes.length > 0 ? (
            <ul className="divide-y">
              {cranes.map((crane) => (
                <li key={crane.id}>
                  <Link
                    href={`/operator/new?equipment=${crane.id}`}
                    className="flex min-h-11 items-center gap-3 px-4 py-2.5 text-sm font-medium hover:bg-muted/50 focus-visible:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
                  >
                    <IconCrane
                      className="size-6 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                    <span className="min-w-0 flex-1 [overflow-wrap:anywhere]">
                      {crane.name}
                    </span>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="px-4 py-6 text-sm text-muted-foreground">
              No hay grúas activas para cargar remitos.
            </p>
          )}
        </FrameListing>
      </section>
      <FrameListing
        tools={<h2 className="font-semibold">Historial de remitos</h2>}
        pie={
          <PaginationListing
            total={history.total}
            pagina={page}
            tamano={history.pageSize}
            href={(next) => `/operator?page=${next}`}
          />
        }
      >
        <NoteList notes={history.notes} />
      </FrameListing>
    </>
  )
}

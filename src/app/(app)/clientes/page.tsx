import { Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { TablaClientes } from '@/components/clientes/tabla-clientes'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Clientes' }

export default async function ClientesPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = '' } = await searchParams
  const supabase = await createClient()
  const { data: clientes, error } = await supabase.rpc('buscar_clientes', { texto: q, limite: 200 })
  if (error) throw error

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Clientes</h1>
        <Button asChild>
          <Link href="/clientes/nuevo">
            <Plus className="size-4" aria-hidden />
            Nuevo cliente
          </Link>
        </Button>
      </div>

      <form role="search" className="flex max-w-md gap-2">
        <Input name="q" defaultValue={q} placeholder="Razón social, CUIT o contacto" aria-label="Buscar clientes" />
        <Button type="submit" variant="secondary">
          Buscar
        </Button>
      </form>

      {clientes.length === 0 ? (
        <p className="text-muted-foreground">
          {q ? `No hay clientes que coincidan con "${q}".` : 'Todavía no hay clientes cargados.'}
        </p>
      ) : (
        <TablaClientes clientes={clientes} />
      )}
    </section>
  )
}

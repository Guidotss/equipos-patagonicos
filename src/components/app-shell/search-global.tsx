'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'

export function FormularioBusquedaGlobal({ valor = '' }: { valor?: string }) {
  return (
    <form action="/buscar" method="get" role="search" aria-label="Búsqueda global" className="w-full">
      <InputGroup>
        <InputGroupInput name="q" type="search" defaultValue={valor} maxLength={200}
          placeholder="Buscar en el sistema…" aria-label="Buscar en todo el sistema" required />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit" size="icon-xs" aria-label="Buscar"><Search aria-hidden /></InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

export function BuscadorGlobal({ compacto = false }: { compacto?: boolean }) {
  if (!compacto) return <FormularioBusquedaGlobal />
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir búsqueda global"><Search aria-hidden /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar en todo el sistema</DialogTitle>
          <DialogDescription>Razón social, CUIT, cotización o número de documento.</DialogDescription>
        </DialogHeader>
        <FormularioBusquedaGlobal />
      </DialogContent>
    </Dialog>
  )
}

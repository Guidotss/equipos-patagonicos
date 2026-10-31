'use client'

import { Search } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'

export function FormSearchGlobal({ value = '' }: { value?: string }) {
  return (
    <form action="/buscar" method="get" role="search" aria-label="Búsqueda global" className="w-full">
      <InputGroup>
        <InputGroupInput name="q" type="search" defaultValue={value} maxLength={200}
          placeholder="Buscar en el sistema…" aria-label="Buscar en todo el sistema" required />
        <InputGroupAddon align="inline-end">
          <InputGroupButton type="submit" size="icon-xs" aria-label="Buscar"><Search aria-hidden /></InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </form>
  )
}

export function SearchGlobal({ compact = false }: { compact?: boolean }) {
  if (!compact) return <FormSearchGlobal />
  return (
    <Dialog>
      <DialogTrigger asChild><Button variant="ghost" size="icon" aria-label="Abrir búsqueda global"><Search aria-hidden /></Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Buscar en todo el sistema</DialogTitle>
          <DialogDescription>Razón social, CUIT, cotización o número de documento.</DialogDescription>
        </DialogHeader>
        <FormSearchGlobal />
      </DialogContent>
    </Dialog>
  )
}

'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SidebarNav } from './sidebar-nav'

export function MobileNav({ logo }: { logo: React.ReactNode }) {
  const [abierto, setAbierto] = useState(false)

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 bg-sidebar p-3">
        <SheetHeader className="px-2 pt-3 pb-6">
          <SheetTitle className="sr-only">Equipos Patagónicos</SheetTitle>
          {logo}
        </SheetHeader>
        <SidebarNav onNavigate={() => setAbierto(false)} />
      </SheetContent>
    </Sheet>
  )
}

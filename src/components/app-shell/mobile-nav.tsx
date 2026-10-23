'use client'

import { Menu } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { SidebarNav } from './sidebar-nav'

export function MobileNav() {
  const [abierto, setAbierto] = useState(false)

  return (
    <Sheet open={abierto} onOpenChange={setAbierto}>
      <SheetTrigger asChild>
        <Button variant="ghost" size="icon" className="md:hidden" aria-label="Abrir menú">
          <Menu className="size-5" />
        </Button>
      </SheetTrigger>
      <SheetContent side="left" className="w-64 p-4">
        <SheetHeader className="p-0 pb-4">
          <SheetTitle className="text-left text-primary">Equipos Patagónicos</SheetTitle>
        </SheetHeader>
        <SidebarNav onNavigate={() => setAbierto(false)} />
      </SheetContent>
    </Sheet>
  )
}

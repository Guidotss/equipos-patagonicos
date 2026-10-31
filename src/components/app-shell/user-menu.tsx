'use client'

import { ChevronDown, LogOut } from 'lucide-react'
import { useId } from 'react'
import { cerrarSession } from '@/app/login/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { iniciales } from '@/lib/format/text'

/** Menú del usuario: al pie del sidebar (lateral) o como avatar en la barra del celular. */
export function UserMenu({ nombre, email, lateral = false }: { nombre: string; email: string; lateral?: boolean }) {
  // El shell monta dos menús (sidebar y barra del celular): cada uno necesita su propio form.
  const formCerrarSession = useId()

  return (
    <>
      <form id={formCerrarSession} action={cerrarSession} className="hidden" />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {lateral ? (
            <Button
              variant="ghost"
              className="h-auto w-full justify-start gap-3 px-2 py-1.5 hover:bg-sidebar-accent/50"
              aria-label={`${nombre}, menú de usuario`}
            >
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                {iniciales(nombre)}
              </span>
              <span className="min-w-0 flex-1 truncate text-left text-[15px] font-normal">{nombre}</span>
              <ChevronDown className="text-muted-foreground" aria-hidden />
            </Button>
          ) : (
            <Button variant="ghost" size="icon" aria-label="Menú de usuario">
              <span className="flex size-8 items-center justify-center rounded-full bg-slate-200 text-xs font-semibold text-slate-700">
                {iniciales(nombre)}
              </span>
            </Button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent side={lateral ? 'top' : 'bottom'} align={lateral ? 'start' : 'end'} className="w-56">
          <DropdownMenuLabel className="font-normal">
            <p className="text-sm font-medium">{nombre}</p>
            <p className="truncate text-xs text-muted-foreground">{email}</p>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild onSelect={(evento) => evento.preventDefault()}>
            <button type="submit" form={formCerrarSession} className="w-full">
              <LogOut className="size-4" aria-hidden />
              Cerrar sesión
            </button>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </>
  )
}

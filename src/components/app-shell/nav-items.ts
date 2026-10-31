import { FileCheck2, FileText, Home, Settings, Users, type LucideIcon } from 'lucide-react'

export type NavItem = { href: string; label: string; icon: LucideIcon }

export const NAV_ITEMS: NavItem[] = [
  { href: '/', label: 'Inicio', icon: Home },
  { href: '/cotizaciones', label: 'Cotizaciones', icon: FileText },
  { href: '/presupuestos', label: 'Presupuestos', icon: FileCheck2 },
  { href: '/clientes', label: 'Clientes', icon: Users },
  { href: '/configuracion', label: 'Configuración', icon: Settings },
]

export function estaActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`)
}

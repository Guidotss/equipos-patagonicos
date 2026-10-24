import type { Metadata } from 'next'
import { EmpresaForm } from '@/components/configuracion/empresa-form'
import { requireUsuario } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { createClient } from '@/lib/supabase/server'
import { actualizarEmpresa } from '../actions'

export const metadata: Metadata = { title: 'Empresa' }

export default async function EmpresaPage() {
  const usuario = await requireUsuario()
  const supabase = await createClient()
  const { data: empresa, error } = await supabase.from('empresa_config').select('*').single()
  if (error) throw error

  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight">Empresa</h1>
        {usuario.rol === 'admin' ? null : (
          <p className="text-sm text-muted-foreground">Solo un administrador puede modificar estos datos.</p>
        )}
      </div>
      <EmpresaForm
        accion={actualizarEmpresa}
        inicial={{ ...empresa, cuit: empresa.cuit ? formatCuit(empresa.cuit) : '' }}
        soloLectura={usuario.rol !== 'admin'}
      />
    </section>
  )
}

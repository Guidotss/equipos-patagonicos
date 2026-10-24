import type { Metadata } from 'next'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
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
    <>
      <BarraMigas migas={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Empresa' }]} />
      <Contenido>
        <EncabezadoPagina
          titulo="Empresa"
          descripcion={
            usuario.rol === 'admin'
              ? 'Membrete, contacto e índice de actualización que se imprimen en cada cotización.'
              : 'Solo un administrador puede modificar estos datos.'
          }
        />
        <div className="max-w-3xl rounded-xl border bg-card p-6 shadow-tarjeta">
          <EmpresaForm
            accion={actualizarEmpresa}
            inicial={{ ...empresa, cuit: empresa.cuit ? formatCuit(empresa.cuit) : '' }}
            soloLectura={usuario.rol !== 'admin'}
          />
        </div>
      </Contenido>
    </>
  )
}

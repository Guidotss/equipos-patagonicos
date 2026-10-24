import type { Metadata } from 'next'
import { BarraMigas, Contenido } from '@/components/app-shell/encabezado'
import { EmpresaForm } from '@/components/configuracion/empresa-form'
import { requireUsuario } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { hoyArgentina } from '@/lib/format/fechas'
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
        <EmpresaForm
          accion={actualizarEmpresa}
          inicial={{ ...empresa, cuit: empresa.cuit ? formatCuit(empresa.cuit) : '' }}
          soloLectura={usuario.rol !== 'admin'}
          hoy={hoyArgentina()}
        />
      </Contenido>
    </>
  )
}

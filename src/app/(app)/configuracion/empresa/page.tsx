import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { EmpresaForm } from '@/components/configuracion/empresa-form'
import { requireUsuario } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { hoyArgentina } from '@/lib/format/fechas'
import { frasesConVariables } from '@/lib/plantillas/frases'
import { createClient } from '@/lib/supabase/server'
import { actualizarEmpresa } from '../actions'

export const metadata: Metadata = { title: 'Empresa' }

export default async function EmpresaPage() {
  const usuario = await requireUsuario()
  const supabase = await createClient()
  const [{ data: empresa, error }, { data: plantillas, error: errorPlantillas }] = await Promise.all([
    supabase.from('empresa_config').select('*').single(),
    supabase.from('plantillas').select('bloques').eq('activa', true),
  ])
  if (error) throw error
  if (errorPlantillas) throw errorPlantillas

  return (
    <>
      <BarraMigas migas={[{ texto: 'Configuración', href: '/configuracion' }, { texto: 'Empresa' }]} />
      <EmpresaForm
        accion={actualizarEmpresa}
        inicial={{ ...empresa, cuit: empresa.cuit ? formatCuit(empresa.cuit) : '' }}
        soloLectura={usuario.rol !== 'admin'}
        hoy={hoyArgentina()}
        frasesTarifas={frasesConVariables(plantillas, ['indice_base', 'proxima_actualizacion'])}
      />
    </>
  )
}

import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { EmpresaForm } from '@/components/configuracion/empresa-form'
import { requireUsuario } from '@/lib/auth'
import { formatCuit } from '@/lib/cuit'
import { hoyArgentina } from '@/lib/format/fechas'
import { leerBloques } from '@/lib/plantillas/contenido'
import { parsearFormato } from '@/lib/plantillas/formato'
import { variablesUsadas } from '@/lib/plantillas/variables'
import { createClient } from '@/lib/supabase/server'
import { actualizarEmpresa } from '../actions'

export const metadata: Metadata = { title: 'Empresa' }

/** Oraciones de las plantillas que usan el índice base o la próxima actualización, sin viñetas ni negritas. */
function frasesTarifas(plantillas: { bloques: unknown }[]): string[] {
  const frases = new Set<string>()
  for (const { bloques } of plantillas) {
    for (const bloque of leerBloques(bloques)) {
      for (const nodo of parsearFormato(bloque.contenido)) {
        const texto = nodo.segmentos.map((segmento) => segmento.texto).join('')
        if (variablesUsadas(texto).some((nombre) => nombre === 'indice_base' || nombre === 'proxima_actualizacion')) {
          frases.add(texto)
        }
      }
    }
  }
  return [...frases]
}

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
        frasesTarifas={frasesTarifas(plantillas)}
      />
    </>
  )
}

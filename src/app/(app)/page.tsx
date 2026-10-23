import { SeccionPendiente } from '@/components/app-shell/seccion-pendiente'
import { requireUsuario } from '@/lib/auth'

export default async function InicioPage() {
  const usuario = await requireUsuario()
  return (
    <SeccionPendiente
      titulo="Inicio"
      descripcion={`Hola, ${usuario.nombre}. Acá vas a ver las colas de trabajo: seguimiento de cotizaciones, presupuestos sin OC, remitos para facturar y cobranzas.`}
    />
  )
}

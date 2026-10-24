import { BarraMigas, Contenido, EncabezadoPagina } from './encabezado'

export function SeccionPendiente({ titulo, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <>
      <BarraMigas migas={[{ texto: titulo }]} />
      <Contenido>
        <EncabezadoPagina titulo={titulo} descripcion={descripcion} />
      </Contenido>
    </>
  )
}

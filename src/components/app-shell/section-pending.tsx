import { BarCrumbs, Content, HeaderPage } from './header'

export function SectionPending({ titulo: title, descripcion }: { titulo: string; descripcion: string }) {
  return (
    <>
      <BarCrumbs crumbs={[{ texto: title }]} />
      <Content>
        <HeaderPage titulo={title} descripcion={descripcion} />
      </Content>
    </>
  )
}

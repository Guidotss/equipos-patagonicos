import { Image, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import type { NodoFormato, Segmento } from '@/lib/plantillas/formato'
import { estilos } from './estilos'
import { RUTA_LOGO } from './fuentes'

type EstiloPdf = React.ComponentProps<typeof View>['style']
type EstiloImagen = React.ComponentProps<typeof Image>['style']

/** Logo arriba a la derecha. Cada formato puede pasar su tamaño de logo. */
export function Membrete({ logo = estilos.logo }: { logo?: EstiloImagen }) {
  return (
    <View style={estilos.membrete} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no tiene alt */}
      <Image src={RUTA_LOGO} style={logo} />
    </View>
  )
}

export function Segmentos({ segmentos }: { segmentos: Segmento[] }) {
  return (
    <>
      {segmentos.map((segmento, indice) => (
        <Text key={indice} style={segmento.negrita ? estilos.negrita : undefined}>
          {segmento.texto}
        </Text>
      ))}
    </>
  )
}

/** Texto con formato mínimo. Nivel 1 con el guion de los originales; nivel 2 con viñeta. */
export function TextoFormateado({ nodos, estilo }: { nodos: NodoFormato[]; estilo?: EstiloPdf }) {
  return (
    <View style={estilo}>
      {nodos.map((nodo, indice) =>
        nodo.tipo === 'parrafo' ? (
          <Text key={indice} style={estilos.parrafo}>
            <Segmentos segmentos={nodo.segmentos} />
          </Text>
        ) : (
          <View key={indice} style={estilos.vineta} wrap={false}>
            <Text style={nodo.nivel === 1 ? estilos.marcaVineta1 : estilos.marcaVineta2}>{nodo.nivel === 1 ? '-' : '•'}</Text>
            <Text style={estilos.textoVineta}>
              <Segmentos segmentos={nodo.segmentos} />
            </Text>
          </View>
        ),
      )}
    </View>
  )
}

/** Con `conLogo`, debajo va un logo más chico alineado a la izquierda (como en la por jornada original). */
export function Firma({ firmante, conLogo }: { firmante: DocumentoCotizacion['firmante']; conLogo?: boolean }) {
  if (!firmante) return null
  return (
    <View style={estilos.firma} wrap={false}>
      <Text>{firmante.nombre}</Text>
      {firmante.cargo ? <Text>{firmante.cargo}</Text> : null}
      {firmante.telefono ? <Text>{firmante.telefono}</Text> : null}
      {conLogo ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no tiene alt
        <Image src={RUTA_LOGO} style={estilos.logoFirma} />
      ) : null}
    </View>
  )
}

/** Con `linea`, arriba va una línea azul fina del ancho del cuerpo. */
export function Pie({ pie, linea }: { pie: DocumentoCotizacion['pie']; linea?: boolean }) {
  return (
    <View style={linea ? [estilos.pie, estilos.pieLinea] : estilos.pie} fixed>
      <Text>{pie.linea}</Text>
      {pie.web ? <Text>{pie.web}</Text> : null}
    </View>
  )
}

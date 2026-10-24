import { Image, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import type { NodoFormato, Segmento } from '@/lib/plantillas/formato'
import { estilos } from './estilos'
import { RUTA_LOGO } from './fuentes'

type EstiloPdf = React.ComponentProps<typeof View>['style']

export function Membrete() {
  return (
    <View style={estilos.membrete} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no tiene alt */}
      <Image src={RUTA_LOGO} style={estilos.logo} />
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

export function Firma({ firmante }: { firmante: DocumentoCotizacion['firmante'] }) {
  if (!firmante) return null
  return (
    <View style={estilos.firma} wrap={false}>
      <Text>{firmante.nombre}</Text>
      {firmante.cargo ? <Text>{firmante.cargo}</Text> : null}
      {firmante.telefono ? <Text>{firmante.telefono}</Text> : null}
    </View>
  )
}

export function Pie({ pie }: { pie: DocumentoCotizacion['pie'] }) {
  return (
    <View style={estilos.pie} fixed>
      <Text>{pie.linea}</Text>
      {pie.web ? <Text>{pie.web}</Text> : null}
    </View>
  )
}

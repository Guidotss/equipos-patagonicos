import { Image, Text, View } from '@react-pdf/renderer'
import { createContext, useContext } from 'react'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import type { NodoFormato, Segmento } from '@/lib/plantillas/formato'
import { partirVariables } from '@/lib/plantillas/variables'
import { estilos } from './estilos'
import { RUTA_LOGO } from './fuentes'

type EstiloPdf = React.ComponentProps<typeof View>['style']
type EstiloImagen = React.ComponentProps<typeof Image>['style']

/**
 * En la vista previa (renderizarCotizacion con resaltarVariables) las {{variables}} que quedaron sin completar
 * se pintan con fondo amarillo, como en el editor. En el PDF que se envía o se aprueba nunca quedan.
 */
export const ResaltarVariables = createContext(false)

/** Texto que puede tener {{variables}} sin completar. Va siempre adentro de un <Text>. */
export function TextoVariables({ texto }: { texto: string }) {
  const resaltar = useContext(ResaltarVariables)
  if (!resaltar || !texto.includes('{{')) return <>{texto}</>
  // partirVariables deja los nombres en las posiciones impares.
  return (
    <>
      {partirVariables(texto).map((parte, indice) =>
        indice % 2 === 1 ? (
          <Text key={indice} style={estilos.variable}>{`{{${parte}}}`}</Text>
        ) : (
          parte
        ),
      )}
    </>
  )
}

/** El número de la cotización; sin guardar todavía no tiene (la vista previa muestra la variable). */
export function textoNumero(numero: number | null): string {
  return numero === null ? '{{numero}}' : String(numero)
}

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
          <TextoVariables texto={segmento.texto} />
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

/** Con `linea` (la por jornada), arriba va una línea azul fina del ancho del cuerpo, en una posición fija. */
export function Pie({ pie, linea }: { pie: DocumentoCotizacion['pie']; linea?: boolean }) {
  return (
    <View style={[estilos.pie, linea ? estilos.pieJornada : estilos.pieMensual]} fixed>
      <Text style={estilos.pieDireccion}>{pie.linea}</Text>
      {pie.web ? <Text>{pie.web}</Text> : null}
    </View>
  )
}

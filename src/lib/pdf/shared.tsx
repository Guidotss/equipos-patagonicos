import { Image, Text, View } from '@react-pdf/renderer'
import type { DocumentQuote } from '@/lib/quotes/document'
import type { NodoFormat, Segmento } from '@/lib/templates/format'
import { partirVariables } from '@/lib/templates/variables'
import { styles } from './styles'
import { PATH_LOGO } from './fonts'

type StylePdf = React.ComponentProps<typeof View>['style']
type StyleImagen = React.ComponentProps<typeof Image>['style']

/**
 * Texto que puede tener {{variables}} sin completar. Va siempre adentro de un <Text>.
 * Con `resaltar` (la vista previa: renderizarCotizacion con resaltarVariables) las variables se pintan con fondo
 * amarillo, como en el editor. En el PDF que se envía o se aprueba nunca quedan.
 * Va por prop y no por un contexto de React: las rutas de Next empaquetan estos componentes con el React de
 * servidor (sin createContext ni useContext) y react-pdf, que se carga sin empaquetar, los dibuja con otro React.
 */
export function TextVariables({ texto, highlight = false }: { texto: string; highlight?: boolean }) {
  if (!highlight || !texto.includes('{{')) return <>{texto}</>
  // partirVariables deja los nombres en las posiciones impares.
  return (
    <>
      {partirVariables(texto).map((parte, index) =>
        index % 2 === 1 ? (
          <Text key={index} style={styles.variable}>{`{{${parte}}}`}</Text>
        ) : (
          parte
        ),
      )}
    </>
  )
}

/** El número de la cotización; sin guardar todavía no tiene (la vista previa muestra la variable). */
export function textNumber(numero: number | null): string {
  return numero === null ? '{{numero}}' : String(numero)
}

/** Logo arriba a la derecha. Cada formato puede pasar su tamaño de logo. */
export function Letterhead({ logo = styles.logo }: { logo?: StyleImagen }) {
  return (
    <View style={styles.letterhead} fixed>
      {/* eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no tiene alt */}
      <Image src={PATH_LOGO} style={logo} />
    </View>
  )
}

export function Segmentos({ segmentos, highlight }: { segmentos: Segmento[]; highlight?: boolean }) {
  return (
    <>
      {segmentos.map((segmento, index) => (
        <Text key={index} style={segmento.negrita ? styles.negrita : undefined}>
          <TextVariables texto={segmento.texto} highlight={highlight} />
        </Text>
      ))}
    </>
  )
}

/** Texto con formato mínimo. Nivel 1 con el guion de los originales; nivel 2 con viñeta. */
export function TextFormatted({
  nodos,
  style,
  highlight,
}: {
  nodos: NodoFormat[]
  style?: StylePdf
  highlight?: boolean
}) {
  return (
    <View style={style}>
      {nodos.map((nodo, index) =>
        nodo.tipo === 'parrafo' ? (
          <Text key={index} style={styles.parrafo}>
            <Segmentos segmentos={nodo.segmentos} highlight={highlight} />
          </Text>
        ) : (
          <View key={index} style={styles.vineta} wrap={false}>
            <Text style={nodo.nivel === 1 ? styles.markVineta1 : styles.markVineta2}>{nodo.nivel === 1 ? '-' : '•'}</Text>
            <Text style={styles.textVineta}>
              <Segmentos segmentos={nodo.segmentos} highlight={highlight} />
            </Text>
          </View>
        ),
      )}
    </View>
  )
}

/** Con `conLogo`, debajo va un logo más chico alineado a la izquierda (como en la por jornada original). */
export function Signature({ firmante, withLogo }: { firmante: DocumentQuote['firmante']; withLogo?: boolean }) {
  if (!firmante) return null
  return (
    <View style={styles.signature} wrap={false}>
      <Text>{firmante.nombre}</Text>
      {firmante.cargo ? <Text>{firmante.cargo}</Text> : null}
      {firmante.telefono ? <Text>{firmante.telefono}</Text> : null}
      {withLogo ? (
        // eslint-disable-next-line jsx-a11y/alt-text -- Image de react-pdf no tiene alt
        <Image src={PATH_LOGO} style={styles.logoSignature} />
      ) : null}
    </View>
  )
}

/** Con `linea` (la por jornada), arriba va una línea azul fina del ancho del cuerpo, en una posición fija. */
export function Footer({ pie: footer, line }: { pie: DocumentQuote['pie']; line?: boolean }) {
  return (
    <View style={[styles.pie, line ? styles.footerDaily : styles.footerMonthly]} fixed>
      <Text style={styles.footerDireccion}>{footer.line}</Text>
      {footer.web ? <Text>{footer.web}</Text> : null}
    </View>
  )
}

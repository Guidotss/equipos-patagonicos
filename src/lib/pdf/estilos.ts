import { StyleSheet } from '@react-pdf/renderer'
import { FAMILIA } from './fuentes'

export const AZUL_LINK = '#1F4E9E'

export const estilos = StyleSheet.create({
  pagina: { fontFamily: FAMILIA, fontSize: 10, paddingTop: 36, paddingBottom: 64, paddingHorizontal: 56, lineHeight: 1.3 },
  membrete: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 18 },
  logo: { width: 175, height: 38 },
  fecha: { textAlign: 'right', marginBottom: 14 },
  negrita: { fontWeight: 'bold' },
  subrayado: { textDecoration: 'underline' },
  link: { color: AZUL_LINK, textDecoration: 'underline' },
  bloque: { marginTop: 10 },
  tituloBloque: { fontWeight: 'bold', marginBottom: 2 },
  parrafo: { marginBottom: 2 },
  vineta: { flexDirection: 'row', marginBottom: 1 },
  marcaVineta1: { width: 10 },
  marcaVineta2: { width: 10, marginLeft: 22 },
  textoVineta: { flex: 1 },
  firma: { marginTop: 22 },
  pie: { position: 'absolute', bottom: 24, left: 56, right: 56, fontSize: 7.5, textAlign: 'center', color: '#333333' },
})

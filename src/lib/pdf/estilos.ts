import { StyleSheet } from '@react-pdf/renderer'
import { FAMILIA } from './fuentes'

export const AZUL_LINK = '#1F4E9E'

// Logo de 437 × 95 px: el alto se calcula proporcional al ancho.
const altoLogo = (ancho: number) => Math.round((ancho * 95) / 437)

export const estilos = StyleSheet.create({
  pagina: { fontFamily: FAMILIA, fontSize: 10, paddingBottom: 64, lineHeight: 1.3 },
  // Márgenes medidos sobre los originales (A4 = 595 × 842 pt).
  paginaMensual: { paddingTop: 20, paddingLeft: 85, paddingRight: 25 },
  paginaJornada: { paddingTop: 36, paddingHorizontal: 56 },
  membrete: { flexDirection: 'row', justifyContent: 'flex-end', marginBottom: 18 },
  logo: { width: 175, height: 38 },
  logoMensual: { width: 157, height: altoLogo(157) },
  // Logo bajo la firma de la por jornada: en la 112711 mide 153,5 × 33,5 pt.
  logoFirma: { width: 154, height: altoLogo(154), marginTop: 8 },
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
  // Pie de la por jornada: línea a 795 pt del borde superior y renglones cada ~9,4 pt, como en la 112711.
  pieLinea: { bottom: 17.5, borderTopWidth: 0.75, borderTopColor: AZUL_LINK, paddingTop: 10, lineHeight: 1.25 },
})

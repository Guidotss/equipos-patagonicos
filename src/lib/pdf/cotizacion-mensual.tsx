import { Document, Link, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { formatMontoTabla } from '@/lib/format/montos'
import { Firma, Membrete, Pie, TextoFormateado, TextoVariables, textoNumero } from './comunes'
import { estilos } from './estilos'

const COLUMNAS = [
  { titulo: 'Ítem', ancho: '6%', alineado: 'center' },
  { titulo: 'Descripción', ancho: '39%', alineado: 'left' },
  { titulo: 'Cantidad', ancho: '9%', alineado: 'center' },
  { titulo: 'Precio', ancho: '14%', alineado: 'right' },
  { titulo: 'Moneda', ancho: '8%', alineado: 'center' },
  { titulo: 'Unid V.', ancho: '10%', alineado: 'center' },
  { titulo: 'Total', ancho: '14%', alineado: 'right' },
] as const

function Celda({ indice, children, negrita }: { indice: number; children: React.ReactNode; negrita?: boolean }) {
  const columna = COLUMNAS[indice]
  return (
    <Text style={{ width: columna.ancho, textAlign: columna.alineado, paddingHorizontal: 2, fontWeight: negrita ? 'bold' : 'normal' }}>
      {children}
    </Text>
  )
}

function TablaItems({ doc }: { doc: DocumentoCotizacion }) {
  return (
    <View style={{ fontSize: 8, marginTop: 28, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.75, paddingBottom: 3, marginBottom: 4 }} fixed>
        {COLUMNAS.map((columna, indice) => (
          <Celda key={columna.titulo} indice={indice} negrita>
            {columna.titulo}
          </Celda>
        ))}
      </View>
      {/* El interlineado se hereda de la página (10 × 1,3 = 13 pt): con 0,25 de padding cada fila mide 13,5 pt, como en el original. */}
      {doc.items.map((item) => (
        <View key={item.orden} style={{ flexDirection: 'row', paddingVertical: 0.25 }} wrap={false}>
          <Celda indice={0}>{item.orden}</Celda>
          <Celda indice={1}>
            <TextoVariables texto={item.descripcion} />
          </Celda>
          <Celda indice={2}>{item.cantidad.toLocaleString('es-AR')}</Celda>
          <Celda indice={3}>{item.precioUnitario === null ? '' : formatMontoTabla(item.precioUnitario)}</Celda>
          <Celda indice={4}>ARS</Celda>
          <Celda indice={5}>{item.unidad}</Celda>
          <Celda indice={6}>{item.total === null ? '' : formatMontoTabla(item.total)}</Celda>
        </View>
      ))}
      {doc.total === null ? null : (
        <View style={{ flexDirection: 'row', borderTopWidth: 0.75, paddingTop: 3, marginTop: 2 }}>
          <Text style={{ width: '86%', textAlign: 'right', fontWeight: 'bold', paddingHorizontal: 2 }}>Total</Text>
          <Celda indice={6} negrita>
            {formatMontoTabla(doc.total)}
          </Celda>
        </View>
      )}
    </View>
  )
}

export function CotizacionMensual({ doc }: { doc: DocumentoCotizacion }) {
  const { destinatario } = doc
  return (
    <Document title={`Cotización N° ${doc.numero ?? '{{numero}}'}`} language="es-AR">
      <Page size="A4" style={[estilos.pagina, estilos.paginaMensual]}>
        <Membrete logo={estilos.logoMensual} />
        <Text style={estilos.fecha}>{doc.encabezadoFecha}</Text>
        <View>
          <Text>{destinatario.razonSocial}</Text>
          {destinatario.atencion ? <Text>Atte. {destinatario.atencion}</Text> : null}
          {destinatario.email ? (
            <Link src={`mailto:${destinatario.email}`} style={estilos.link}>
              {destinatario.email}
            </Link>
          ) : null}
          <Text style={estilos.subrayado}>
            Cotización N° <TextoVariables texto={textoNumero(doc.numero)} />
          </Text>
        </View>

        <TablaItems doc={doc} />

        {doc.bloques.map((bloque, indice) => (
          <View key={indice} style={estilos.bloque}>
            {bloque.titulo ? (
              <Text style={estilos.tituloBloque} minPresenceAhead={40}>
                <TextoVariables texto={bloque.titulo} />
              </Text>
            ) : null}
            <TextoFormateado nodos={bloque.nodos} />
          </View>
        ))}

        <Firma firmante={doc.firmante} />
        <Pie pie={doc.pie} />
      </Page>
    </Document>
  )
}

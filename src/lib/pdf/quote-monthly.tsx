import { Document, Link, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentQuote } from '@/lib/quotes/document'
import { formatAmountTable } from '@/lib/format/amounts'
import { Signature, Letterhead, Footer, TextFormatted, TextVariables, textNumber } from './shared'
import { styles } from './styles'

const COLUMNAS = [
  { titulo: 'Ítem', ancho: '6%', alineado: 'center' },
  { titulo: 'Descripción', ancho: '39%', alineado: 'left' },
  { titulo: 'Cantidad', ancho: '9%', alineado: 'center' },
  { titulo: 'Precio', ancho: '14%', alineado: 'right' },
  { titulo: 'Moneda', ancho: '8%', alineado: 'center' },
  { titulo: 'Unid V.', ancho: '10%', alineado: 'center' },
  { titulo: 'Total', ancho: '14%', alineado: 'right' },
] as const

function Cell({ index, children, negrita }: { index: number; children: React.ReactNode; negrita?: boolean }) {
  const column = COLUMNAS[index]
  return (
    <Text style={{ width: column.ancho, textAlign: column.alineado, paddingHorizontal: 2, fontWeight: negrita ? 'bold' : 'normal' }}>
      {children}
    </Text>
  )
}

function TableItems({ doc, highlight }: { doc: DocumentQuote; highlight?: boolean }) {
  return (
    <View style={{ fontSize: 8, marginTop: 28, marginBottom: 18 }}>
      <View style={{ flexDirection: 'row', borderBottomWidth: 0.75, paddingBottom: 3, marginBottom: 4 }} fixed>
        {COLUMNAS.map((column, index) => (
          <Cell key={column.titulo} index={index} negrita>
            {column.titulo}
          </Cell>
        ))}
      </View>
      {/* El interlineado se hereda de la página (10 × 1,3 = 13 pt): con 0,25 de padding cada fila mide 13,5 pt, como en el original. */}
      {doc.items.map((item) => (
        <View key={item.orden} style={{ flexDirection: 'row', paddingVertical: 0.25 }} wrap={false}>
          <Cell index={0}>{item.orden}</Cell>
          <Cell index={1}>
            <TextVariables texto={item.descripcion} highlight={highlight} />
          </Cell>
          <Cell index={2}>{item.cantidad.toLocaleString('es-AR')}</Cell>
          <Cell index={3}>{item.priceUnitario === null ? '' : formatAmountTable(item.priceUnitario)}</Cell>
          <Cell index={4}>ARS</Cell>
          <Cell index={5}>{item.unidad}</Cell>
          <Cell index={6}>{item.total === null ? '' : formatAmountTable(item.total)}</Cell>
        </View>
      ))}
      {doc.total === null ? null : (
        <View style={{ flexDirection: 'row', borderTopWidth: 0.75, paddingTop: 3, marginTop: 2 }}>
          <Text style={{ width: '86%', textAlign: 'right', fontWeight: 'bold', paddingHorizontal: 2 }}>Total</Text>
          <Cell index={6} negrita>
            {formatAmountTable(doc.total)}
          </Cell>
        </View>
      )}
    </View>
  )
}

export function QuoteMonthly({ doc, highlight }: { doc: DocumentQuote; highlight?: boolean }) {
  const { destinatario } = doc
  return (
    <Document title={`Cotización N° ${doc.numero ?? '{{numero}}'}`} language="es-AR">
      <Page size="A4" style={[styles.pagina, styles.pageMonthly]}>
        <Letterhead logo={styles.logoMonthly} />
        <Text style={styles.fecha}>{doc.encabezadoFecha}</Text>
        <View>
          <Text>{destinatario.razonSocial}</Text>
          {destinatario.atencion ? <Text>Atte. {destinatario.atencion}</Text> : null}
          {destinatario.email ? (
            <Link src={`mailto:${destinatario.email}`} style={styles.link}>
              {destinatario.email}
            </Link>
          ) : null}
          <Text style={styles.subrayado}>
            Cotización N° <TextVariables texto={textNumber(doc.numero)} highlight={highlight} />
          </Text>
        </View>

        <TableItems doc={doc} highlight={highlight} />

        {doc.bloques.map((block, index) => (
          <View key={index} style={styles.bloque}>
            {block.titulo ? (
              <Text style={styles.titleBlock} minPresenceAhead={40}>
                <TextVariables texto={block.titulo} highlight={highlight} />
              </Text>
            ) : null}
            <TextFormatted nodos={block.nodos} highlight={highlight} />
          </View>
        ))}

        <Signature firmante={doc.firmante} />
        <Footer pie={doc.pie} />
      </Page>
    </Document>
  )
}

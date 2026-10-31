import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentQuote } from '@/lib/quotes/document'
import { formatAmountDaily } from '@/lib/format/amounts'
import { Signature, Letterhead, Footer, TextFormatted, TextVariables } from './shared'
import { styles } from './styles'

type Item = DocumentQuote['items'][number]

/** Agrupa los ítems por sección respetando el orden en que aparecen. */
function agruparBySection(items: Item[]): { seccion: string; items: Item[] }[] {
  const groups: { seccion: string; items: Item[] }[] = []
  for (const item of items) {
    const last = groups.at(-1)
    if (last && last.seccion === item.seccion) last.items.push(item)
    else groups.push({ seccion: item.seccion, items: [item] })
  }
  return groups
}

function withDosPuntos(title: string) {
  return title.endsWith(':') ? title : `${title}:`
}

const body = { fontWeight: 'bold' as const, fontSize: 10.5 }

export function QuoteDaily({ doc, highlight }: { doc: DocumentQuote; highlight?: boolean }) {
  const { destinatario } = doc
  const withTitle = doc.bloques.filter((block) => block.titulo)
  const withoutTitle = doc.bloques.filter((block) => !block.titulo)

  return (
    <Document title={`Cotización N° ${doc.numero ?? '{{numero}}'}`} language="es-AR">
      <Page size="A4" style={[styles.pagina, styles.pageDaily, body]}>
        <Letterhead />
        <Text style={styles.fecha}>{doc.encabezadoFecha}</Text>

        <View style={{ marginBottom: 12 }}>
          <Text>Señores</Text>
          <Text style={{ fontSize: 12 }}>{destinatario.razonSocial}</Text>
          {destinatario.cuit ? <Text>Cuit: {destinatario.cuit}</Text> : null}
          {destinatario.atencion ? <Text>Atte. {destinatario.atencion}</Text> : null}
        </View>

        {doc.asunto ? (
          <Text style={{ marginBottom: 10 }}>
            <TextVariables texto={doc.asunto} highlight={highlight} />
          </Text>
        ) : null}
        {doc.intro ? (
          <Text style={{ marginBottom: 10 }}>
            <TextVariables texto={doc.intro} highlight={highlight} />
          </Text>
        ) : null}

        {withTitle.map((block, index) => (
          <View key={index} style={styles.bloque}>
            <Text style={[styles.subrayado, { marginBottom: 4 }]} minPresenceAhead={40}>
              <TextVariables texto={withDosPuntos(block.titulo)} highlight={highlight} />
            </Text>
            <TextFormatted nodos={block.nodos} highlight={highlight} />
          </View>
        ))}

        {agruparBySection(doc.items).map((grupo, index) => (
          <View key={index} style={{ marginTop: 16 }} wrap={false}>
            <Text style={[styles.subrayado, { marginBottom: 4 }]}>{withDosPuntos(grupo.seccion || 'Precios')}</Text>
            {grupo.items.map((item) => (
              <View key={item.orden} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ flex: 1, paddingRight: 12 }}>
                  <TextVariables texto={item.descripcion} highlight={highlight} />
                  {item.cantidad === 1 ? '' : ` (x${item.cantidad.toLocaleString('es-AR')})`}
                </Text>
                <Text style={{ width: 150, textAlign: 'right' }}>
                  {item.priceUnitario === null ? '' : `${formatAmountDaily(item.priceUnitario)} más IVA`}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {doc.total === null ? null : (
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Text style={{ flex: 1 }}>Total</Text>
            <Text style={{ width: 150, textAlign: 'right' }}>{formatAmountDaily(doc.total)} más IVA</Text>
          </View>
        )}

        {withoutTitle.map((block, index) => (
          <TextFormatted key={index} nodos={block.nodos} highlight={highlight} style={{ marginTop: 16 }} />
        ))}

        <Signature firmante={doc.firmante} withLogo />
        <Footer pie={doc.pie} line />
      </Page>
    </Document>
  )
}

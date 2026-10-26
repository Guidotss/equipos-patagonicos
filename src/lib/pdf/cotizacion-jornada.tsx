import { Document, Page, Text, View } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { formatMontoJornada } from '@/lib/format/montos'
import { Firma, Membrete, Pie, TextoFormateado, TextoVariables } from './comunes'
import { estilos } from './estilos'

type Item = DocumentoCotizacion['items'][number]

/** Agrupa los ítems por sección respetando el orden en que aparecen. */
function agruparPorSeccion(items: Item[]): { seccion: string; items: Item[] }[] {
  const grupos: { seccion: string; items: Item[] }[] = []
  for (const item of items) {
    const ultimo = grupos.at(-1)
    if (ultimo && ultimo.seccion === item.seccion) ultimo.items.push(item)
    else grupos.push({ seccion: item.seccion, items: [item] })
  }
  return grupos
}

function conDosPuntos(titulo: string) {
  return titulo.endsWith(':') ? titulo : `${titulo}:`
}

const cuerpo = { fontWeight: 'bold' as const, fontSize: 10.5 }

export function CotizacionJornada({ doc }: { doc: DocumentoCotizacion }) {
  const { destinatario } = doc
  const conTitulo = doc.bloques.filter((bloque) => bloque.titulo)
  const sinTitulo = doc.bloques.filter((bloque) => !bloque.titulo)

  return (
    <Document title={`Cotización N° ${doc.numero ?? '{{numero}}'}`} language="es-AR">
      <Page size="A4" style={[estilos.pagina, estilos.paginaJornada, cuerpo]}>
        <Membrete />
        <Text style={estilos.fecha}>{doc.encabezadoFecha}</Text>

        <View style={{ marginBottom: 12 }}>
          <Text>Señores</Text>
          <Text style={{ fontSize: 12 }}>{destinatario.razonSocial}</Text>
          {destinatario.cuit ? <Text>Cuit: {destinatario.cuit}</Text> : null}
          {destinatario.atencion ? <Text>Atte. {destinatario.atencion}</Text> : null}
        </View>

        {doc.asunto ? (
          <Text style={{ marginBottom: 10 }}>
            <TextoVariables texto={doc.asunto} />
          </Text>
        ) : null}
        {doc.intro ? (
          <Text style={{ marginBottom: 10 }}>
            <TextoVariables texto={doc.intro} />
          </Text>
        ) : null}

        {conTitulo.map((bloque, indice) => (
          <View key={indice} style={estilos.bloque}>
            <Text style={[estilos.subrayado, { marginBottom: 4 }]} minPresenceAhead={40}>
              <TextoVariables texto={conDosPuntos(bloque.titulo)} />
            </Text>
            <TextoFormateado nodos={bloque.nodos} />
          </View>
        ))}

        {agruparPorSeccion(doc.items).map((grupo, indice) => (
          <View key={indice} style={{ marginTop: 16 }} wrap={false}>
            <Text style={[estilos.subrayado, { marginBottom: 4 }]}>{conDosPuntos(grupo.seccion || 'Precios')}</Text>
            {grupo.items.map((item) => (
              <View key={item.orden} style={{ flexDirection: 'row', marginBottom: 4 }}>
                <Text style={{ flex: 1, paddingRight: 12 }}>
                  <TextoVariables texto={item.descripcion} />
                  {item.cantidad === 1 ? '' : ` (x${item.cantidad.toLocaleString('es-AR')})`}
                </Text>
                <Text style={{ width: 150, textAlign: 'right' }}>
                  {item.precioUnitario === null ? '' : `${formatMontoJornada(item.precioUnitario)} más IVA`}
                </Text>
              </View>
            ))}
          </View>
        ))}

        {doc.total === null ? null : (
          <View style={{ flexDirection: 'row', marginTop: 8 }}>
            <Text style={{ flex: 1 }}>Total</Text>
            <Text style={{ width: 150, textAlign: 'right' }}>{formatMontoJornada(doc.total)} más IVA</Text>
          </View>
        )}

        {sinTitulo.map((bloque, indice) => (
          <TextoFormateado key={indice} nodos={bloque.nodos} estilo={{ marginTop: 16 }} />
        ))}

        <Firma firmante={doc.firmante} conLogo />
        <Pie pie={doc.pie} linea />
      </Page>
    </Document>
  )
}

# Preparación del bloque financiero

Fecha: 2026-11-04. Revisión de fuentes, sin modificar datos ni saldos.

## Regla confirmada

El usuario eligió que un cheque cuente como cobrado **al acreditarse**. Recibirlo o alcanzar su vencimiento no acredita el importe automáticamente. Esta decisión se debe aplicar a saldos, resumen por trabajo e informes.

## Contratos actuales comprobados

- `documentos.monto` de una factura es total con IVA. El informe de facturación por grúa debe rotular esa unidad; no deducir neto dividiendo por una alícuota supuesta.
- Una OP registra cancelación bruta, incluidas retenciones. El modelo nuevo debe distinguir dinero acreditado de retenciones y cancelaciones anteriores cuyo medio no se conoce.
- `documento_presupuestos` es un vínculo documental, no un reparto monetario. Una OP puede vincularse a trabajos distintos de las facturas que aplica.
- `v_presupuestos` suma la totalidad de cada factura compartida en cada trabajo. Esto no duplica la cobranza global, pero impide sumar trabajos o atribuir ingresos por grúa con exactitud.
- Los comprobantes admiten fecha nula. `created_at` no representa emisión ni acreditación.
- `facturas_historicas.cobrado` acredita un cobro confirmado sin OP ni fecha de pago. Conservar su evidencia y protección.

Fuentes: `20261026100000_documentos.sql`, `20261026100100_documentos_vistas.sql`, `20261026100200_documentos_rpc.sql`, `20261028110000_documentos_pantallas.sql`, `20261029100000_facturas_historicas.sql`.

## Modelo recomendado para la implementación siguiente

Extender los comprobantes con asignaciones explícitas, en lugar de repartir por cantidad de trabajos o prorratear automáticamente:

1. `invoice_allocations`: porción de factura atribuida a trabajo/equipo, con estado que distinga equipo conocido, sin equipo, equipo desconocido y reparto pendiente.
2. `payment_instruments`: medios de una OP, con importe propio, recepción, vencimiento y acreditación. Cheques recibidos, acreditados, rechazados y anulados; retenciones separadas.
3. `payment_allocations`: porción de cada instrumento aplicada a trabajo/equipo y factura opcional. Un anticipo puede aplicarse después sin generar un segundo cobro.

Los cálculos son autoritativos en SQL, con importes decimales exactos y bloqueo común por cliente antes de bloquear documentos. Las tablas y RPC nuevas mantienen permisos comerciales de staff y deniegan acceso a gruistas. `op_facturas` debe ser una proyección compatible o dejar de ser fuente de cálculo; nunca sumar dos veces sus importes.

## Invariantes y migración

- Instrumentos suman el importe de OP; asignaciones no superan cada instrumento.
- Aplicaciones acreditadas más reservas de cheques vigentes no exceden la factura ni su parte atribuida.
- Misma clientela entre comprobantes y trabajos; sin aplicar pagos nuevos a NC o facturas anuladas.
- Facturado, cobrado y saldo del trabajo se derivan de asignaciones únicas; un anticipo puede producir crédito a favor.
- Anular una factura no borra dinero recibido; anular una OP excluye sus importes y reservas. Restaurar vuelve a controlar límites y concurrencia.
- No cambiar atribuciones financieras al editar la grúa del presupuesto o reasignar un gruista.
- Para una factura histórica con un trabajo, asignar ese trabajo, sin inventar grúa. Con varios trabajos, conservar el total en «Sin distribuir» hasta que se indiquen importes concretos.
- Conservar cancelaciones previas reconocidas, sin inventar medio ni fecha. Remanentes de OP anteriores quedan pendientes de clasificación; no convertirlos en efectivo cobrado.
- Conservar cobros históricos protegidos sin crear OP ficticias. Referencias históricas financieras deben sobrevivir a eliminación permitida de cotizaciones anuladas.
- El informe mantiene grupos visibles de importes sin equipo, sin distribuir o sin fecha acreditada; los filtros temporales no deben fecharlos hoy ni ocultarlos sin explicación.

## Definiciones adicionales confirmadas

- 30/45/60 días se guarda **solo como condición de pago en texto**. No generar cuotas, importes ni vencimientos automáticamente desde `condicion_pago`/`datos.forma_pago`. Las fechas de cada cheque son datos propios de ese instrumento.
- Mostrar **Dinero acreditado** y **Retenciones** por separado. Ambos suman el importe **cancelado** de la factura. Por tanto, `saldo = facturado - cancelado`; dinero acreditado no incluye retenciones.
- Conservar las cancelaciones anteriores cuyo medio/desglose no está identificado en una categoría explícita; no convertirlas en dinero acreditado ni inventar una distribución entre dinero y retenciones.

## Casos de aceptación del próximo bloque

Factura compartida con reparto desigual y pago parcial; dos cheques con vencimientos distintos y acreditación por separado; cheque rechazado que no reduce saldo; anticipo aplicado después sin duplicarse; anulación/restauración con reservas concurrentes; importes con centavos exactos; cobros históricos sin fecha; conciliación global de asignados y pendientes; permisos de gruista denegados antes de validar payload.

Se conserva la prueba que cuenta una factura compartida una sola vez en Inicio (`tests/integration/home-search.test.ts`) y las pruebas de evidencia de importación histórica y grúa original del parte.

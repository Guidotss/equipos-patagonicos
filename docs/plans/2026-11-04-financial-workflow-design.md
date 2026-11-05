# Cobros y atribución financiera

Fecha: 2026-11-04. Continuación autorizada de los pendientes de Obsidian.

## Decisiones del usuario

- Los cheques cuentan al acreditarse, nunca por recibirlos o alcanzar el vencimiento.
- 30/45/60 días es una condición de pago descriptiva. No generar cuotas ni fechas automáticamente.
- Mostrar dinero acreditado y retenciones por separado; ambos suman el importe cancelado de la factura.
- La facturación guardada actualmente incluye IVA. El informe conserva esa unidad y usa la fecha documental de factura.

## Arquitectura elegida

Conservar `documentos` y extenderlo con asignaciones explícitas. Añadir solo medios a la OP no resolvería qué trabajo cancela cada importe; un libro de doble partida excedería el alcance. Se eligen tres tablas de negocio y una bitácora pequeña de cambios. `op_facturas` permanece como proyección de compatibilidad, nunca como segunda autoridad de cálculo.

Nuevos identificadores y contratos técnicos en inglés; textos y comentarios en español. Mantener claves españolas existentes y sus comportamientos no financieros. Importes `numeric(14,2)`, positivos, sin redondear silenciosamente entradas de tres decimales. El navegador suma centavos enteros y envía importes decimales explícitos; SQL valida límites en transacción.

El modelo, las operaciones y las vistas se consolidan antes de publicar en **una sola migración financiera aún no aplicada a bases persistentes**, `20261104120000_financial_allocations.sql`, dentro de un único BEGIN/COMMIT. Las tareas siguientes agregan sus secciones a ese archivo sin publicar etapas parciales. Esto evita una ventana entre archivos en la que el servidor anterior pueda crear comprobantes que no tengan asignaciones nuevas. Las migraciones publicadas anteriores nunca se modifican.

### Modelo

`documentos.payment_condition` es texto, vacío fuera de OP. `financial_version` comienza en 1 y protege modificaciones financieras frente a formularios desactualizados.

`invoice_allocations`: factura, trabajo y snapshot de número/asunto, equipo y snapshot de nombre, estado de equipo `assigned|none|unknown`, importe, `historical_settled_amount` y procedencia. UUID de trabajo histórico sin FK destructiva; todo destino nuevo se valida contra un presupuesto real del mismo cliente. Trabajo nulo significa Sin distribuir e implica equipo desconocido. Sin equipo confirmado se distingue de equipo desconocido. Todas las porciones suman exactamente la factura, pudiendo quedar una porción explícita sin distribuir.

`payment_instruments`: OP, medio `cash|transfer|check|withholding|legacy_unidentified`, importe, estado, recepción, vencimiento, fecha efectiva, referencia y banco. Efectivo/transferencia confirmados suman dinero; cheque acreditado suma dinero; retención confirmada suma retenciones. Pendientes/rechazados/anulados no cancelan. Un cheque pendiente puede reservar una porción de factura, sin bajar su saldo.

`payment_allocations`: instrumento, trabajo y snapshot, factura opcional, importe y procedencia. No atribuir cobros a equipos: el reporte pedido es de facturación; este reparto solo necesita trabajo/factura. El remanente del instrumento sin asignar queda visible como importe del cliente. Un cobro de trabajo sin factura es un anticipo; aplicarlo después cambia su destino, no crea dinero.

`financial_events`: documento, actor, acción, versión, motivo y snapshots financieros anterior/nuevo. No es un libro contable. No admitir escrituras autenticadas directas ni modificar eventos anteriores. Correcciones de importes/destinos ya reconocidos y reversos deben registrar motivo; cambios de notas no reemplazan instrumentos.

### Invariantes

- Instrumentos vigentes suman la OP; asignaciones no superan cada instrumento.
- Aplicaciones reconocidas más reservas pendientes no superan factura ni su parte atribuida al trabajo.
- Todas las relaciones conservan cliente común. Aplicaciones nuevas solo a facturas activas distintas de NC.
- Una atribución nueva a factura debe coincidir con un trabajo de su reparto; la distribución desconocida heredada se conserva explícitamente.
- Una factura histórica tiene suma de `historical_settled_amount` exactamente igual a `facturas_historicas.cobrado`; cada porción está entre cero y su importe facturado. En no históricas ese campo es cero.
- Grúa del presupuesto y asignación del gruista no redistribuyen importes ya registrados.
- Anular OP excluye sus instrumentos y reservas. Anular factura elimina su facturación, pero conserva dinero recibido como crédito/anticipo del trabajo. Restaurar revalida límites; no recrea destinos que se hayan reasignado.
- Un instrumento rechazado se conserva; sustituirlo requiere una corrección explícita que retira el anterior y agrega el reemplazo. Para retirar todos los medios, anular la OP; no crear OP de importe cero.

### Migración conservadora

- Factura con un trabajo: atribuir 100% al trabajo, con equipo desconocido. No inferir grúa desde su asignación actual ni desde texto de remitos/facturas.
- Factura compartida: importe íntegro Sin distribuir, conservando vínculos. No repartir por partes iguales ni proporcionalmente.
- OP anterior: importe aplicado reconocido como cancelación anterior sin medio/fecha identificados; resto pendiente de clasificación. No inventar efectivo para ese remanente.
- Cobro histórico protegido: conservar `h.cobrado` como fuente global independiente, sin OP/instrumentos ficticios. Su atribución por trabajo va en `invoice_allocations.historical_settled_amount`. La vista global lee `h.cobrado` una sola vez; la del trabajo lee su reparto.
- Incluir anulados sin reactivarlos. Conservar archivos, evidencia, numeración y datos originales. Reimportación idempotente no reinicia repartos corregidos por el usuario.

### Mutaciones y concurrencia

Autorización → validar cliente → bloqueo transaccional común por cliente → hashes de importación/numeración → documentos en orden estable → presupuestos en orden estable → revalidar → escribir y auditar. Nunca tomar el bloqueo común después de un bloqueo de documento/cotización.

Mantener `registrar_documento` y `actualizar_documento` con su firma; transportar los campos nuevos en `p_datos.finance`. Colección omitida conserva, lista vacía quita si respeta invariantes. Una nueva OP sin medios falla con mensaje claro. Los remitos/OC conservan contratos; no perder la derivación/preservación de equipo implementada antes.

`change_payment_instrument_status` controla versión, transición, límites y auditoría. Anular/restaurar deben recibir versión esperada desde la UI para documentos financieros. Extender esas firmas con argumentos opcionales sin dejar overloads ambiguos (recrear firma y grants; no usar CASCADE). Llamadas antiguas de OC/remito siguen funcionando; para factura/OP se exige versión en las acciones nuevas y se rechaza la modificación financiera antigua incompleta.

Reordenar también `importar_factura_historica` (cliente antes de hashes) y `aprobar_con_orden_compra` (cliente antes de cotización). `revertir_aprobacion`/`borrar_cotizacion` verifican importes financieros activos y conservan referencias históricas; no deben permitir borrar un trabajo con anticipo activo no reasignado.

Añadir un control diferido de integridad de documentos financieros que rechace al COMMIT un comprobante sin modelo completo o con sumas inconsistentes. Es una validación de solo lectura, sin tomar tardíamente el bloqueo del cliente: las RPC normales ya lo toman al principio. También cubre una invocación del servidor anterior que hubiese comenzado antes del cambio de funciones y estuviese esperando el DDL; debe fallar atómicamente, nunca confirmar una factura sin reparto. Al final de la migración única, comparar las vistas nuevas contra el snapshot anterior antes del COMMIT.

Tablas nuevas: RLS staff, SELECT autenticado, escrituras solo RPC; guarda de rol antes de validar contenido. Documentos/vínculos/OP ya deniegan DML autenticado directo. No cambiar permisos de Empresa/Equipos ni acceso de gruistas a datos comerciales.

### Lecturas y UX

`v_facturas.cobrado` conserva su nombre técnico y significa cancelado bruto: dinero + retenciones + cancelaciones anteriores. Añadir el desglose, cheques pendientes, reservas y disponible. Un anticipo no aplicado no baja el saldo de factura.

El trabajo muestra Facturado, Cancelado y Saldo, con Dinero acreditado, Retenciones, Anterior sin medio identificado, Anticipos y Cheques pendientes. El saldo asignado puede ser crédito a favor. Si hay importes vinculados sin repartir, mostrar Saldo pendiente de distribución; no convertir null en cero. Las advertencias contextuales de una factura compartida no se suman globalmente.

OP: condición textual, medios con importes/fechas, destinos por trabajo y factura opcional, acciones de acreditar/rechazar y aplicar anticipo existente. Factura: reparto por trabajo/grúa con total y remanente explícito. En un trabajo nuevo único, 100% y grúa actual son una propuesta visible confirmable; desconocido y sin equipo son elecciones distintas. En legados, repartir facturado no prorratea cobros.

Informe `/reports/equipment-revenue`: total con IVA por grúa registrada, fecha de factura, equipos inactivos, Sin equipo, Equipo desconocido, Sin distribuir y montos sin fecha aparte del período filtrado. Totales únicos por asignaciones; contar facturas globales distintas, no sumar los recuentos por grúa.

## Verificación y publicación

Pruebas unitarias de importes/contratos; integración de reservas, acreditación, retenciones, anticipo aplicado después, historial, versión, concurrencia y permisos. Prueba real de upgrade: iniciar stack descartable sin las migraciones financieras, sembrar con contratos anteriores, tomar snapshot, aplicar migraciones sin reset y comparar. Nunca usar desarrollo/producción para fixtures.

Interfaz: generar referencia sobre capturas existentes antes de implementar; mantener el sistema visual, componentes y adaptación móvil. Revisiones de especificación/calidad por tarea y revisión integrada. Una sola entrega financiera completa: no publicar UI nueva mientras los saldos sigan calculándose desde la fuente anterior.

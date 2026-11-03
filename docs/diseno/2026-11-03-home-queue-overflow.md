# Identificadores largos en Inicio y selección de remitos

Modo: Operate. Corrección puntual descubierta al ejecutar la suite existente en Linux junto a los nuevos recorridos. Se conserva el sistema de DESIGN.md y su sidecar.

## Dirección y alcance

Un remito con un número válido de 100 caracteres debe caber en las colas de Inicio en móvil sin ensanchar las tarjetas ni desplazar sus acciones. Se conserva el dato completo en persistencia y enlaces, y su acceso completo si la presentación se limita visualmente. No se cambia la estructura, el contenido funcional, la paleta, la tipografía ni la composición de Inicio.

El ajuste se limita al tratamiento del identificador en QueueHome y en el selector de remitos de la factura a la que navega la prueba. No se admite ocultar el overflow de toda la página, aislar el dato en otro cliente ni reducir los datos de prueba para evitar el caso.

## Evidencia inicial

La ejecución GitHub `41656762953` terminó con 88 pruebas correctas y un fallo de ancho en `home.spec.ts:108`. Su captura completa móvil midió 1148 px de ancho frente a una ventana de 390 px. Un número de remito sin separadores ensanchó las filas y el grid de las colas; el encabezado global permaneció en 390 px. La reproducción permanente tendrá un dato largo propio para no depender de otra prueba concurrente.

La verificación incluirá capturas locales móvil/escritorio y revisión acotada, conservando los archivos globales del sistema visual. No hay recursos gráficos nuevos.

La reproducción propia confirmó un ancho de 1107 px frente a 390 px; la columna de todas las colas medía 1090,9 px. El wrapping del número corrigió Inicio a 390 px y sus colas a 358 px. Al continuar el mismo recorrido, el selector de remitos de la factura mostró el número completo en un span sin wrapping y volvió a ensanchar la página. Se incluye ese span de `InvoiceDeliveryNotesSection` en la corrección puntual y en la regresión, sin modificar el dato ni su selección.

## Verificación y cierre

### Persistencia

En producto, el commit `69e4585` modifica exactamente dos spans: agrega `[overflow-wrap:anywhere]` al número visible de `QueueHome` y `min-w-0` con `[overflow-wrap:anywhere]` al texto de `InvoiceDeliveryNotesSection`. El número completo, los enlaces, los importes y la lógica de selección se conservan. La regresión mantiene su propio remito de 100 letras N consecutivas durante la navegación hasta la factura y limpia su propio cliente; no depende de la limpieza de otras pruebas ni usa ocultamiento global, truncado, acciones forzadas o reintentos.

### Fidelidad

Se contrastaron ambos componentes y `src/app/globals.css` con `DESIGN.md`, `.impeccable/design.json` y estas tres capturas locales ignoradas:

- `.impeccable/review/home-long-remit-mobile.png` (390 × 844).
- `.impeccable/review/home-long-remit-desktop.png` (1200 × 805).
- `.impeccable/review/document-long-remit-mobile.png` (390 × 844).

Son capturas de detalle desplazadas intencionalmente, no capturas completas desde el inicio de página. Inicio conserva el número completo y «Facturar» dentro de la tarjeta; la factura conserva el checkbox, su texto completo y los controles de cancelar y guardar. En escritorio se mantienen las columnas existentes.

### Sistema conservado

TYPE, MATERIAL y GROUND mantienen Inter, el acento índigo, las superficies claras, los bordes y la profundidad existentes. No hay cambio de identidad, estructura ni recursos gráficos. `DESIGN.md` y su sidecar permanecen intactos; la ausencia previa de `PRODUCT.md` queda fuera de este alcance y no se repara.

### Comprobaciones

La ejecución dirigida de `home.spec.ts` pasó sus dos pruebas en 18,3 s y la suite completa pasó sus 89 pruebas en 2,6 min. Limpieza de datos, lint, tipos y build también pasaron; el stack `e814e4e9de7d400` fue destruido al finalizar. Los dos hooks automáticos de diseño sobre los archivos modificados no informaron problemas deterministas. No se ejecutó un detector manual adicional para este delta.

### Dictamen

Revisión independiente: **SHIP**, limitada a estos dos spans. Persistencia y fidelidad aprobadas; techo de revisión alcanzado para la corrección puntual; sin correcciones materiales pendientes. Se conservan el identificador completo, la selección y las acciones. Este dictamen no constituye una aprobación visual general del MVP.

La entrega documental anterior se interrumpió por el límite de uso y fue completada por su reemplazo; la revisión visual independiente sí había finalizado correctamente.

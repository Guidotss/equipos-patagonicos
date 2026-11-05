# Circuito financiero: referencia de formularios

Modo Operate. Extensión del formulario de documentos existente; conservar DESIGN.md, Inter, neutros fríos, índigo, hoja plana y controles del sistema. No reemplazar el mundo visual ni reparar drift global.

Referencia generada `referencias/19-payment-instruments.png`, con capturas vigentes de Documentos móvil y Empresa escritorio como restricciones. Prompt y refinamiento: `referencias/19-payment-instruments.prompt.txt`. Datos y banco de ejemplo son sintéticos, no registros de base.

## Composición

La cabecera y el contexto del trabajo mantienen su jerarquía; datos generales y comprobante conservan el comportamiento existente. La condición de pago es un campo de texto. La sección Medios de pago contiene filas editables de medio, importe, estado y fecha efectiva; el cheque expone referencia, banco de texto libre y vencimiento manual. Acción Agregar medio y eliminación visible, coherentes con la grilla de ítems.

Aplicación del cobro se presenta aparte: cada porción identifica medio, trabajo, factura opcional e importe. Sin factura es un destino del mismo instrumento; al aplicar un anticipo posteriormente no se crea otro cobro. Totales juntos: importe de OP, cancelado, cheques pendientes; debajo dinero acreditado y retenciones por separado. Las filas se apilan en móvil, con etiquetas visibles, controles de al menos 44px y tipografía legible, permitiendo scroll vertical. Barra de acciones existente; sin comprimir todo el formulario en un viewport.

## Verdad funcional sobre detalles de la generación

- El select de estado de Transferencia móvil aparece etiquetado por error «Importe» en la imagen; debe decir Estado.
- Retenciones confirmadas también necesitan su fecha efectiva. La condición 30/45/60 no genera un calendario ni fechas de cheques.
- Un cheque pendiente no integra cancelado, dinero acreditado ni anticipo cobrado. La opción Sin factura indica su destino previsto; la etiqueta y desglose deben distinguir el importe todavía pendiente.
- El resumen separa dinero y retenciones, ambos cancelan. Legados sin medio identificado se muestran aparte cuando existan; no se inventa efectivo.
- El banco es entrada libre, sin catálogo inventado. Las acciones sobre instrumentos persistidos y las correcciones usan los flujos/versiones aprobados; la imagen muestra composición de alta, no todas las interacciones.
- Mantener las secciones de contexto, archivos y datos existentes que queden fuera del recorte. No copiar etiquetas artificiales o datos de ejemplo al producto ni a seeds.

## Distribución de factura

Referencia `referencias/22-invoice-allocations.png`, sobre el formulario móvil de documentos y la hoja de Empresa actual; prompt en `.prompt.txt`. Es un recorte de la sección nueva, no un reemplazo de contexto, archivos ni datos de factura. Mantener navegación real de Presupuestos/Documentos: Configuración aparece seleccionada por error en el ejemplo generado. Las cabeceras cortadas del recorte no se reproducen en el código.

La sección reúne trabajo, grúa e importe en una fila de escritorio con eliminación visible; en móvil, etiquetas y campos apilados. Mostrar total documental, distribuido y remanente Sin distribuir con sumas exactas. El remanente se persiste como porción explícita con trabajo nulo y equipo desconocido, no se reparte automáticamente. Propuesta de trabajo/equipo actual solo en altas nuevas de trabajo único, siempre visible. Editar legados conserva desconocido hasta elección explícita. Sin equipo y Equipo desconocido son opciones distintas.

En facturas históricas, añadir por fila el importe de cancelación histórica atribuida, con total conocido protegido y motivo de corrección al cambiarlo; no distribuir cobros proporcionalmente al facturado. En otras facturas no se muestra ni crea ese campo. Errores de suma/importes asociados a filas y un resumen accesible; conservar el resto del formulario y archivos ante un fallo.

## Resumen del trabajo

Referencia generada `referencias/20-budget-financial-summary.png`, desde la captura vigente del presupuesto (`/tmp/equipos-2026-11-04-evidence/presupuesto-escritorio.png`), contrastada con `BudgetPage`, DESIGN.md y los componentes actuales. Prompt en el archivo hermano `.prompt.txt`.

Mantener banda, ficha y secciones de documentos. Sustituir los cinco indicadores equivalentes por un resumen financiero único: Facturado, Cancelado y Saldo; debajo, dinero acreditado, retenciones y, si existen, cancelaciones anteriores sin medio identificado. Anticipos y cheques pendientes tienen una línea propia. Los contadores documentales se reúnen en una línea secundaria, conservando sus etiquetas. En móvil, importes apilados o alineados en pares, sin scroll horizontal de página. No copiar el estado pagado de la factura de la captura original si tiene saldo.

El caso ilustrado usa factura de 1.000.000, cancelación de 400.000 (350.000 de dinero + 50.000 de retención), saldo 600.000 y cheque pendiente de 300.000. Son datos sintéticos de composición. Si el saldo asignado es negativo, usar «Crédito a favor». Si falta reparto monetario, mostrar «Saldo pendiente de distribución» y explicar qué factura/cobro resolver; no sustituir por cero ni ocultar los importes conocidos. Equipo desconocido por sí solo no vuelve indeterminado un saldo de trabajo.

El total reconocido del trabajo incluye anticipos asignados. Cuando los haya, aclarar «Incluye anticipos» junto a Cancelado; la línea Anticipos sin aplicar es un desglose, no otro importe que se suma a Cancelado. Aplicarlos a una factura conserva el total recibido y disminuye ese desglose. Un cheque pendiente con destino sin factura no es un anticipo ya cobrado.

Las acciones de acreditar/rechazar sobre un documento guardado deben conservar el formulario. Si hay cambios o archivos sin guardar, pedir guardarlos antes de ejecutar la acción, sin descartarlos ni refrescar silenciosamente. Usar la versión que la pantalla recibió; al completar una acción y refrescar un formulario limpio, inicializar desde el nuevo contexto. Anular/restaurar documentos financieros pide motivo en la confirmación existente, incluyendo deshacer; evitar el deshacer antiguo que reenvía una versión anterior.

## Facturación por grúa

Referencia `referencias/21-equipment-revenue.png`, generada con la ficha actual para el shell y la grilla vigente de Presupuestos para tabla/filtros. Prompt en `.prompt.txt`. La captura antigua de grilla no contiene las entradas más recientes del sidebar; la navegación real actual prevalece.

Página Operate de consulta, sin banda de ficha ni gráficos. Título y descripción, filtros Desde/Hasta, total del período con recuento único de facturas, tabla de grúa/facturas/facturado con IVA. Reutilizar el marco plano de listado: filtros, resultados y pie comparten contorno cuando convenga al componente existente. Equipos inactivos siguen presentes. Grupos Sin equipo, Equipo desconocido y Sin distribuir distintos. Recuentos por grupo no son sumables; explicar la diferencia junto a la tabla. Sin fecha se presenta separado y fuera del total filtrado, con acceso a los comprobantes que requieren revisión. Revisar facturas conduce a comprobantes reales editables, nunca un botón sin destino.

La referencia conserva una tabla de tres columnas en móvil; si importes largos no caben, apilar cada fila con etiquetas visibles siguiendo la grilla existente. Mínimo táctil 44px. Fecha nativa, filtrado real, enlaces de revisión con foco claro. Los ejemplos son sintéticos; no introducir registros ni fechas de ejemplo al producto. Carga, error y vacío deben conservar el mismo marco.

## Verificación pendiente de implementación

Captura desktop/móvil con datos descartables, estados vacío/error/carga y cheque pendiente/acreditado; una ronda batched, un lote de correcciones y confirmación acotada. Revisar importes largos, foco/etiquetas, filas dinámicas y conservación de archivos. Traspasos frescos de revisión visual y documentación al terminar.

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

## Verificación pendiente de implementación

Captura desktop/móvil con datos descartables, estados vacío/error/carga y cheque pendiente/acreditado; una ronda batched, un lote de correcciones y confirmación acotada. Revisar importes largos, foco/etiquetas, filas dinámicas y conservación de archivos. Traspasos frescos de revisión visual y documentación al terminar.

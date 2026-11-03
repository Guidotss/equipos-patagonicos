# Archivos con nombres largos en móvil

Modo: Operate. Corrección puntual descubierta por la suite de Playwright. Se conserva `DESIGN.md`, su sidecar, componentes y composición vigentes.

## Dirección y límite

El usuario debe adjuntar un archivo con un nombre válido largo y enviar el remito sin que cambie el ancho del formulario ni se pierda el acceso a la acción fija. La miniatura, el estado y las acciones existentes conservan su apariencia; el nombre sigue disponible completo en su atributo title y su nombre accesible.

El ajuste se limita al tamaño mínimo de grid y filas en `UploadFiles`. No se reemplazan la hoja, la barra de acciones, los colores, la tipografía ni la lógica de subida. No se agregan recursos gráficos.

## Evidencia

La primera prueba con `isMobile: true` reprodujo el paso de 390 × 844 a 569 × 1232 después de adjuntar un PDF con UUID en el nombre. El contenido del formulario interceptaba el clic en «Enviar remito». Se conserva ese archivo como regresión.

La validación incluirá un lote móvil/escritorio con nombres largos, ancho y clic normal, y una revisión independiente. Las capturas locales de `.impeccable/review` no se versionan.

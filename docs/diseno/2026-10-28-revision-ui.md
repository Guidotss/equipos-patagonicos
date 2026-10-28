# Revisión de pantallas y formularios

Revisión del 28 de octubre de 2026. Se conserva la dirección visual existente: Inter, índigo, sidebar claro, superficies blancas y bandas de portada en las fichas.

## Alcance y referencia

Se inspeccionaron Clientes y contactos; Configuración, Empresa, Equipos, Firmantes y Plantillas; creación, importación, edición y lectura de cotizaciones; presupuestos, documentos, búsqueda y acceso. La tanda inicial y la confirmación incluyeron 60 capturas cada una: 28 rutas en escritorio (1200 × 805) y móvil (390 × 844), acceso y tres estados de validación.

La [referencia generada](referencias/12-formularios.png) parte de las pantallas existentes. Mantiene la densidad de escritorio y amplía los campos principales a 44 px con texto de 16 px en móvil, con 6 px entre etiqueta y control y mayor separación vertical. La carga de PDF conserva su lugar y jerarquía y usa una acción explícita en español.

## Correcciones

- Inputs, selectores, botones y búsquedas más cómodos en móvil. Las descripciones de ítems conservan su altura adaptable; el escritorio mantiene sus medidas compactas.
- Etiquetas, ayudas y errores asociados al control. La validación de cotizaciones importadas y presupuestos directos enfoca el primer campo pendiente y conserva lo escrito. Se validan los datos antes de subir el PDF usando el mismo esquema que el servidor.
- Selector de formato de plantilla alineado al ancho de su columna. El editor de plantillas muestra descripción, cantidad y unidad: los precios se completan al cotizar. La opción de total en el PDF se conserva.
- Selección de PDF en español, nombre de archivo que puede partirse y error junto al campo. Se mantiene la subida y el reintento del archivo ya cargado.
- Avisos de guardado al pie, por encima de las barras de acciones. Menos espacio vacío entre cotizaciones de lectura y su seguimiento; textos largos de actividad comercial con salto de línea.

## Validación

- Confirmación: sin desbordes horizontales, controles visibles sin nombre accesible ni errores JavaScript en las rutas recorridas. Los controles auxiliares ocultos de Radix se excluyen de la medición de campos visibles.
- `npm run check`: ESLint y TypeScript correctos; 479 pruebas unitarias aprobadas.
- Playwright: 14 pruebas aprobadas de Clientes, Configuración, cierre de cotizaciones y Documentos; incluyen carga móvil, subida de PDF, edición de plantillas y validación con foco y descripciones accesibles.
- Detector de Impeccable sobre los componentes modificados: sin hallazgos determinísticos.
- La comprobación visual se hizo con Chromium. No incluye una prueba manual en Safari de iPhone.

## Capturas de la implementación

- [Nuevo cliente en móvil](verificaciones/2026-10-28/cliente-nuevo-movil.png).
- [Cargar cotización en escritorio](verificaciones/2026-10-28/cargar-cotizacion-escritorio.png).
- [Editar plantilla en escritorio](verificaciones/2026-10-28/editar-plantilla-escritorio.png).

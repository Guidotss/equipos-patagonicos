# Modularidad del código existente

El usuario pidió revisar los archivos grandes y separar responsabilidades mediante hooks, componentes, helpers y constantes cuando sea necesario. Se conserva el comportamiento actual y se usan nombres de archivo nuevos en inglés.

## Diagnóstico

Los principales archivos de aplicación con responsabilidades separables son:

| Archivo | Líneas iniciales | Responsabilidades mezcladas |
| --- | ---: | --- |
| `src/lib/quotes/editor.ts` | 750 | Tipos, carga de estado, reducer, esquemas, payload y representación del documento |
| `src/components/quotes/editor/card-items.tsx` | 621 | Secciones, fila editable, menú de arrastre, foco y composición |
| `src/components/quotes/editor/actions-editor.tsx` | 589 | Contratos, transiciones asíncronas y botones |
| `src/components/documents/document-form.tsx` | 532 | Estado, carga de contexto, envío, filtros y todas las secciones del formulario |
| `src/lib/quotes/service.ts` | 454 | Fuente del PDF, validaciones de operación, persistencia, transiciones y vista previa |
| `src/components/quotes/editor/card-texts.tsx` | 448 | Edición y selección de texto, herramientas, bloque y composición |
| `src/components/quotes/editor/editor-quote.tsx` | 443 | Persistencia, conflictos, borradores de sección, sincronización y pantalla |
| `src/components/quotes/editor/card-data.tsx` | 417 | Selector de plantilla, entrada de fechas y campos del formulario |
| `src/components/quotes/list/filters-quotes.tsx` | 414 | Opciones comunes, fechas, panel móvil, URL y navegación optimista |
| `src/components/quotes/editor/panel-preview.tsx` | 411 | Generación/cancelación de PDF, URL temporales y distintas presentaciones |
| `src/components/quotes/editor/bands-editor.tsx` | 375 | Confirmaciones y avisos de estado |

Las líneas son una señal para revisar responsabilidades, no un límite obligatorio. Los tipos de Supabase son generados y no deben fragmentarse a mano. Las pruebas extensas ya están organizadas por suites: se conserva su cobertura durante este trabajo. Los scripts y componentes de biblioteca se revisan por coherencia; no se dividen solamente para reducir su conteo.

## Organización elegida

- Hooks locales a cada funcionalidad para estado con ciclo de vida real: formulario de documento, editor de cotización, acciones y vista previa. Sin un hook global que mezcle dominios.
- Componentes con significado de interfaz: fila/sección de ítems, editor de bloque, selector de plantilla, fechas, secciones de documento y confirmaciones.
- Helpers puros para inicialización y selección de datos. Constantes junto al módulo que las usa; no crear una carpeta global de constantes de un único consumidor.
- Módulos del editor separados en tipos, estado/reducer, validación y documento. Mantener los exports públicos existentes con una fachada pequeña y usar imports directos entre módulos internos para impedir ciclos.
- Separar las operaciones de PDF del servicio de cotizaciones. Mantener sus firmas y controles de sesión/versiones existentes.

Se elige conservar las interfaces existentes frente a cambiar todos los consumidores a la vez. Una división exclusivamente por cantidad de líneas dejaría dependencias arbitrarias; una reescritura del estado agregaría riesgo funcional fuera del pedido.

## Invariantes

No cambian rutas, esquema de base, estados comerciales, comportamiento de CUIT, textos, estilo visual, controles de accesibilidad, orden de foco, arrastre, selección/undo de texto, archivos, cancelación de solicitudes ni reglas de guardado y conflicto. Se conserva la atomicidad de operaciones de negocio y los efectos se limpian como antes.

## Verificación

La base inicial pasa lint, tipos, 481 pruebas unitarias y 17 del importador. Después de la extracción se ejecutan nuevamente, además de build, integración completa, tests del runner y las 75 pruebas de navegador mediante el entorno descartable. Los casos intermitentes previamente observados se investigan comparando con el código inicial si vuelven a aparecer. Revisión independiente de cumplimiento y luego de calidad antes de integrar.

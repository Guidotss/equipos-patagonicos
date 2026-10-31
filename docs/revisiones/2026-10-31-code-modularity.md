# Revisión y refactorización de modularidad

Fecha: 31 de octubre de 2026. Base revisada: `7eab257`.

## Resultado

Se separaron responsabilidades de once archivos de producción. Los componentes principales componen la interfaz; el estado con ciclo de vida vive en hooks de su funcionalidad, y las transformaciones puras en módulos del modelo. Se conservaron los exports anteriores mediante entradas compatibles.

| Archivo de entrada | Líneas antes | Líneas después |
| --- | ---: | ---: |
| `src/lib/quotes/editor.ts` | 750 | 20 |
| `src/lib/quotes/service.ts` | 454 | 113 |
| `src/components/documents/document-form.tsx` | 532 | 142 |
| `src/components/quotes/editor/card-items.tsx` | 621 | 275 |
| `src/components/quotes/editor/actions-editor.tsx` | 589 | 210 |
| `src/components/quotes/editor/card-texts.tsx` | 448 | 113 |
| `src/components/quotes/editor/editor-quote.tsx` | 443 | 163 |
| `src/components/quotes/editor/card-data.tsx` | 417 | 284 |
| `src/components/quotes/list/filters-quotes.tsx` | 414 | 114 |
| `src/components/quotes/editor/panel-preview.tsx` | 411 | 261 |
| `src/components/quotes/editor/bands-editor.tsx` | 375 | 185 |

Los valores muestran el tamaño de los puntos de entrada, no una reducción equivalente del código total: la lógica fue trasladada a módulos enfocados y tipados. No se impuso un límite arbitrario de líneas. Los tipos generados de Supabase se mantienen como archivo generado.

## Separación aplicada

- `src/lib/quotes/editor/`: tipos, inicialización, reducer, validación/payload, derivación de documentos y constantes/helpers compartidos.
- `src/components/quotes/editor/use-quote-editor.ts`, `use-quote-actions.ts`, `use-quote-preview.ts` y `use-section-drafts.ts`: estado del editor, acciones asíncronas, PDF y borradores de secciones.
- Componentes locales para filas y controles de la grilla, secciones, editor de bloques y herramientas de formato, selector de plantilla, entrada de fecha y confirmaciones.
- `src/components/documents/use-document-form.ts` y `document-form-model.ts`: estado/envío y preparación de valores/listas; secciones con contratos específicos para datos, archivos, vínculos, remitos y aplicaciones de pagos.
- `src/components/quotes/list/use-quote-filters.ts`: sincronización optimista con la URL. Campos compartidos, selector de fechas y filtros móviles en componentes propios.
- `src/lib/quotes/service/`: contratos/errores, lectura de fuentes, reglas, RPC, persistencia y operaciones de PDF. El error del servicio puede importarse sin cargar operaciones de PDF.

Se comprobó que los once módulos mantienen todos sus exports públicos y que no hay ciclos de importación de ejecución entre los módulos de la aplicación. Los componentes y hooks nuevos usan nombres de archivo en inglés. Las rutas, textos de la interfaz y contratos existentes de la base conservan sus nombres.

## Errores adicionales encontrados al verificar

1. El ejecutor descartable no arrancaba por `checkPorts = checkPorts`: el parámetro ocultaba a la función importada. Se corrigió el nombre de la importación y se agregó una regresión que ejecuta sus dependencias por defecto.
2. Varios alias de consultas de pruebas no coincidían con los nombres que leía TypeScript. Se alinearon los alias, conservando las columnas reales y las mismas aserciones. La primera integración completa mostró 39 fallos; una vez corregidos los contratos aprobaron sus 342 casos.
3. El importador había traducido `fuente` y campos de manifiestos/informes persistidos que siguen formando parte de contratos externos. Se restituyeron esas claves sin cambiar la base ni los archivos históricos. Los identificadores internos continúan en inglés.
4. `saveReport(path, report)` ocultaba el módulo `node:path` y fallaba al escribir el informe. Se corrigió el parámetro; una prueba de la CLI real con fetch simulado verifica escritura de informe y contrato de importación sin conexiones remotas.
5. La CLI acepta los flags ingleses y mantiene como alias los flags españoles documentados anteriormente.
6. Los bloques persistidos con `oculto` antes del renombrado se interpretaban como visibles al leer solo `hidden`. Se añadió una lectura compatible de ambos formatos: se expone `hidden`, su valor explícito tiene prioridad y se conserva el estado oculto anterior.

## Verificación

- Revisión independiente de especificación y calidad aprobó la extracción modular, el runner, la compatibilidad del importador y el adaptador de bloques antiguos.
- Lint, TypeScript, 483 pruebas unitarias y build de producción aprobados.
- 12 pruebas nativas del runner y 20 del importador aprobadas.
- Integración completa: 20 archivos y 342 pruebas aprobadas; proyecto temporal destruido.
- La prueba de la CLI usa archivos sintéticos, intercepta todas las solicitudes de red y retira su carpeta temporal en finally.

- Navegador: 75 de 75 pruebas aprobadas en la corrida completa. Después del adaptador de bloques antiguos, también aprobaron las 3 pruebas específicas de textos/plantillas.
- Se inspeccionaron capturas de presupuesto en escritorio y documento en móvil; la estructura visual se conserva.
- Se verificó la destrucción de los proyectos de pruebas, incluidos sus contenedores, volúmenes y redes. Los tests no usaron desarrollo ni producción.

No hay migraciones de base en esta refactorización. La publicación se verifica por el commit desplegado y su estado en Railway.

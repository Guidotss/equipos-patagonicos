# Revisión funcional y de UX — notas de Obsidian

Fecha: 31 de octubre de 2026.

Referencia: nota «Thomi equipos patagonicos», vault Guido, y sus tres capturas. Código revisado sobre `main`, commit `f177f3117e9c2db9a5dde9356c4f0aca9d7c0d4f`.

Esta revisión documenta el estado observado y el trabajo necesario. La revisión inicial no modificó la aplicación. Después, el usuario decidió retirar la validación de CUIT: ver `docs/plans/2026-10-31-cuit-informado-design.md` y la migración `20261031100000_cuit_informado.sql`. No se copiaron credenciales, capturas privadas ni el texto completo de la nota al repositorio.

## Resultado

El circuito básico funciona, pero varias necesidades de la nota todavía no están cubiertas. Las principales dependencias están en los cobros y en la atribución de importes a trabajos y equipos. Cambiar solamente las pantallas dejaría esos cálculos incompletos.

Se revisaron todos los puntos de la nota, el editor de cotizaciones, los documentos, el detalle y listado de presupuestos, Empresa e Inicio. La suite de navegador también recorrió clientes, configuración, búsqueda, permisos de sesión y navegación móvil.

Hay 12 acciones identificadas: 3 de prioridad P1 y 9 de prioridad P2. El usuario agregó después la decisión de aceptar el CUIT informado sin validación fiscal. No se identificó un bloqueo P0 del circuito básico en las comprobaciones realizadas.

## Puntos de la nota

| Punto | Estado comprobado | Acción propuesta | Prioridad |
| --- | --- | --- | --- |
| CUIT rechazado | La revisión inicial confirmó el rechazo por verificador. El usuario indicó luego que no quiere validar el CUIT. | Decisión reemplazada: aceptar el dato informado sin validar contenido, longitud, prefijo ni verificador. Cambio implementado en esquema, editor, importador y una migración que retira los CHECK de Clientes/Empresa. | Decisión posterior |
| Eliminar ítems | Existe y funciona desde el menú del control de arrastre. Está poco visible. | Agregar una acción reconocible para eliminar una fila, conservando el foco en una fila vecina. | P2 |
| Eliminar secciones de jornada | El encabezado permite renombrar, pero no tiene una acción para eliminar la sección. Los grupos se derivan de los ítems. | Incorporar una acción de sección. Si elimina también sus ítems, mostrar cantidad y confirmar esa consecuencia. | P2 |
| Equipo al adjuntar documentos | El remito ofrece todos los equipos activos y comienza con el equipo vacío. No hereda el del presupuesto. El selector no aparece en todos los tipos de documento: aparece en remitos. | Obtener el equipo del trabajo correspondiente y mostrarlo como dato del contexto. Resolver explícitamente trabajos sin equipo y documentos compartidos entre trabajos con equipos distintos. | P1 |
| Duplicar una enviada como borrador «bis» | La duplicación ya crea otro borrador, con número propio y vínculo a la original. Conserva el asunto sin agregar «bis». No modifica la enviada. | Agregar la nomenclatura «bis» solicitada a la identificación visible. Antes de implementar, precisar si se refiere al asunto o al número mostrado; la numeración interna debe seguir siendo única. | P2 |
| Quitar «Buscar presupuesto» | El buscador y el selector son controles separados, incluso al entrar desde un presupuesto ya identificado. | Quitar el buscador, según la aclaración del usuario. Mantener la selección necesaria al entrar desde el acceso global y presentar el presupuesto actual como contexto cuando ya está determinado. | P2 |
| Plazos de pago y varios cheques | No hay campos de plazo, medio de pago ni filas de cheques. La fecha de vencimiento existente corresponde a la factura. Una OP se computa como cobro al aplicarse. | Añadir las condiciones de pago y el detalle de instrumentos con importe y fecha propios. Distinguir recepción, vencimiento y acreditación de un cheque antes de decidir cuándo cuenta como cobrado. | P2 |
| Facturación por grúa | No existe ese panel ni una agregación por equipo. Hay cotizaciones sin equipo, y las facturas históricas se importaron sin inventar esa asociación. | Construir el reporte después de resolver la atribución de importes. Incluir «Sin equipo» y rotular si los montos incluyen IVA. No deducir una grúa desde el nombre o texto de una factura. | P2 |
| Monto cobrado por trabajo | La ficha y el listado priorizan «Saldo a cobrar». La factura muestra total y saldo, pero no hay un resumen equivalente de facturado/cobrado/saldo del trabajo. | Mostrar esos tres importes juntos y distinguir cobros no aplicados, anticipos y cheques pendientes cuando se incorporen. | P2 |
| Quitar «Actualización de tarifas» | La sección sigue en Empresa, con los dos valores por defecto y la vista de condiciones de las plantillas. | Quitar la sección, según la aclaración del usuario. Ajustar el guardado y sus dependencias para que la ausencia de controles no vacíe valores históricos al guardar otros datos. Retirar controles no debe romper variables en documentos existentes. | P2 |
| Registrar pago sin factura | La OP puede guardarse sin aplicaciones a facturas. Sin embargo, el resumen financiero se deriva de las facturas y sus aplicaciones: el pago no aplicado no aparece como importe cobrado del trabajo. El alta de documentos exige además al menos un archivo. | Dar entidad al cobro del presupuesto con factura opcional. Debe verse en el resumen y poder aplicarse después sin contar el mismo dinero dos veces. Definir aparte si se admitirá un cobro manual sin archivo adjunto. | P1 |
| Ítems «BONIFICADA» | El precio solo acepta números. Cero es válido, pero se muestra como importe cero; escribir «BONIFICADA» produce un precio inválido. | Añadir una marca explícita de bonificación, con total cero y texto apropiado en editor, vista previa y ambos PDF. Conservar la diferencia entre sin precio, precio cero y bonificado. | P2 |

## Dependencia adicional: importes compartidos entre presupuestos — P1

Una factura puede vincularse a varios presupuestos. La vista actual suma su monto y saldo completos en cada presupuesto, por diseño del MVP. Por eso los importes de las filas de presupuestos no son aditivos.

Se comprobó en el proyecto aislado con una factura de $1.000 vinculada a dos trabajos: la suma de `facturado` de ambos fue $2.000 y la de sus saldos también $2.000. No se confirmó una duplicación de facturas ni un error en la cobranza global: el problema es usar esos valores como asignación por trabajo o por equipo.

Ubicación: `supabase/migrations/20261026100100_documentos_vistas.sql:33` y `:72`.

Antes de agregar totales por trabajo/grúa, definir una distribución explícita del importe entre trabajos o informar la factura como compartida sin asignar su total completo a cada equipo. El total general debe contar cada factura una sola vez.

## Evidencia de implementación

| Área | Referencia |
| --- | --- |
| CUIT informado y retiro de validación | `src/lib/cuit.ts`, `src/lib/validacion.ts`, `supabase/migrations/20261031100000_cuit_informado.sql` |
| Menú de ítem y encabezado de sección | `src/components/cotizaciones/editor/tarjeta-items.tsx:90` y `:296` |
| Precio numérico y render de PDF | `src/components/cotizaciones/editor/tarjeta-items.tsx:346`, `src/lib/pdf/cotizacion-mensual.tsx:44`, `src/lib/pdf/cotizacion-jornada.tsx:74` |
| Duplicación de cotización | `supabase/migrations/20261025100100_cotizaciones_guardar.sql:129`, `src/lib/cotizaciones/acciones-estado.ts:133` |
| Buscador y selector de presupuesto | `src/components/documentos/documento-form.tsx:246` |
| Equipo del documento y contexto | `src/components/documentos/documento-form.tsx:72` y `:368`, `src/lib/documentos/lecturas.ts:12` |
| Aplicaciones de OP y exigencia de archivos | `supabase/migrations/20261026100200_documentos_rpc.sql:261`, `src/lib/documentos/pantallas.ts:56` |
| Resumen de presupuesto | `src/app/(app)/presupuestos/[id]/page.tsx:106`, `src/components/presupuestos/tabla-presupuestos.tsx:40` |
| Configuración de tarifas y guardado de Empresa | `src/components/configuracion/empresa-form.tsx:116`, `src/app/(app)/configuracion/actions.ts:29` |

## Comprobaciones realizadas

- `npm run check`: lint y TypeScript correctos; 482 pruebas unitarias y 16 pruebas del importador histórico aprobadas.
- `npm run test:e2e`: 73 de 75 pruebas aprobaron en la corrida completa. Fallaron el foco con Tab en un precio guardado y la prueba de subida múltiple con reintento.
- Repetición de esos dos casos en otro proyecto aislado: ambos aprobaron. Se registran como fallos intermitentes pendientes de aislar; el reintento no convierte la primera corrida en una suite completamente verde ni demuestra por sí solo su causa.
- La prueba del circuito presupuesto → OC → remito → factura → pago → anular/restaurar aprobó.
- Las pruebas de eliminar ítems, arrastrar, guardar nombres de secciones, duplicar, conflictos de edición, búsqueda y paginación aprobaron.
- Se inspeccionaron las tres capturas de Obsidian y capturas nuevas de presupuesto en escritorio y formulario de documento en móvil. El formulario móvil conserva el selector de equipo vacío y la duplicación buscador/selector observados en código.
- Comprobaciones SQL en una transacción del proyecto descartable: OP de $500 sin aplicaciones mantiene el saldo del trabajo en $0; factura compartida de $1.000 suma $2.000 entre dos presupuestos; duplicar una enviada devuelve un borrador con asunto intacto y número diferente; rechazo del CUIT coincide entre capas. Las transacciones se revirtieron.
- Detector de UI Impeccable en editor, documentos, presupuestos y Empresa: terminó correctamente sin hallazgos emitidos. Esto no evalúa reglas de negocio ni sustituye las pruebas visuales.
- Ambos proyectos de pruebas se destruyeron; se verificó que no quedaron sus contenedores ni volúmenes. Desarrollo y producción no fueron destinos de las pruebas.

Los dos fallos intermitentes tienen evidencia conservada en la carpeta privada `/tmp/equipos-revision-obsidian/primera-corrida`. Los logs de las corridas están en `/tmp/equipos-revision-obsidian-check.log`, `/tmp/equipos-revision-obsidian-e2e.log` y `/tmp/equipos-revision-obsidian-reintento.log`. Son evidencias locales temporales, no parte del repositorio.

## Evaluación técnica de la UI

La interfaz conserva un sistema coherente: formularios por secciones, tokens compartidos, campos etiquetados, foco visible, grillas adaptables y navegación por teclado. Los problemas prioritarios de la nota están en la visibilidad de acciones y en la información del negocio que falta representar.

| Dimensión | Evaluación orientativa | Evidencia y límite |
| --- | --- | --- |
| Accesibilidad | 3/4 | Controles etiquetados y operaciones de grilla por teclado probadas. Queda el fallo intermitente de foco; no se hizo una auditoría completa de contraste o lector de pantalla. |
| Rendimiento | 3/4 | Lecturas de contexto en paralelo y PDF bajo demanda. La carga de documentos consulta todo el historial del cliente y el catálogo activo de equipos. No se midió latencia de producción en esta revisión. |
| Adaptación | 3/4 | Pruebas móviles de listas, menú, documento y editor aprobadas. El formulario de documentos todavía repite la elección de contexto. |
| Tema y consistencia | 4/4 | Tokens y componentes compartidos; sin desviaciones emitidas por el detector en los archivos revisados. Evaluación del tema claro implementado. |
| Integridad de la UI | 3/4 | Estructura consistente; eliminar depende de un control de arrastre y la ficha no concentra los importes que el usuario necesita comparar. |
| Total | 16/20 | Evaluación acotada de UI; no equivale a cobertura completa de las nuevas funciones solicitadas. |

## Orden propuesto de trabajo

1. **Contexto y controles**: quitar los dos campos/secciones indicados; tomar el equipo del trabajo; resolver estados «sin equipo» y documentos compartidos. Refinamiento de UI: `$impeccable distill` y `$impeccable harden`.
2. **Cotizaciones**: acciones visibles para eliminar filas/secciones, nomenclatura «bis» y bonificación explícita en pantalla y PDF. Refinamiento de UI: `$impeccable clarify` y `$impeccable harden`.
3. **Cobros y condiciones de pago**: definir asignaciones por trabajo, registrar cobros con factura opcional, plazos e instrumentos con sus fechas; exponer facturado/cobrado/saldo. Refinamiento de UI: `$impeccable shape` después de acordar las reglas funcionales.
4. **Facturación por equipo**: construir la agregación y el panel sobre las asignaciones anteriores, con documentos compartidos y sin equipo visibles. Refinamiento de UI: `$impeccable shape`.
5. **Verificación final**: cubrir las reglas nuevas con pruebas aisladas, investigar los dos casos intermitentes y realizar `$impeccable polish` sobre las superficies modificadas.

Las etapas pueden implementarse por separado o juntas. La evaluación de UI puede repetirse después de los cambios para comparar el resultado con esta revisión.

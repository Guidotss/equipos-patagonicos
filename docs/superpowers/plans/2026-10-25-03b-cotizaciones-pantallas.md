# Plan 3B · Cotizaciones: lista, editor y estados — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las pantallas de cotizaciones sobre el núcleo de los planes 3A y 4A: la lista con búsqueda, filtros y paginación; el editor (cliente con alta rápida, datos que alimentan las variables, grilla de ítems manejable con teclado, textos con formato mínimo, vista previa del PDF real) y las acciones de estado (guardar, descargar y marcar enviada, aprobar con fecha, rechazar, reabrir, revertir, borrar y duplicar).

**Architecture:** Lecturas en Server Components; escrituras en Server Actions que llaman al servicio `src/lib/cotizaciones/servicio.ts`, que a su vez llama a las RPC (las tablas siguen siendo de solo lectura para la app). El editor es un componente de cliente con un reducer puro (`src/lib/cotizaciones/editor.ts`, probado con Vitest) que guarda el estado completo; se guarda mandando un objeto serializable a la Server Action (no FormData). La vista previa se genera en el servidor con los mismos componentes del PDF final, a partir del estado sin guardar (POST), y marca en amarillo las variables sin completar. El guardado lleva control de versión (`updated_at`) igual que enviar y aprobar.

**Tech Stack:** lo de los planes 1 a 4A. Se suman los componentes shadcn `popover`, `command` (agrega `cmdk`), `switch`, `toggle-group` y `tooltip`, y `@dnd-kit/core`, `@dnd-kit/sortable` y `@dnd-kit/utilities` para arrastrar ítems.

**Diseño de referencia:** `docs/plans/2026-10-23-equipos-patagonicos-mvp-design.md` (§5 reglas, §6 pantallas). **Referencias visuales:** `docs/diseno/referencias/02-cotizaciones.png` (lista) y `03-editor-cotizacion.png` (editor), con su `README.md` (dirección "SaaS premium", piezas ya implementadas, defectos que no hay que copiar y medida de comparación: escalar a 1200 de ancho y capturar la app a 1200×805). **Planes anteriores:** `docs/superpowers/plans/` (01, 02, 03a, 04a).

**Fuera de este plan (van en el 3C):** cargar una cotización existente (con la subida del PDF), presupuesto directo, la vista de solo lectura completa de cargadas y directas, duplicar eligiendo otro cliente, "Basar en la última cotización a este cliente", la ficha de cliente con sus cotizaciones y presupuestos, "Guardar como plantilla" y editar plantillas con el editor. **En el 4B:** detalle de presupuesto, documentos y "Aprobar y adjuntar OC". **En el 5:** Inicio y búsqueda global.

---

## Decisiones (tomadas por el orquestador; aplicarlas tal cual)

1. **Sin montos en la lista.** La referencia 02 muestra "Importe", pero el diseño §5 dice que las listas nunca muestran montos cotizados. No va.
2. **"Vence el" solo en enviadas.** Enviada al día: la fecha normal; vencida: en ámbar (`text-amber-700`). Borrador, aprobada y rechazada: "—".
3. **Estado en la lista y en el editor:** "Vencida" no es un estado guardado. Pastillas (`Pastilla`, sin tonos nuevos): Borrador `neutro`, Enviada `info`, Vencida `aviso`, Aprobada `exito`, Rechazada `peligro`. El filtro "Enviada" muestra las enviadas **no** vencidas y "Vencida" las vencidas, para que el filtro y la pastilla coincidan.
4. **Columna "Trabajo" en vez de "Asunto".** El asunto de la plantilla por jornada tiene variables y el de la mensual está vacío. La lista muestra `resumenCotizacion(fila)`: el asunto con las variables resueltas con lo que hay a mano (número, capacidad y descripción del equipo, `datos`), y las que no se resuelven se quitan; si queda vacío, `"{nombre del equipo} · {ubicación}"` con lo que exista; si no hay nada, "—".
5. **Barra de formato de los textos:** solo Negrita, Viñeta, Subviñeta y Quitar sangría (lo que entiende `parsearFormato` y dibuja el PDF). Sin itálica, lista numerada ni sangría libre. Un solo control de ocultar por bloque.
6. **Bloques ocultos:** `esquemaBloque` suma `oculto: z.boolean().default(false)`; `armarDocumento` no dibuja los ocultos (ni cuenta sus variables como faltantes). Así "Mostrar" recupera el bloque tal cual estaba. "Restaurar desde la plantilla" (todos) reemplaza los bloques por los de la plantilla de la cotización, con confirmación en el lugar; "Restaurar este bloque" solo aparece si la plantilla tiene un bloque con el mismo título.
7. **Próxima actualización:** un solo control `<input type="month">` ("Próxima actualización") llena las dos cosas: la columna `fecha_proxima_actualizacion` (`'YYYY-MM-01'`, la usa la cola de Inicio) y `datos.proxima_actualizacion` (texto del PDF, `mesEnLetras('2026-11')` = `'noviembre de 2026'`). El reducer escribe el texto al cambiar el control. Vaciarlo deja la fecha en `null` y borra el texto: el PDF cae al valor de la empresa, igual antes y después de recargar. Una fila que trae texto sin fecha lo conserva mientras no se toque el control. `indice_base` sigue siendo texto libre; si está vacío el campo muestra como placeholder el valor por defecto de la empresa.
8. **El número se asigna al primer guardado.** Para crear hace falta cliente y formato (NOT NULL). Antes de guardar, el encabezado dice "Nueva cotización" y la vista previa muestra `{{numero}}` resaltado; `numero` no cuenta como faltante en el aviso mientras no se guardó. Al primer guardado se navega a `/cotizaciones/{id}` con `router.replace` (si el primer guardado lo hace enviar o aprobar, después de la transición: decisión 12).
9. **Firmante por defecto** de una cotización nueva: el de la última cotización creada en la app que tenga firmante activo; si no hay, el primer firmante activo por nombre.
10. **Plantilla:** una cotización nueva arranca con la primera plantilla activa por nombre (hoy "Mensual - Grúa con operador") y un control segmentado "Mensual | Por jornada" que elige la plantilla activa de ese formato (si hay varias de un formato, un select al lado). Aplicar una plantilla precarga asunto, intro, bloques, validez e ítems **sin precio**. Cambiar de plantilla con cambios hechos pide confirmación en el lugar ("Se reemplazan el asunto, la introducción, los textos y los ítems"). El formato solo se elige al crear; en una guardada queda fijo (se ve en el encabezado).
11. **Guardar con versión.** Migración nueva: `guardar_cotizacion` suma `p_updated_at timestamptz default null`, obligatorio cuando viene `p_id` (mismo `private.exigir_version` que enviar/aprobar). El servicio relee `numero` y `updated_at` después de guardar (si otro guarda justo entre la RPC y esa lectura, la pantalla se queda con la versión ajena: es una ventana de milisegundos que se acepta). `enviarCotizacion` y `aprobarCotizacion` aceptan la versión que vio la pantalla y fallan con "La cotización cambió desde que la abriste; volvé a intentarlo" si no coincide, antes de generar ningún PDF. Ante ese error el editor no pierde lo tipeado y ofrece "Recargar" (descarta los cambios, con confirmación en el lugar).
12. **Enviar y aprobar guardan primero.** Si el editor tiene cambios sin guardar, "Descargar y marcar enviada" y "Aprobar" guardan antes y después ejecutan la transición con la versión nueva. Una nueva también: se guarda sin navegar (`guardar({ navegar: false })`), la transición usa el id que vuelve y recién después se va a `/cotizaciones/{id}` con `router.replace`. Mientras corre una acción, todos los botones de acción quedan deshabilitados (un doble clic deja un PDF huérfano).
13. **Descargar al marcar enviada:** `enviarCotizacion` devuelve `{ envioId }` y la pantalla descarga `/cotizaciones/{id}/pdf?envio={envioId}&descargar=1` (el nombre lo pone la ruta: `COTIZACION N° 112712 VERTICE.pdf`).
14. **Aprobar** pide la fecha de aprobación en el lugar (hoy por defecto, no anterior a la fecha de la cotización). Si la cotización tiene `reemplaza_a` y esa anterior es un presupuesto aprobado en curso, después de aprobar se ofrece en el lugar "Finalizar el presupuesto N° X" (`cambiar_estado_presupuesto(id_anterior, 'finalizado')`). Aprobar una enviada editada después del último envío muestra un aviso: "Se aprueba la versión actual, que el cliente no recibió" (se detecta comparando `updated_at` con el último `enviada_at`; después de revertir la aprobación de una enviada el aviso también aparece aunque el contenido no cambió: es solo un aviso y se acepta).
15. **Sin modales.** Confirmaciones en el lugar, con el patrón de `BorrarContacto` (`src/components/clientes/contacto-form.tsx`): franja `rounded-lg border px-4 py-3`, foco en Cancelar y Escape para cancelar. Aprobar, rechazar, reabrir, revertir y borrar piden confirmación; duplicar no. La pieza reusable es `ConfirmacionEnLugar` (`src/components/formulario/confirmacion-en-lugar.tsx`). Si la confirmación sale de un `DropdownMenu` modal de Radix, se abre en el `onCloseAutoFocus` del menú y no en el `onSelect`: mientras el menú está abierto, su `FocusScope` le saca el foco a "Cancelar". El ⋯ de cada fila de la lista ofrece las transiciones (relev-visual §1.6) y abre el editor con `?accion=…`, que abre esa confirmación al entrar.
16. **Vista previa:** en escritorio (≥ 72rem) una columna fija a la derecha con la hoja en un pozo gris; se muestra en un `<iframe>` con un blob URL del PDF que devuelve `POST /cotizaciones/vista-previa` (`#toolbar=0&navpanes=0&view=FitH`). Se actualiza con el botón "Actualizar vista previa" (no en cada tecla). Entre md y 72rem: botón "Vista previa" en la barra inferior que abre un `Sheet` lateral con el mismo panel. En el celular: guarda y abre `/cotizaciones/{id}/pdf?actual=1` en otra pestaña. En una aprobada se muestra el PDF congelado (GET normal); en una enviada, la versión actual (no el último envío). La barra inferior lleva el estado de guardado, "Vista previa" y Guardar, pero no las transiciones: en el celular quedan en el encabezado (el primario y el ⋯ con los secundarios y el historial de envíos), no en un ⋯ de la barra como pedía relev-visual §3.11. Así hay un solo menú.
17. **Variables sin completar:** se calculan en el cliente con `armarDocumento` (es puro) a partir del estado del editor. Se ven en una franja amarilla bajo el encabezado ("Para enviar falta completar: **Ubicación** · **1 ítem sin precio**"; cada nombre lleva el foco al campo) y, en los campos de Datos vacíos que el texto usa, con la marca `{{ubicacion}}` superpuesta (nunca guardada como valor). "Descargar y marcar enviada" y "Aprobar" quedan deshabilitados mientras haya faltantes, variables mal escritas o ítems sin precio, con el motivo en la franja.
18. **Alta rápida de cliente** desde el combobox: "+ Crear cliente «texto»" crea el cliente solo con la razón social (CUIT opcional, se completa después en Clientes) y lo deja elegido. El combobox busca con `buscar_clientes` (sin acentos, por CUIT y por contacto) y muestra los inactivos al final con la marca "Inactivo"; elegir un inactivo está permitido (para retomar un cliente) pero lo avisa.
19. **Atte.:** al elegir el cliente se preselecciona el último contacto usado en sus cotizaciones; si no hay, el primero por nombre; si no tiene contactos, "Sin Atte.". Cambiar de cliente limpia el contacto.
20. **Catálogos en los combos:** equipos y firmantes activos, más el que ya tenga elegido la cotización aunque esté inactivo (marcado "(inactivo)").
21. **Fondo blanco** como el resto de la app (no el gris de las imágenes 02 y 03); el gris solo en el pozo de la vista previa. Título del editor: `EncabezadoPagina` con la variante `compacto` (`text-[1.75rem] font-semibold`) para que el título, la pastilla y tres botones entren en una fila a 1200 px.
22. **Paginación:** 25 por página, `?pagina=N`. Conteo total en el chip junto al título. Sin pie cuando hay una sola página.
23. **Búsqueda de la lista:** RPC nueva `buscar_cotizaciones` (sin acentos, por número parcial, razón social y asunto). Filtros por estado, cliente y rango de fechas, todo en `searchParams` parseados con Zod y `.catch()`. Sin rango de fechas por defecto.
24. **Importadas y directas en el 3B:** pueden aparecer en la lista (las cargan los tests y, desde el 3C, la pantalla). En el 3B, `/cotizaciones/{id}` de una cargada o directa muestra una vista de solo lectura mínima (encabezado con número, cliente, estado y origen, y el link al PDF original si lo tiene) que el 3C completa. En la lista llevan el origen bajo el N° ("Cargada" o "Directa") y "—" en Formato (su `formato` es el valor por defecto de la importación y no significa nada); su ⋯ no ofrece transiciones.

---

## Convenciones (heredadas)

- UI y mensajes en castellano rioplatense con voseo. Commits Conventional Commits en castellano con `Co-Authored-By: Claude <noreply@anthropic.com>`.
- Después de cada migración: `npm run db:reset && npm run db:types` y commitear `src/lib/supabase/database.types.ts` si cambió. Las migraciones ya mergeadas no se editan: van en archivos nuevos.
- Toda función que ejecute `authenticated` lleva `grant execute` explícito; las `SECURITY DEFINER` arrancan con `perform private.exigir_usuario_activo();` y usan `set search_path = ''`. Errores de negocio con `errcode = 'P0001'`.
- Módulos usados desde Vitest no importan `server-only` ni `@/lib/supabase/server`: reciben el cliente por parámetro.
- Lógica de UI en funciones puras de `src/lib/**` con su `.test.ts` al lado (no hay tests de componentes); la UI se prueba con Playwright.
- Selectores E2E solo accesibles (`getByRole`, `getByLabel`), sin `data-testid`. Cada `Campo` necesita un `id` único en la página.
- Piezas visuales ya hechas que hay que reutilizar (ver `docs/diseno/referencias/README.md`): `BarraMigas`, `EncabezadoPagina`, `Contenido`, `Tarjeta`, `CamposGrilla`, `Campo`, `MensajeFormulario`, `Pastilla`, la tabla en tarjeta de `TablaClientes`, la caja punteada de vacíos y el botón de cabecera (`size="lg" className="h-10 px-3.5 text-[15px]"`, el primario con `shadow-md shadow-primary/20`).
- **Procesos:** nunca `pkill -f 'next dev'`. Si levantás un dev server, matá solo tu PID o el puerto 3000 (`lsof -ti tcp:3000 | xargs kill`).
- **Verificación visual** (tareas con pantallas): capturar con Playwright a 1200×805 y comparar con la referencia escalada a 1200 de ancho (`magick docs/diseno/referencias/0X-….png -resize 1200x <scratchpad>/ref.png`), mirando las dos imágenes. Ajustar hasta que layout, jerarquía, espaciado y colores coincidan, salvo lo que las decisiones de arriba cambian a propósito. Dejar las capturas en el scratchpad.

---

## Estructura de archivos al terminar el plan

```
supabase/migrations/20261027100000_cotizaciones_editor.sql   guardar con versión (y sin borrar notas) + buscar_cotizaciones
src/lib/cotizaciones/editor.ts(+test)        estado del editor, reducer, plantilla, payload de guardado, faltantes, MENSAJE_CONFLICTO (T3)
src/lib/cotizaciones/datos.ts(+test)         (+) mensajes de esquemaItem en castellano (T3)
src/lib/cotizaciones/lista.ts(+test)         filtros de la lista, resumen "Trabajo", estado visible, páginas (T2)
src/lib/cotizaciones/lista-vista.ts(+test)   fila de la lista ya armada, total de páginas, atajos y texto de fechas (T7)
src/lib/cotizaciones/editor-pantalla.ts(+test)   ids de campos, valores por defecto, campos visibles, resumen del encabezado (T8)
src/lib/cotizaciones/lecturas-editor.ts      catálogos, último firmante y contactos que leen las páginas (T8)
src/lib/cotizaciones/grilla.ts(+test)        filas y secciones de la grilla de ítems, precios, totales y foco (T9)
src/lib/cotizaciones/vista-previa.ts(+test)  modo, línea y errores del panel de vista previa (T11)
src/lib/cotizaciones/contexto-estado.ts      envíos, vencimiento, aprobación y anterior de una guardada (T11)
src/lib/cotizaciones/acciones-estado.ts(+test)   botones por estado, bloqueos, franjas, pendientes visibles, ?accion=, ⋯ de la lista (T12)
src/lib/cotizaciones/servicio.ts             (+) guardar, versión en enviar/aprobar, envioId, transiciones, vista previa (T4)
src/lib/cotizaciones/documento.ts            (+) bloques ocultos (T2); número null en una sin guardar (T3)
src/lib/plantillas/contenido.ts              (+) oculto en esquemaBloque (T2)
src/lib/plantillas/edicion.ts(+test)         negrita, viñetas, sangría y pegado desde Word sobre la selección (T10)
src/lib/format/fechas.ts                     (+) mesEnLetras (T2)
src/lib/formularios.ts                       (+) erroresPorRuta (T2)
src/lib/resultado.ts(+test)                  Resultado<T> y mensajeParaUsuario (acciones sin FormData) (T2)
src/lib/pdf/{estilos.ts,comunes.tsx,render.tsx,cotizacion-mensual.tsx,cotizacion-jornada.tsx}   (+) número null (T3); resaltar {{variables}} en la vista previa, con resaltar.test.ts (T4)
src/app/(app)/cotizaciones/page.tsx          lista (T7)
src/app/(app)/cotizaciones/nueva/page.tsx    editor (nueva) (T8)
src/app/(app)/cotizaciones/[id]/page.tsx     editor (existente) / solo lectura mínima de cargadas y directas; contexto (T11) y ?accion= (T12)
src/app/(app)/cotizaciones/actions.ts        Server Actions (T5)
src/app/(app)/cotizaciones/vista-previa/route.ts   POST → PDF del estado sin guardar (T5)
src/app/(app)/cotizaciones/[id]/pdf/route.ts (+) ?actual=1 (T5)
src/components/plantillas/texto-formateado.tsx     ConVariables, Segmentos, TextoBloque (extraídos de plantilla-form) (T6)
src/components/cotizaciones/estado-cotizacion.tsx  pastilla de estado (T6)
src/components/cotizaciones/cotizacion-solo-lectura.tsx   vista mínima de cargadas y directas (T8)
src/components/cotizaciones/lista/*          filtros, tabla, lista móvil, acciones de fila (con transiciones, T12), paginación (T7)
src/components/cotizaciones/editor/*         editor-cotizacion, encabezado-editor, barra-inferior, selector-cliente y tarjetas cliente, datos y asunto (T8);
                                             tarjeta-items (T9); tarjeta-textos (T10); panel-vista-previa (T11); acciones-editor y franjas-editor (T12)
src/components/formulario/confirmacion-en-lugar.tsx   confirmación sin modal (T8; tono éxito, textoCancelar y confirmarDeshabilitado en T12)
src/components/formulario/tarjeta.tsx        (+) ícono y bajada opcionales, acciones (T6)
src/components/app-shell/encabezado.tsx      (+) EncabezadoPagina compacto (T6)
src/components/app-shell/app-shell.tsx       (+) TooltipProvider (T6)
src/components/ui/conteo.tsx                 chip del total (T6)
src/components/ui/{popover,command,switch,toggle-group,toggle,tooltip}.tsx   (shadcn, T6)
tests/integration/cotizaciones-helpers.ts    (+) versionDe (T1)
tests/integration/cotizaciones-editor.test.ts      guardar con versión, buscar_cotizaciones (T1), servicio nuevo (T4)
tests/integration/cotizaciones-lecturas.test.ts    lecturas de las páginas del editor (T8)
tests/integration/cotizaciones-contexto.test.ts    leerContextoEstado (T11)
tests/e2e/cotizacion-vista-previa.spec.ts    POST de la vista previa y ?actual=1 (T5)
tests/e2e/base-datos.ts                      conBase, DATOS_COMPLETOS, crearCotizacionCompleta, borrarCotizaciones (T11)
tests/e2e/cotizaciones.spec.ts               lista (T7), editor (T8 a T12), flujo completo y conflicto (T13)
```

---

## Contratos compartidos (todas las tareas usan exactamente estos nombres)

### Base de datos (`20261027100000_cotizaciones_editor.sql`)

```sql
-- Reemplaza la versión de 3 parámetros (se borra con drop function ... (jsonb, jsonb, uuid)).
public.guardar_cotizacion(p_datos jsonb, p_items jsonb, p_id uuid default null, p_updated_at timestamptz default null) returns uuid
--   Igual que hoy, más: con p_id, bloquea la fila (for update) y llama a private.exigir_version(updated_at, p_updated_at)
--   antes de actualizar ('Falta la versión de la cotización' / 'La cotización cambió desde que la abriste; volvé a intentarlo').
--   Al actualizar, sin la clave notas conserva las que tenía (notas = coalesce(v.notas, c.notas)): el editor no las manda.
--   Sigue devolviendo solo el id: el servicio relee numero y updated_at (ventana de milisegundos aceptada, ver Task 4).

public.buscar_cotizaciones(
  texto text default '', estado text default '', cliente uuid default null, desde date default null, hasta date default null
) returns setof public.v_cotizaciones   -- language sql, stable, security invoker, search_path ''
--   texto: sin acentos (extensions.unaccent(lower(...))) contra cliente_razon_social y asunto, o numero::text que
--          empiece con los dígitos del texto. estado: '' = todos; 'borrador'|'aprobada'|'rechazada' exactos;
--          'enviada' = enviada y no vencida; 'vencida' = vencida. desde/hasta sobre fecha (inclusive).
--   Orden: numero desc. La paginación y el conteo los hace PostgREST:
--   supabase.rpc('buscar_cotizaciones', args, { count: 'exact' }).select(columnas).range(desde, hasta)
```

### Lógica pura

```ts
// src/lib/plantillas/contenido.ts
export const esquemaBloque = z.object({ titulo: z.string(), contenido: z.string(), oculto: z.boolean().default(false) })
export type Bloque = z.infer<typeof esquemaBloque>          // { titulo; contenido; oculto }

// src/lib/format/fechas.ts
export function mesEnLetras(mes: string): string            // '2026-11' → 'noviembre de 2026'; '' → ''

// src/lib/formularios.ts
export function erroresPorRuta(error: ZodError): Record<string, string>   // clave = path.join('.'), p. ej. 'items.2.precio'

// src/lib/resultado.ts  (lo usan las Server Actions que no reciben FormData)
export type Resultado<T = null> =
  | { ok: true; datos: T; mensaje?: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> }
export const MENSAJE_INESPERADO = 'No se pudo completar la operación. Probá de nuevo en un momento.'
export function mensajeParaUsuario(error: unknown): string
//   ErrorCotizacion → su mensaje; error de Postgres/PostgREST ({code, message}) → mensajeErrorBase, salvo un código
//   que mensajeErrorBase no traduce (su "No se pudo guardar…" no sirve para rechazar, duplicar o buscar) →
//   MENSAJE_INESPERADO; StorageError o desconocido → MENSAJE_INESPERADO (y console.error del original).
//   Las acciones hacen: try { … } catch (e) { unstable_rethrow(e); return { ok: false, mensaje: mensajeParaUsuario(e) } }

// src/lib/cotizaciones/lista.ts
export const POR_PAGINA = 25
export const ESTADOS_FILTRO = ['borrador', 'enviada', 'vencida', 'aprobada', 'rechazada'] as const
export type FiltrosLista = { q: string; estado: '' | (typeof ESTADOS_FILTRO)[number]; cliente: string; desde: string; hasta: string; pagina: number }
export function leerFiltros(searchParams: Record<string, string | string[] | undefined>): FiltrosLista   // Zod con .catch()
export function hrefConFiltros(filtros: FiltrosLista, cambios: Partial<FiltrosLista>): string   // '/cotizaciones?…' sin vacíos; cambiar un filtro vuelve a la página 1
export type EstadoVisible = 'borrador' | 'enviada' | 'vencida' | 'aprobada' | 'rechazada'
export function estadoVisible(estado: string, vencida: boolean | null): EstadoVisible
export function resumenCotizacion(fila: {
  numero: number; asunto: string; datos: unknown; equipo: { nombre: string; capacidad_tn: number | null; descripcion: string } | null
}): string
export function rangoPaginas(actual: number, total: number): (number | '…')[]   // p. ej. [1, '…', 4, 5, 6, '…', 12]

// src/lib/cotizaciones/editor.ts
export type ItemEditor = { clave: string; seccion: string; descripcion: string; cantidad: string; precio: string; unidad: Unidad }
export type BloqueEditor = { clave: string; titulo: string; contenido: string; oculto: boolean }
export type EstadoEditor = {
  id: string | null; version: string | null; numero: number | null
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada'; origen: 'app' | 'importada' | 'directa'
  cliente: { id: string; razon_social: string; cuit: string | null } | null
  contactoId: string                 // '' = Sin Atte.
  plantillaId: string; formato: Formato; equipoId: string; firmanteId: string
  fecha: string                      // 'YYYY-MM-DD'
  validezDias: string; mostrarTotal: boolean
  proximaActualizacion: string       // 'YYYY-MM' o ''
  asunto: string; intro: string
  datos: DatosCotizacion             // incluye proxima_actualizacion (texto) e indice_base
  items: ItemEditor[]; bloques: BloqueEditor[]
  reemplazaA: string | null          // solo cuenta al crear
}
export type PlantillaEditor = { id: string; nombre: string; formato: Formato; asunto: string; intro: string; validez_dias: number; bloques: Bloque[]; items: ItemPlantilla[] }
export type CatalogosEditor = {
  plantillas: PlantillaEditor[]
  equipos: { id: string; nombre: string; capacidad_tn: number | null; descripcion: string; activo: boolean }[]
  firmantes: { id: string; nombre: string; cargo: string; telefono: string; activo: boolean }[]
  empresa: FuenteDocumento['empresa']
}
/** El texto de private.exigir_version: lo usan el servicio (mismo error antes de generar un PDF) y el editor ("Recargar"). */
export const MENSAJE_CONFLICTO = 'La cotización cambió desde que la abriste; volvé a intentarlo'
export function nuevaClave(): string                                       // crypto.randomUUID(); fuera de un contexto seguro (http por IP), un respaldo
export function estadoNuevo(args: { plantilla: PlantillaEditor | null; firmanteId: string; hoy: string }): EstadoEditor
export const SELECT_EDITOR = `…`                                           // lo que lee la página [id]; FilaEditor es su fila (ver Task 3)
export function estadoDesdeFila(fila: FilaEditor): EstadoEditor
export const esquemaEstadoEditor = z.object({ … }) satisfies z.ZodType<EstadoEditor>   // solo la forma: el 400 de POST /cotizaciones/vista-previa
export function aplicarPlantilla(estado: EstadoEditor, plantilla: PlantillaEditor): EstadoEditor
export type AccionEditor =
  | { tipo: 'campo'; campo: 'contactoId' | 'equipoId' | 'firmanteId' | 'fecha' | 'validezDias' | 'proximaActualizacion' | 'asunto' | 'intro'; valor: string }
  | { tipo: 'dato'; campo: CampoDatos; valor: string }
  | { tipo: 'mostrarTotal'; valor: boolean }
  | { tipo: 'cliente'; cliente: EstadoEditor['cliente']; contactoId: string }
  | { tipo: 'plantilla'; plantilla: PlantillaEditor }
  | { tipo: 'agregarItem'; despuesDe?: string; seccion?: string }        // devuelve la fila nueva al final o después de `despuesDe`
  | { tipo: 'item'; clave: string; cambios: Partial<Omit<ItemEditor, 'clave'>> }
  | { tipo: 'moverItem'; desde: number; hasta: number }
  | { tipo: 'quitarItem'; clave: string }
  | { tipo: 'duplicarItem'; clave: string }
  | { tipo: 'renombrarSeccion'; clave: string; seccion: string }          // renombra el grupo consecutivo de esa fila
  | { tipo: 'agregarSeccion'; nombre: string }
  | { tipo: 'bloque'; clave: string; cambios: Partial<Omit<BloqueEditor, 'clave'>> }
  | { tipo: 'moverBloque'; clave: string; direccion: -1 | 1 }
  | { tipo: 'restaurarBloques'; bloques: Bloque[] }
  | { tipo: 'guardado'; id: string; version: string; numero: number }
  | { tipo: 'reemplazar'; estado: EstadoEditor }
export function reducirEditor(estado: EstadoEditor, accion: AccionEditor): EstadoEditor
//   'campo' con proximaActualizacion escribe también datos.proxima_actualizacion (mesEnLetras, o '' si se vacía: decisión 7).
export function hayCambios(guardado: EstadoEditor, actual: EstadoEditor): boolean   // compara el payload, no las claves
export type PayloadGuardar = { p_datos: Record<string, unknown>; p_items: Record<string, unknown>[] }
export function payloadGuardar(estado: EstadoEditor): { ok: true; payload: PayloadGuardar } | { ok: false; errores: Record<string, string> }
//   Valida con Zod (esquemaItem para cada ítem, precio con parsePrecio: '' = null; cantidad con coma decimal;
//   validez 1..365; cliente obligatorio) y arma p_datos con la cabecera COMPLETA (guardar_cotizacion pisa lo que
//   no se manda, salvo notas, que no van). Claves de error: 'cliente', 'validezDias', 'items.N.descripcion', 'items.N.cantidad', 'items.N.precio'…
export type Pendientes = { variables: NombreVariable[]; desconocidas: string[]; itemsSinPrecio: number; sinItems: boolean }
export function pendientesEditor(estado: EstadoEditor, catalogos: CatalogosEditor): Pendientes
//   Arma el FuenteDocumento con fuenteDesdeEditor y usa armarDocumento; excluye 'numero' si estado.id es null.
export function fuenteDesdeEditor(estado: EstadoEditor, catalogos: CatalogosEditor, contacto: { nombre: string; email: string } | null): FuenteDocumento
export function puedeEnviar(p: Pendientes): boolean
```

```ts
// src/lib/cotizaciones/acciones-estado.ts (Task 12; puro)
export type AccionConfirmable = 'aprobar' | 'rechazar' | 'reabrir' | 'revertir' | 'borrar'
export function accionDesdeParametro(valor: string | string[] | undefined): AccionConfirmable | null   // ?accion= de /cotizaciones/{id}
export function transicionesDeLista(fila: { estado: string; origen: string | null }): { accion: AccionConfirmable; etiqueta: string }[]
//   El ⋯ de cada fila de la lista: borrador → Eliminar borrador; enviada (también vencida) → Aprobar… y Rechazar…;
//   rechazada → Reabrir. Solo las de la app (origen null en FilaCotizacion). Llevan a /cotizaciones/{id}?accion={accion}.
export function motivoBloqueo(accion: AccionEstado, pendientes: Pendientes): string | null   // una nueva no se bloquea: guarda primero
```

### Servicio (`src/lib/cotizaciones/servicio.ts`, sin `server-only`)

```ts
export async function guardarCotizacion(supabase, payload: PayloadGuardar, id?: string, version?: string): Promise<{ id: string; numero: number; version: string }>
export async function enviarCotizacion(supabase, id: string, version?: string): Promise<{ envioId: string }>
export async function aprobarCotizacion(supabase, id: string, fecha?: string, version?: string): Promise<{ anterior: { id: string; numero: number } | null }>
//   anterior = la cotización de reemplaza_a si está aprobada con presupuesto_estado 'en_curso' (para ofrecer finalizarla).
export async function rechazarCotizacion(supabase, id: string): Promise<void>
export async function reabrirCotizacion(supabase, id: string): Promise<void>
export async function revertirAprobacion(supabase, id: string): Promise<void>
export async function borrarCotizacion(supabase, id: string): Promise<void>
export async function duplicarCotizacion(supabase, id: string): Promise<{ id: string }>
export async function finalizarPresupuesto(supabase, id: string): Promise<void>       // cambiar_estado_presupuesto(id, 'finalizado')
export type EntradaVistaPrevia = { estado: EstadoEditor }   // el servidor relee cliente, contacto, equipo, firmante y empresa por id
export async function vistaPrevia(supabase, entrada: EntradaVistaPrevia): Promise<Buffer>   // con variables resaltadas
export async function pdfParaMostrar(supabase, id: string, envioId?: string, opciones?: { actual?: boolean }): Promise<{ pdf: Buffer; nombreArchivo: string } | null>
//   actual: true → en una de la app no aprobada, genera la versión actual (no el último envío). Aprobada, cargada y directa, igual que hoy.
// renderizarCotizacion(doc, opciones?: { resaltarVariables?: boolean })   (src/lib/pdf/render.tsx)
```

### Server Actions (`src/app/(app)/cotizaciones/actions.ts`, `'use server'`)

Importan el servicio como `import * as servicio from '@/lib/cotizaciones/servicio'`. Todas llaman a `requireUsuario()`, validan los uuid y devuelven `Resultado<…>` (nunca tiran salvo redirect/notFound), y revalidan `/cotizaciones` y `/cotizaciones/{id}`.

```ts
export async function guardarCotizacion(estado: EstadoEditor): Promise<Resultado<{ id: string; numero: number; version: string }>>
export async function enviarCotizacion(id: string, version: string): Promise<Resultado<{ envioId: string }>>
export async function aprobarCotizacion(id: string, version: string, fecha: string): Promise<Resultado<{ anterior: { id: string; numero: number } | null }>>
export async function finalizarPresupuesto(id: string): Promise<Resultado>
export async function rechazarCotizacion(id: string): Promise<Resultado>
export async function reabrirCotizacion(id: string): Promise<Resultado>
export async function revertirAprobacion(id: string): Promise<Resultado>
export async function borrarCotizacion(id: string): Promise<Resultado>
export async function duplicarCotizacion(id: string): Promise<Resultado<{ id: string }>>
export async function buscarClientes(texto: string): Promise<Resultado<{ id: string; razon_social: string; cuit: string | null; activo: boolean }[]>>   // limite 20
export async function crearClienteRapido(razonSocial: string): Promise<Resultado<{ id: string; razon_social: string; cuit: string | null }>>
export async function contactosDeCliente(clienteId: string): Promise<Resultado<{ contactos: { id: string; nombre: string; email: string }[]; ultimoContactoId: string | null }>>
```

### Rutas

- `POST /cotizaciones/vista-previa` (`src/app/(app)/cotizaciones/vista-previa/route.ts`): cuerpo JSON `EntradaVistaPrevia`; 401 sin sesión activa, 400 si el cuerpo no valida, 200 `application/pdf` con `Cache-Control: private, no-store`.
- `GET /cotizaciones/{id}/pdf?actual=1`: como hoy, pero con `pdfParaMostrar(…, { actual: true })`.
- `/cotizaciones/{id}?accion=aprobar|rechazar|reabrir|revertir|borrar`: el editor abre esa confirmación al entrar, si la cotización la admite y no le falta nada, y saca el parámetro de la URL (Task 12). Lo usa el ⋯ de la lista.

### Componentes (nombres y ubicación)

- `src/components/plantillas/texto-formateado.tsx`: `ConVariables({ texto })`, `Segmentos({ segmentos })`, `TextoBloque({ contenido })` (se mueven desde `plantilla-form.tsx`, que pasa a importarlos).
- `src/components/cotizaciones/estado-cotizacion.tsx`: `EstadoCotizacion({ estado, vencida? })` (sin `vencida`, nunca "Vencida") y `ESTADOS_COTIZACION` (etiqueta y tono, también para el filtro de la lista).
- `src/components/formulario/tarjeta.tsx`: `Tarjeta` con `icono` y `descripcion` opcionales y prop nueva `acciones?: ReactNode` (a la derecha del título).
- `src/components/formulario/confirmacion-en-lugar.tsx`: `ConfirmacionEnLugar({ pregunta, detalle?, textoConfirmar, textoPendiente?, tono?: 'peligro' | 'aviso' | 'neutro' | 'exito', pendiente?, alConfirmar, alCancelar, children?, className?, textoCancelar?, confirmarDeshabilitado? })`: `role="group"` con el nombre de la pregunta, foco en Cancelar al montarse y Escape cancela (Task 8; `exito`, `textoCancelar` y `confirmarDeshabilitado` los suma la Task 12).
- `src/components/app-shell/encabezado.tsx`: `EncabezadoPagina` con prop nueva `compacto?: boolean`.
- `src/components/app-shell/app-shell.tsx`: envuelve el shell en `TooltipProvider` (el `tooltip` de `radix-nova` no lo trae).
- `src/components/ui/conteo.tsx`: `Conteo({ children })` (el chip gris del total, extraído de `clientes/page.tsx`, que pasa a usarlo).
- `src/components/cotizaciones/cotizacion-solo-lectura.tsx`: `CotizacionSoloLectura` (decisión 24).
- `src/components/cotizaciones/lista/`: `FiltrosCotizaciones`, `TablaCotizaciones`, `ListaCotizacionesMovil`, `AccionesFila({ id, numero, tienePdf, variante?, transiciones? })`, `Paginacion`.
- `src/components/cotizaciones/editor/`: `EditorCotizacion({ inicial, catalogos, contactos, hoy, contexto?, accionInicial? })` (raíz, cliente; `contexto` lo suma la Task 11 y `accionInicial`, el `?accion=` que lee la página, la Task 12), `EncabezadoEditor` (título, estado, Guardar y el hueco `acciones`), `FranjasEditor` (estado, pendientes, confirmaciones), `AccionesEncabezado` + `useAccionesEstado` (`acciones-editor.tsx`), `TarjetaCliente` + `SelectorCliente`, `TarjetaDatos`, `TarjetaAsunto`, `TarjetaItems`, `TarjetaTextos`, `PanelVistaPrevia`, `BarraInferior` (estado de guardado, hueco `vistaPrevia` y Guardar; sin transiciones, decisión 16).

---

## Tareas

1. **Migración:** `guardar_cotizacion` con versión (y sin borrar las notas que no vienen) y `buscar_cotizaciones`; ajustar los tests de integración existentes que actualizan con `guardar_cotizacion`; tests nuevos.
2. **Lógica pura de soporte:** bloques ocultos (esquema, `armarDocumento`, PDF), `mesEnLetras`, `erroresPorRuta`, `src/lib/resultado.ts` y `src/lib/cotizaciones/lista.ts`, con tests.
3. **Lógica pura del editor:** `src/lib/cotizaciones/editor.ts` completo con tests.
4. **Servicio:** guardar, versión y `envioId` en enviar/aprobar, transiciones, `finalizarPresupuesto`, `vistaPrevia`, `pdfParaMostrar` con `actual`, resaltado de variables en el PDF; tests de integración.
5. **Server Actions y rutas:** `actions.ts`, `POST /cotizaciones/vista-previa`, `?actual=1`.
6. **Piezas de UI compartidas y dependencias:** shadcn y dnd-kit, `texto-formateado`, `Tarjeta`, `EncabezadoPagina compacto`, `Conteo`, `EstadoCotizacion`.
7. **Lista de cotizaciones** (escritorio y celular) con E2E y verificación visual contra la 02.
8. **Editor: estructura, encabezado, Cliente, Datos y Asunto; guardar.** Páginas `nueva` y `[id]`, vista mínima de cargadas y directas.
9. **Editor: grilla de ítems.**
10. **Editor: textos.**
11. **Editor: vista previa.**
12. **Editor: acciones de estado, franjas y confirmaciones**, y las transiciones del ⋯ de la lista (`?accion=`).
13. **E2E del flujo completo, verificación visual contra la 02 y la 03, y README.**

---

### Task 1: Guardar con versión y búsqueda de cotizaciones (migración)

**Depende de:** nada del 3B (es la primera). Usa lo que dejó el 3A: `private.exigir_version`, `private.validar_contacto`, `private.reemplazar_items`, `private.hoy_argentina` y la vista `v_cotizaciones`.

**Qué deja:**
- `public.guardar_cotizacion(p_datos jsonb, p_items jsonb, p_id uuid default null, p_updated_at timestamptz default null) returns uuid`. Hace lo mismo que la de `supabase/migrations/20261025100100_cotizaciones_guardar.sql:72-125` (mismas columnas, mismos `coalesce`, mismos mensajes; una enviada editada sigue enviada; sin `fecha` conserva la que tenía) y además, con `p_id`, bloquea la fila (`for update`), revisa que se pueda editar y llama a `private.exigir_version(updated_at, p_updated_at)` antes de actualizar: sin versión da `'Falta la versión de la cotización'` y con una vieja `'La cotización cambió desde que la abriste; volvé a intentarlo'` (P0001). Un cambio más: al actualizar, sin la clave `notas` conserva las que tenía (antes las vaciaba). El editor no maneja notas y no las manda; el 3C las va a editar. La firma de 3 parámetros se borra.
- `public.buscar_cotizaciones(texto, estado, cliente, desde, hasta) returns setof public.v_cotizaciones` para la lista (Task 7): `language sql`, `stable`, `security invoker`, `search_path = ''`, orden `numero desc`. La paginación y el conteo los hace PostgREST: `supabase.rpc('buscar_cotizaciones', args, { count: 'exact' }).select(columnas).range(desde, hasta)`.
- El helper de tests `versionDe(cliente, id)` en `tests/integration/cotizaciones-helpers.ts`, que usan esta task y la 4.
- `tests/integration/cotizaciones-editor.test.ts`, al que la Task 4 le suma los tests del servicio.

**Files:**
- Create: `supabase/migrations/20261027100000_cotizaciones_editor.sql`, `tests/integration/cotizaciones-editor.test.ts`
- Modify: `tests/integration/cotizaciones-helpers.ts`, `tests/integration/cotizaciones.test.ts`, `tests/integration/cotizaciones-estados.test.ts`, `tests/integration/cotizaciones-servicio.test.ts`, `src/lib/supabase/database.types.ts` (generado)
- Test: `tests/integration/cotizaciones-editor.test.ts` y toda la suite de integración (`npm run test:int`)

- [ ] **Step 1: Helper `versionDe` para los tests**

La versión es el `updated_at` tal como lo devuelve la API (con microsegundos): es lo que va a leer la pantalla y lo que se manda al guardar, enviar y aprobar. En `tests/integration/cotizaciones-helpers.ts`, reemplazar las dos primeras líneas:

```ts
// tests/integration/cotizaciones-helpers.ts
import { sql } from './helpers'
```

por:

```ts
// tests/integration/cotizaciones-helpers.ts
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'
import { sql } from './helpers'
```

y agregar al final del archivo:

```ts

/** El updated_at de la cotización tal como lo devuelve la API: la versión que piden guardar, enviar y aprobar. */
export async function versionDe(cliente: SupabaseClient<Database>, id: string): Promise<string> {
  const { data, error } = await cliente.from('cotizaciones').select('updated_at').eq('id', id).single()
  if (error) throw error
  return data.updated_at
}
```

- [ ] **Step 2: Tests que fallan**

Crear `tests/integration/cotizaciones-editor.test.ts`. Las cotizaciones y el cliente de prueba llevan `notas = MARCA` para limpiarlos; el `afterAll` ya borra también los PDF que suban los tests del servicio (Task 4). La búsqueda usa `CLAVE` (solo letras) y no `MARCA`: un dígito en el texto también busca por número y traería cotizaciones de otros tests.

```ts
// tests/integration/cotizaciones-editor.test.ts
// Lo que agrega el editor de cotizaciones (plan 3B): guardar con versión y la búsqueda de la lista.
// La Task 4 suma acá los tests del servicio.
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
/** Letras al azar para buscar por texto: un dígito en la búsqueda también busca por número. */
const CLAVE = Array.from(crypto.getRandomValues(new Uint8Array(10)), (b) => String.fromCharCode(97 + (b % 26))).join('')
const CAMBIO = 'La cotización cambió desde que la abriste; volvé a intentarlo'

let activo: Awaited<ReturnType<typeof crearUsuario>>
let inactivo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  inactivo = await crearUsuario({ activo: false })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  try {
    // Los PDF que suben enviar y aprobar (tests del servicio): Storage no se limpia con SQL.
    const archivos = await sql<{ name: string }>(
      `select o.name from storage.objects o
       where o.bucket_id = 'documentos' and exists (
         select 1 from public.cotizaciones c where c.notas = $1 and o.name like 'cotizaciones/' || c.id || '/%')`,
      [MARCA],
    )
    if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
    await sql('delete from public.cotizaciones where notas = $1', [MARCA])
    await sql('delete from public.clientes where notas = $1', [MARCA])
  } finally {
    for (const u of [activo, inactivo]) await borrarUsuario(u.id)
  }
})

function datosBase(extra: Record<string, unknown> = {}) {
  return {
    cliente_id: ids.cliente_id,
    formato: 'jornada',
    fecha: '2026-10-22',
    asunto: 'Primera versión',
    notas: MARCA,
    ...extra,
  }
}

async function nueva(): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', { p_datos: datosBase(), p_items: ITEMS_JORNADA })
  if (error) throw new Error('No se pudo guardar la cotización: ' + error.message)
  return data
}

/** Actualiza la cotización con otro asunto mandando `version` como la versión leída (undefined: sin versión). */
function guardar(id: string, version: string | undefined, asunto: string, extra: Record<string, unknown> = {}) {
  return activo.client.rpc('guardar_cotizacion', {
    p_id: id,
    p_updated_at: version,
    p_datos: datosBase({ asunto, ...extra }),
    p_items: ITEMS_JORNADA,
  })
}

async function fila(id: string) {
  const [resultado] = await sql<{ asunto: string; estado: string; fecha: string }>(
    `select asunto, estado, to_char(fecha, 'YYYY-MM-DD') as fecha from public.cotizaciones where id = $1`,
    [id],
  )
  return resultado
}

describe('guardar_cotizacion con versión', () => {
  it('crear no pide versión; actualizar exige la que se leyó y la cambia', async () => {
    const id = await nueva()
    const sinVersion = await guardar(id, undefined, 'Sin versión')
    expect(sinVersion.error).toMatchObject({ code: 'P0001', message: 'Falta la versión de la cotización' })
    expect((await fila(id)).asunto).toBe('Primera versión')

    const leida = await versionDe(activo.client, id)
    expect((await guardar(id, leida, 'Segunda versión')).error).toBeNull()
    expect((await fila(id)).asunto).toBe('Segunda versión')
    expect(await versionDe(activo.client, id)).not.toBe(leida)
  })

  it('con una versión vieja no pisa lo que guardó otro', async () => {
    const id = await nueva()
    const leida = await versionDe(activo.client, id)
    expect((await guardar(id, leida, 'Guardado en otra pestaña')).error).toBeNull()

    const { error } = await guardar(id, leida, 'Guardado con la versión vieja')
    expect(error).toMatchObject({ code: 'P0001', message: CAMBIO })
    expect((await fila(id)).asunto).toBe('Guardado en otra pestaña')

    expect((await guardar(id, await versionDe(activo.client, id), 'Después de recargar')).error).toBeNull()
    expect((await fila(id)).asunto).toBe('Después de recargar')
  })

  it('compara la versión al milisegundo: pasarla por un Date de JS no la invalida', async () => {
    const id = await nueva()
    const enMilisegundos = new Date(await versionDe(activo.client, id)).toISOString()
    expect((await guardar(id, enMilisegundos, 'Con la versión de un Date')).error).toBeNull()
  })

  it('dos guardados a la vez con la misma versión: el segundo espera y no pisa al primero', async () => {
    const id = await nueva()
    const leida = await versionDe(activo.client, id)
    const { error } = await contraTransaccionEnCurso(
      activo.id,
      'select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3::uuid, $4::timestamptz)',
      [JSON.stringify(datosBase({ asunto: 'El que guardó primero' })), JSON.stringify(ITEMS_JORNADA), id, leida],
      () => guardar(id, leida, 'El que guardó segundo'),
    )
    expect(error).toMatchObject({ code: 'P0001', message: CAMBIO })
    expect((await fila(id)).asunto).toBe('El que guardó primero')
  })

  it('conserva lo de antes: una enviada editada sigue enviada y sin fecha conserva la suya', async () => {
    const id = await nueva()
    const enviada = await activo.client.rpc('marcar_enviada', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/enviada.pdf`,
      p_updated_at: await versionDe(activo.client, id),
    })
    expect(enviada.error).toBeNull()

    const { error } = await guardar(id, await versionDe(activo.client, id), 'Editada después de enviar', { fecha: null })
    expect(error).toBeNull()
    expect(await fila(id)).toEqual({ asunto: 'Editada después de enviar', estado: 'enviada', fecha: '2026-10-22' })
  })

  it('una aprobada o una que no existe no se editan, aunque manden una versión', async () => {
    const id = await nueva()
    const aprobada = await activo.client.rpc('aprobar_cotizacion', {
      p_id: id,
      p_pdf_path: `cotizaciones/${id}/aprobada.pdf`,
      p_updated_at: await versionDe(activo.client, id),
    })
    expect(aprobada.error).toBeNull()

    const { error } = await guardar(id, await versionDe(activo.client, id), 'No debería guardarse')
    expect(error).toMatchObject({ code: 'P0001', message: 'La cotización no existe o ya no se puede editar' })
    const inexistente = await guardar(crypto.randomUUID(), new Date().toISOString(), 'No debería guardarse')
    expect(inexistente.error?.message).toBe('La cotización no existe o ya no se puede editar')
  })

  it('sin la clave notas conserva las notas (el editor no las manda)', async () => {
    const id = await nueva()
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', asunto: 'Sin notas en el payload' },
      p_items: ITEMS_JORNADA,
    })
    expect(error).toBeNull()
    const [guardada] = await sql<{ asunto: string; notas: string }>(
      'select asunto, notas from public.cotizaciones where id = $1',
      [id],
    )
    expect(guardada).toEqual({ asunto: 'Sin notas en el payload', notas: MARCA })
  })

  it('un usuario inactivo no puede actualizar', async () => {
    const id = await nueva()
    const { error } = await inactivo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: datosBase({ asunto: 'Usuario inactivo' }),
      p_items: ITEMS_JORNADA,
    })
    expect(error?.code).toBe('42501')
    expect((await fila(id)).asunto).toBe('Primera versión')
  })
})

describe('buscar_cotizaciones', () => {
  type Insertada = { id: string; numero: number }
  const hoy = hoyArgentina()
  let cliente: string
  let filas: Record<'borrador' | 'aprobada' | 'rechazada' | 'vencida' | 'enviada' | 'otroCliente', Insertada>

  type Campos = { estado: string; fecha: string; asunto?: string; cliente?: string }

  async function insertar(campos: Campos): Promise<Insertada> {
    const aprobada = campos.estado === 'aprobada'
    const [insertada] = await sql<{ id: string; numero: string }>(
      `insert into public.cotizaciones
         (cliente_id, formato, equipo_id, notas, estado, fecha, validez_dias, asunto, fecha_aprobacion, presupuesto_estado)
       values ($1, 'jornada', $2, $3, $4, $5, 30, $6, $7, $8)
       returning id, numero`,
      [
        campos.cliente ?? cliente,
        ids.equipo_id,
        MARCA,
        campos.estado,
        campos.fecha,
        campos.asunto ?? '',
        aprobada ? campos.fecha : null,
        aprobada ? 'en_curso' : null,
      ],
    )
    return { id: insertada.id, numero: Number(insertada.numero) }
  }

  beforeAll(async () => {
    const [nuevo] = await sql<{ id: string }>(
      'insert into public.clientes (razon_social, notas) values ($1, $2) returning id',
      [`Grúas Ñandú ${CLAVE} S.A.`, MARCA],
    )
    cliente = nuevo.id
    // En orden de número. Las fechas fijas quedan lejos de hoy y de hoy - 40 para que el filtro de fechas no las mezcle.
    filas = {
      borrador: await insertar({ estado: 'borrador', fecha: '2025-03-01' }),
      aprobada: await insertar({ estado: 'aprobada', fecha: '2025-03-05' }),
      rechazada: await insertar({ estado: 'rechazada', fecha: '2025-03-10' }),
      vencida: await insertar({ estado: 'enviada', fecha: sumarDias(hoy, -40) }),
      enviada: await insertar({ estado: 'enviada', fecha: hoy }),
      otroCliente: await insertar({
        estado: 'borrador',
        fecha: '2025-03-01',
        cliente: ids.cliente_id,
        asunto: `Montaje ${CLAVE} en Añelo`,
      }),
    }
  })

  async function buscar(args: { texto?: string; estado?: string; cliente?: string; desde?: string; hasta?: string }) {
    const { data, error } = await activo.client.rpc('buscar_cotizaciones', args)
    if (error) throw error
    return data.map((encontrada) => encontrada.numero)
  }

  const numeros = (...nombres: (keyof typeof filas)[]) => nombres.map((nombre) => filas[nombre].numero)

  it('sin texto ni estado devuelve todas, de la más nueva a la más vieja por número', async () => {
    expect(await buscar({ cliente })).toEqual(numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador'))
  })

  it('busca sin acentos ni mayúsculas en la razón social y en el asunto', async () => {
    const todas = numeros('enviada', 'vencida', 'rechazada', 'aprobada', 'borrador')
    expect(await buscar({ texto: `NANDU ${CLAVE.toUpperCase()}` })).toEqual(todas)
    expect(await buscar({ texto: `ñandú ${CLAVE}` })).toEqual(todas)
    expect(await buscar({ texto: `${CLAVE} en ANELO` })).toEqual(numeros('otroCliente'))
  })

  it('busca por el comienzo del número, no por cualquier parte', async () => {
    const numero = String(filas.borrador.numero)
    expect(await buscar({ texto: `N° ${numero}`, cliente })).toEqual(numeros('borrador'))
    expect(await buscar({ texto: numero.slice(0, -1), cliente })).toContain(filas.borrador.numero)
    expect(await buscar({ texto: numero.slice(1), cliente })).toEqual([])
  })

  it('filtra por estado como la lista: "enviada" son las que están al día y "vencida" las otras', async () => {
    expect(await buscar({ cliente, estado: 'borrador' })).toEqual(numeros('borrador'))
    expect(await buscar({ cliente, estado: 'enviada' })).toEqual(numeros('enviada'))
    expect(await buscar({ cliente, estado: 'vencida' })).toEqual(numeros('vencida'))
    expect(await buscar({ cliente, estado: 'aprobada' })).toEqual(numeros('aprobada'))
    expect(await buscar({ cliente, estado: 'rechazada' })).toEqual(numeros('rechazada'))
  })

  it('filtra por rango de fechas, con los dos extremos incluidos', async () => {
    expect(await buscar({ cliente, desde: '2025-03-05', hasta: '2025-03-10' })).toEqual(numeros('rechazada', 'aprobada'))
    expect(await buscar({ cliente, hasta: '2025-03-01' })).toEqual(numeros('borrador'))
    expect(await buscar({ cliente, desde: hoy })).toEqual(numeros('enviada'))
  })

  it('pagina y cuenta como la lista (PostgREST) y deja embeber el equipo', async () => {
    const { data, count, error } = await activo.client
      .rpc('buscar_cotizaciones', { cliente }, { count: 'exact' })
      .select('id, numero, estado, vencida, cliente_razon_social, equipo:equipos(nombre, capacidad_tn, descripcion)')
      .range(2, 3)
    expect(error).toBeNull()
    expect(count).toBe(5)
    expect(data!.map((encontrada) => encontrada.numero)).toEqual(numeros('rechazada', 'aprobada'))
    expect(data![0]).toMatchObject({
      cliente_razon_social: `Grúas Ñandú ${CLAVE} S.A.`,
      equipo: { nombre: 'Grúa telescópica XCMG QY70K-1 40 TN' },
    })
  })

  it('un usuario inactivo no ve nada', async () => {
    const { data, error } = await inactivo.client.rpc('buscar_cotizaciones', { cliente })
    expect(error).toBeNull()
    expect(data).toEqual([])
  })
})
```

- [ ] **Step 3: Correr y ver que fallan**

```bash
npm run test:int -- tests/integration/cotizaciones-editor.test.ts
```

Expected: FAIL. Los de `buscar_cotizaciones` fallan con `Could not find the function public.buscar_cotizaciones(...) in the schema cache` (PGRST202); los que mandan `p_updated_at`, con el mismo error para `guardar_cotizacion(p_datos, p_id, p_items, p_updated_at)`; "crear no pide versión…" falla porque la función vieja guarda sin versión (`error` es `null`); el de los dos guardados a la vez, con `function public.guardar_cotizacion(jsonb, jsonb, uuid, timestamp with time zone) does not exist`.

- [ ] **Step 4: Migración**

Crear `supabase/migrations/20261027100000_cotizaciones_editor.sql`. El cuerpo de `guardar_cotizacion` es el de `20261025100100_cotizaciones_guardar.sql` con dos cambios en la rama de actualización:
- Antes del `update` van el `select … for update`, la revisión de que se pueda editar (el mismo mensaje y las mismas condiciones que tenía el `where` del `update`) y `exigir_version`. Primero se revisa si se puede editar y después la versión (el mismo orden que `marcar_enviada`): a una aprobada se le dice que ya no se edita, no que cambió.
- `notas = coalesce(v.notas, c.notas)`: sin la clave, quedan las que había (la fila `c` ya está leída y bloqueada). Al crear sigue siendo `coalesce(v.notas, '')`. En `buscar_cotizaciones` los parámetros se escriben `buscar_cotizaciones.estado`, etc.: en una función SQL, si una columna se llama igual que un parámetro (`v.estado`), gana la columna.

```sql
-- supabase/migrations/20261027100000_cotizaciones_editor.sql
-- Editor de cotizaciones (plan 3B):
-- 1. guardar_cotizacion con control de versión: con p_id exige el updated_at que vio la pantalla, igual que
--    marcar_enviada y aprobar_cotizacion. Sin esto, el último que guarda pisa lo que guardó otro (u otra pestaña).
-- 2. buscar_cotizaciones para la lista: sin acentos, por número parcial, razón social y asunto, con filtros.

-- Se borra la firma de 3 parámetros: si quedaran las dos, una llamada con p_datos, p_items y p_id sería ambigua.
drop function public.guardar_cotizacion(jsonb, jsonb, uuid);

-- Crea (p_id null) o actualiza una cotización en borrador o enviada, con todos sus ítems, en una transacción.
-- Solo se editan las armadas en la app: el documento de una cargada (importada) es su PDF original
-- (si se cargó mal, se borra y se vuelve a cargar: ver borrar_cotizacion).
-- Al actualizar, bloquea la fila antes de validar (un guardado, un envío o una aprobación simultáneos esperan) y
-- exige p_updated_at: el updated_at de la fila que se vio al editar, comparado al milisegundo (exigir_version).
-- Sin la clave notas conserva las que tenía: el editor no las maneja y no las manda.
create function public.guardar_cotizacion(
  p_datos jsonb,
  p_items jsonb,
  p_id uuid default null,
  p_updated_at timestamptz default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v public.cotizaciones%rowtype;
  c public.cotizaciones%rowtype;
  v_id uuid;
begin
  perform private.exigir_usuario_activo();
  v := jsonb_populate_record(null::public.cotizaciones, p_datos);
  perform private.validar_contacto(v.cliente_id, v.contacto_id);

  if p_id is null then
    insert into public.cotizaciones (
      fecha, cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro,
      datos, bloques, validez_dias, mostrar_total, fecha_proxima_actualizacion, notas, reemplaza_a
    ) values (
      coalesce(v.fecha, private.hoy_argentina()), v.cliente_id, v.contacto_id, v.formato, v.plantilla_id,
      v.equipo_id, v.firmante_id, coalesce(v.asunto, ''), coalesce(v.intro, ''), coalesce(v.datos, '{}'),
      coalesce(v.bloques, '[]'), coalesce(v.validez_dias, 30), coalesce(v.mostrar_total, false),
      v.fecha_proxima_actualizacion, coalesce(v.notas, ''), v.reemplaza_a
    )
    returning id into v_id;
  else
    select * into c from public.cotizaciones where id = p_id for update;
    if not found or c.estado not in ('borrador', 'enviada') or c.origen <> 'app' then
      raise exception 'La cotización no existe o ya no se puede editar' using errcode = 'P0001';
    end if;
    perform private.exigir_version(c.updated_at, p_updated_at);

    update public.cotizaciones set
      fecha = coalesce(v.fecha, fecha),
      cliente_id = v.cliente_id,
      contacto_id = v.contacto_id,
      formato = v.formato,
      plantilla_id = v.plantilla_id,
      equipo_id = v.equipo_id,
      firmante_id = v.firmante_id,
      asunto = coalesce(v.asunto, ''),
      intro = coalesce(v.intro, ''),
      datos = coalesce(v.datos, '{}'),
      bloques = coalesce(v.bloques, '[]'),
      validez_dias = coalesce(v.validez_dias, 30),
      mostrar_total = coalesce(v.mostrar_total, false),
      fecha_proxima_actualizacion = v.fecha_proxima_actualizacion,
      notas = coalesce(v.notas, c.notas)
    where id = p_id;
    v_id := p_id;
  end if;

  perform private.reemplazar_items(v_id, p_items);
  return v_id;
end;
$$;

grant execute on function public.guardar_cotizacion(jsonb, jsonb, uuid, timestamptz) to authenticated;

-- Búsqueda de la lista. SECURITY INVOKER: corre con la RLS de quien llama (un usuario inactivo no ve nada).
-- texto: sin acentos contra la razón social y el asunto, o el comienzo del número (con sus dígitos).
-- estado: '' = todos; 'enviada' = enviadas al día; 'vencida' = enviadas fuera de validez (como la pastilla);
-- el resto, exacto. desde/hasta: sobre la fecha de la cotización, inclusive.
-- La paginación y el conteo los hace PostgREST (range + count=exact). Los parámetros se nombran con el nombre
-- de la función: en una función SQL, una columna con el mismo nombre (estado) les gana.
create function public.buscar_cotizaciones(
  texto text default '',
  estado text default '',
  cliente uuid default null,
  desde date default null,
  hasta date default null
)
returns setof public.v_cotizaciones
language sql
stable
security invoker
set search_path = ''
as $$
  with consulta as (
    select
      extensions.unaccent(lower(btrim(coalesce(buscar_cotizaciones.texto, '')))) as normalizado,
      regexp_replace(coalesce(buscar_cotizaciones.texto, ''), '\D', '', 'g') as digitos
  ),
  patron as (
    select
      normalizado,
      digitos,
      '%' || replace(replace(replace(normalizado, '\', '\\'), '%', '\%'), '_', '\_') || '%' as como
    from consulta
  )
  select v.*
  from public.v_cotizaciones v, patron p
  where (
      p.normalizado = ''
      or extensions.unaccent(lower(v.cliente_razon_social)) like p.como
      or extensions.unaccent(lower(v.asunto)) like p.como
      or (p.digitos <> '' and v.numero::text like p.digitos || '%')
    )
    and case coalesce(buscar_cotizaciones.estado, '')
      when '' then true
      when 'enviada' then v.estado = 'enviada' and not v.vencida
      when 'vencida' then v.vencida
      else v.estado = buscar_cotizaciones.estado
    end
    and (buscar_cotizaciones.cliente is null or v.cliente_id = buscar_cotizaciones.cliente)
    and (buscar_cotizaciones.desde is null or v.fecha >= buscar_cotizaciones.desde)
    and (buscar_cotizaciones.hasta is null or v.fecha <= buscar_cotizaciones.hasta)
  order by v.numero desc;
$$;

grant execute on function public.buscar_cotizaciones(text, text, uuid, date, date) to authenticated;
```

- [ ] **Step 5: Aplicar y regenerar los tipos**

```bash
npm run db:reset && npm run db:types
git diff --stat src/lib/supabase/database.types.ts
grep -n '"guardar_cotizacion"' -A 1 src/lib/supabase/database.types.ts
grep -n '"buscar_cotizaciones"' -A 1 src/lib/supabase/database.types.ts
```

Expected: el reset aplica todas las migraciones sin errores. En los tipos, `guardar_cotizacion` pasa a tener `Args: { "p_datos": Json,"p_id"?: string,"p_items": Json,"p_updated_at"?: string }` y aparece `buscar_cotizaciones` con `Args: { "cliente"?: string,"desde"?: string,"estado"?: string,"hasta"?: string,"texto"?: string }`, `Returns` con las columnas de `v_cotizaciones` (incluidas `cliente_razon_social`, `vence_el` y `vencida`) y `SetofOptions` con `to: "v_cotizaciones"` (gracias a eso `.select('…, equipo:equipos(…)')` sobre la RPC queda tipado).

- [ ] **Step 6: Correr los tests nuevos**

```bash
npm run test:int -- tests/integration/cotizaciones-editor.test.ts
```

Expected: PASS (15 tests).

Si "pagina y cuenta como la lista (PostgREST) y deja embeber el equipo" falla con `PGRST200` (PostgREST no encuentra la relación con `equipos` sobre una función que devuelve `setof` de una **vista**, cosa que no se pudo probar al planificar), sacá de ese test solo el embebido: `.select('id, numero, estado, vencida, cliente_razon_social')` y la expectativa de `equipo`, y dejá anotado en el commit que la lista usa el plan B de la Task 7 (Step 9: una segunda consulta de los equipos por id). La migración no cambia.

- [ ] **Step 7: Ver qué tests existentes rompió la versión obligatoria**

Todos los que actualizan una cotización llaman a `guardar_cotizacion` con `p_id`:

```bash
grep -rn "guardar_cotizacion" tests/
npm run test:int
```

Expected del `grep`: llamadas con `p_id` solo en `cotizaciones.test.ts` (3: "al guardar de nuevo reemplaza los ítems", "una aprobada no se puede editar por RPC" y "una cargada (importada) no se edita"), `cotizaciones-estados.test.ts` (el SQL de `contraGuardadoEnCurso` y "no envía ni aprueba si la cotización cambió…") y `cotizaciones-servicio.test.ts` (el helper `editar`). Las de `presupuestos-estado.test.ts`, `cotizaciones-importar.test.ts` y las demás solo crean (sin `p_id`) y no cambian.

Expected de `npm run test:int`: FAIL en "al guardar de nuevo reemplaza los ítems", "no envía ni aprueba si la cotización cambió después de leer la versión", "aprobar espera a un guardado en curso…" y "marcar enviada espera a un guardado en curso…" (el guardado de la otra transacción tira `Falta la versión de la cotización`) y "una enviada o rechazada muestra su último envío…" (`editar`). Las dos de aprobada e importada siguen pasando (se revisa primero si se puede editar), pero también se les manda la versión.

- [ ] **Step 8: Ajustar los tests existentes**

**`tests/integration/cotizaciones.test.ts`**

Import:

```ts
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
```

→

```ts
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
```

En "al guardar de nuevo reemplaza los ítems":

```ts
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id!,
      p_datos: datosBase({ asunto: 'Nuevo asunto' }),
```

→

```ts
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id!,
      p_updated_at: await versionDe(activo.client, id!),
      p_datos: datosBase({ asunto: 'Nuevo asunto' }),
```

En "una aprobada no se puede editar por RPC":

```ts
    const { error } = await activo.client.rpc('guardar_cotizacion', { p_id: id, p_datos: datosBase(), p_items: [] })
```

→

```ts
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: datosBase(),
      p_items: [],
    })
```

En "una cargada (importada) no se edita…":

```ts
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_datos: datosBase({ asunto: 'Otro asunto' }),
```

→

```ts
    const { error } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: await versionDe(activo.client, id),
      p_datos: datosBase({ asunto: 'Otro asunto' }),
```

**`tests/integration/cotizaciones-estados.test.ts`**

`contraGuardadoEnCurso` recibe la versión con la que guarda la otra transacción:

```ts
/**
 * Corre `llamada` mientras otra transacción tiene a medio guardar la cotización (con un ítem sin precio)
 * y confirma ese guardado recién cuando la llamada ya está esperando.
 */
async function contraGuardadoEnCurso<T>(id: string, llamada: () => PromiseLike<T>): Promise<T> {
  return contraTransaccionEnCurso(
    activo.id,
    'select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3)',
    [
      JSON.stringify({ cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA }),
      JSON.stringify([{ descripcion: 'Sin precio', unidad: 'JORNADA' }]),
      id,
    ],
    llamada,
  )
}
```

→

```ts
/**
 * Corre `llamada` mientras otra transacción tiene a medio guardar la cotización (con un ítem sin precio, a partir
 * de la versión `leida`) y confirma ese guardado recién cuando la llamada ya está esperando.
 */
async function contraGuardadoEnCurso<T>(id: string, leida: string, llamada: () => PromiseLike<T>): Promise<T> {
  return contraTransaccionEnCurso(
    activo.id,
    'select public.guardar_cotizacion($1::jsonb, $2::jsonb, $3::uuid, $4::timestamptz)',
    [
      JSON.stringify({ cliente_id: ids.cliente_id, formato: 'jornada', fecha: '2026-10-22', notas: MARCA }),
      JSON.stringify([{ descripcion: 'Sin precio', unidad: 'JORNADA' }]),
      id,
      leida,
    ],
    llamada,
  )
}
```

Sus dos llamadas (en "aprobar espera a un guardado en curso…" y "marcar enviada espera a un guardado en curso…"), las dos iguales:

```ts
    const { error } = await contraGuardadoEnCurso(id, () =>
```

→

```ts
    const { error } = await contraGuardadoEnCurso(id, leida, () =>
```

En "no envía ni aprueba si la cotización cambió después de leer la versión":

```ts
    const { error: errorGuardar } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', asunto: 'Otro asunto', notas: MARCA },
```

→

```ts
    const { error: errorGuardar } = await activo.client.rpc('guardar_cotizacion', {
      p_id: id,
      p_updated_at: leida,
      p_datos: { cliente_id: ids.cliente_id, formato: 'jornada', asunto: 'Otro asunto', notas: MARCA },
```

**`tests/integration/cotizaciones-servicio.test.ts`**

Import:

```ts
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
```

→

```ts
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
```

En `editar`:

```ts
  const { error } = await activo.client.rpc('guardar_cotizacion', {
    p_id: id,
    p_datos: {
```

→

```ts
  const { error } = await activo.client.rpc('guardar_cotizacion', {
    p_id: id,
    p_updated_at: await versionDe(activo.client, id),
    p_datos: {
```

- [ ] **Step 9: Verificación**

```bash
npm run test:int
npm run check
```

Expected: PASS en toda la suite de integración (los archivos existentes más `cotizaciones-editor.test.ts`) y en `check` (lint, typecheck y unitarios). El typecheck valida que los tests manden `p_updated_at` con el tipo regenerado y que `servicio.ts` (que no cambia en esta task) siga compilando.

- [ ] **Step 10: Commit**

```bash
git add supabase/migrations/20261027100000_cotizaciones_editor.sql src/lib/supabase/database.types.ts \
  tests/integration/cotizaciones-editor.test.ts tests/integration/cotizaciones-helpers.ts \
  tests/integration/cotizaciones.test.ts tests/integration/cotizaciones-estados.test.ts \
  tests/integration/cotizaciones-servicio.test.ts
git commit -m "feat: guardar cotizaciones con control de versión y búsqueda para la lista

- guardar_cotizacion exige al actualizar la versión leída (p_updated_at): bloquea la fila y compara al milisegundo
- buscar_cotizaciones: sin acentos, por número parcial, razón social y asunto, con filtros de estado (enviada al día
  o vencida), cliente y fechas; pagina y cuenta PostgREST
- los tests de integración que actualizan cotizaciones mandan la versión

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 2: Lógica pura de soporte (bloques ocultos, mes en letras, errores por ruta, resultado de acciones y lista)

**Files:**
- Modify: `src/lib/plantillas/contenido.ts`, `src/lib/plantillas/contenido.test.ts`
- Modify: `src/lib/cotizaciones/documento.ts`, `src/lib/cotizaciones/documento.test.ts`, `src/lib/pdf/render.test.ts`
- Modify: `src/lib/format/fechas.ts`, `src/lib/format/fechas.test.ts`
- Modify: `src/lib/formularios.ts`, `src/lib/formularios.test.ts`
- Create: `src/lib/resultado.ts`, `src/lib/resultado.test.ts`
- Create: `src/lib/cotizaciones/lista.ts`, `src/lib/cotizaciones/lista.test.ts`
- Test: los `*.test.ts` de arriba (Vitest, proyecto `unit`)

Todo es lógica pura con tests unitarios; no hay migraciones ni pantallas. Lo usan las tareas siguientes:

- **Bloques ocultos (decisión 6):** `esquemaBloque` suma `oculto` (por defecto `false`, así los bloques ya guardados y los de las plantillas se leen visibles) y `armarDocumento` no dibuja los ocultos ni cuenta sus variables. El editor (Task 3 y Task 10) guarda el bloque con `oculto: true` y "Mostrar" lo recupera tal cual.
- **`mesEnLetras` (decisión 7):** `'2026-11'` → `'noviembre de 2026'`, el texto de la próxima actualización en el PDF. Se suman `esMes` y `esFecha`, que la Task 3 usa para validar sin tirar errores.
- **`erroresPorRuta`:** errores de Zod con la ruta completa (`'items.2.precio'`); `falloValidacion` solo guarda el primer tramo.
- **`src/lib/resultado.ts`:** `Resultado<T>` y `mensajeParaUsuario`, para las Server Actions de la Task 5 que reciben objetos y no FormData.
- **`src/lib/cotizaciones/lista.ts` (decisiones 2, 3, 4, 22 y 23):** filtros en la URL, estado visible ("Vencida"), columna "Trabajo" y páginas de la lista (Task 7).

Convenciones: comillas simples, sin punto y coma, 2 espacios, ~120 columnas, nombres y comentarios en castellano. Los módulos nuevos no importan `server-only` (Vitest los carga).

- [ ] **Step 1: Tests de bloques ocultos (fallan)**

En `src/lib/plantillas/contenido.test.ts`, reemplazar el `describe('leerBloques', …)` entero por:

```ts
describe('leerBloques', () => {
  it('acepta una lista de {titulo, contenido} y los deja visibles', () => {
    expect(leerBloques([{ titulo: 'Alcance', contenido: '- Item' }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', oculto: false },
    ])
  })

  it('conserva la marca de oculto', () => {
    expect(leerBloques([{ titulo: 'Alcance', contenido: '- Item', oculto: true }])).toEqual([
      { titulo: 'Alcance', contenido: '- Item', oculto: true },
    ])
  })

  it('rechaza datos con otra forma', () => {
    expect(() => leerBloques([{ titulo: 1 }])).toThrow()
    expect(() => leerBloques({})).toThrow()
    expect(() => leerBloques([{ titulo: 'Alcance', contenido: '', oculto: 'si' }])).toThrow()
  })
})
```

En `src/lib/cotizaciones/documento.test.ts`, dentro de `describe('armarDocumento', …)`, agregar estos dos casos justo antes de `it('arma el pie con los datos de la empresa', …)`:

```ts
  it('no dibuja los bloques ocultos ni cuenta sus variables', () => {
    const fuente = {
      ...EJEMPLO_JORNADA,
      cotizacion: {
        ...EJEMPLO_JORNADA.cotizacion,
        // Sin horario ni duración: las dos variables solo aparecen en "Alcance", que queda oculto.
        datos: { ...(EJEMPLO_JORNADA.cotizacion.datos as object), horario: '', duracion_estimada: '' },
        bloques: [
          ...EJEMPLO_JORNADA.cotizacion.bloques.map((bloque) =>
            bloque.titulo === 'Alcance' ? { ...bloque, oculto: true } : bloque,
          ),
          { titulo: 'Notas {{ubicación}}', contenido: '- {{plazo entrega}}', oculto: true },
        ],
      },
    }
    const doc = armarDocumento(fuente)
    expect(doc.bloques.map((bloque) => bloque.titulo)).toEqual(['Equipo ofrecido', ''])
    expect(doc.faltantes).toEqual([])
    expect(doc.desconocidas).toEqual([])
  })

  it('un bloque con oculto en false se dibuja igual que uno sin la marca', () => {
    const fuente = {
      ...EJEMPLO_JORNADA,
      cotizacion: {
        ...EJEMPLO_JORNADA.cotizacion,
        bloques: EJEMPLO_JORNADA.cotizacion.bloques.map((bloque) => ({ ...bloque, oculto: false })),
      },
    }
    expect(armarDocumento(fuente).bloques).toEqual(armarDocumento(EJEMPLO_JORNADA).bloques)
  })
```

Al final de `src/lib/pdf/render.test.ts`, agregar (confirma en el PDF real que el bloque oculto no sale, en los dos formatos):

```ts
describe('bloques ocultos', () => {
  it('un bloque oculto no sale en el PDF (por jornada y mensual)', async () => {
    const jornada = {
      ...EJEMPLO_JORNADA,
      cotizacion: {
        ...EJEMPLO_JORNADA.cotizacion,
        bloques: EJEMPLO_JORNADA.cotizacion.bloques.map((bloque) =>
          bloque.titulo === 'Alcance' ? { ...bloque, oculto: true } : bloque,
        ),
      },
    }
    const textoJornada = await textoDelPdf(await renderizarCotizacion(armarDocumento(jornada)))
    expect(textoJornada).toContain('Equipo ofrecido:')
    expect(textoJornada).toContain('Forma de pago: a 30 - 45 días F.F.')
    expect(textoJornada).not.toContain('Alcance')
    expect(textoJornada).not.toContain('Prestación mínima 8 hs')

    const mensual = {
      ...EJEMPLO_MENSUAL,
      cotizacion: {
        ...EJEMPLO_MENSUAL.cotizacion,
        bloques: EJEMPLO_MENSUAL.cotizacion.bloques.map((bloque) =>
          bloque.titulo === 'RENEGOCIACIÓN DE TARIFAS' ? { ...bloque, oculto: true } : bloque,
        ),
      },
    }
    const textoMensual = await textoDelPdf(await renderizarCotizacion(armarDocumento(mensual)))
    expect(textoMensual).toContain('CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS')
    expect(textoMensual).not.toContain('RENEGOCIACIÓN DE TARIFAS')
    expect(textoMensual).not.toContain('con base en junio 2026')
  }, 20_000)
})
```

```bash
npx vitest run src/lib/plantillas/contenido.test.ts src/lib/cotizaciones/documento.test.ts src/lib/pdf/render.test.ts
```

Expected: FAIL, 5 tests: los tres de `leerBloques` (`expected [ { titulo: 'Alcance', …(1) } ] to deeply equal [ { titulo: 'Alcance', …(2) } ]` y `expected [Function] to throw an error`), `no dibuja los bloques ocultos ni cuenta sus variables` (`expected [ 'Equipo ofrecido', 'Alcance', …(2) ] to deeply equal [ 'Equipo ofrecido', '' ]`) y `un bloque oculto no sale en el PDF` (`… not to contain 'Alcance'`).

- [ ] **Step 2: Implementar bloques ocultos**

En `src/lib/plantillas/contenido.ts`, reemplazar:

```ts
export const esquemaBloque = z.object({ titulo: z.string(), contenido: z.string() })
export type Bloque = z.infer<typeof esquemaBloque>
```

por:

```ts
/**
 * Un bloque de texto de la plantilla o de la cotización. `oculto`: se guarda con la cotización pero no sale en el
 * PDF, así "Mostrar" lo recupera tal cual estaba. Los bloques guardados antes de existir la marca se leen visibles.
 */
export const esquemaBloque = z.object({ titulo: z.string(), contenido: z.string(), oculto: z.boolean().default(false) })
export type Bloque = z.infer<typeof esquemaBloque>
```

`Bloque` pasa a ser `{ titulo: string; contenido: string; oculto: boolean }`. `leerBloques` no cambia (sigue tirando si la forma no es la esperada) y ahora devuelve `oculto: false` en los bloques que no traen la marca. Las plantillas de `configuracion/plantillas/[id]` y `frasesConVariables` siguen igual: sus bloques se leen con `oculto: false`.

En `src/lib/cotizaciones/documento.ts`, en `type FuenteDocumento`, reemplazar:

```ts
    datos: unknown
    bloques: { titulo: string; contenido: string }[]
  }
```

por:

```ts
    datos: unknown
    /** Los ocultos no se dibujan ni cuentan para las variables sin completar. */
    bloques: { titulo: string; contenido: string; oculto?: boolean }[]
  }
```

(`oculto` es opcional en la fuente para que `EJEMPLO_MENSUAL` y `EJEMPLO_JORNADA` de `ejemplos.ts` sigan valiendo sin cambios; lo que sale de `leerBloques` siempre lo trae.)

Y en el `return` de `armarDocumento`, reemplazar:

```ts
    bloques: fuente.cotizacion.bloques.map((bloque) => ({
      titulo: resolver(bloque.titulo),
      nodos: resolverBloque(bloque.contenido),
    })),
```

por:

```ts
    // Un bloque oculto sigue guardado en la cotización (para mostrarlo de nuevo tal cual), pero no sale en el PDF:
    // se filtra antes de resolver, así sus variables no figuran como faltantes ni como mal escritas.
    bloques: fuente.cotizacion.bloques
      .filter((bloque) => !bloque.oculto)
      .map((bloque) => ({
        titulo: resolver(bloque.titulo),
        nodos: resolverBloque(bloque.contenido),
      })),
```

Los componentes del PDF (`cotizacion-mensual.tsx`, `cotizacion-jornada.tsx`) no cambian: dibujan `doc.bloques`, que ya viene sin los ocultos. `servicio.ts` tampoco: `cargarFuente` lee con `leerBloques`, así que `documentoCompleto` (enviar y aprobar) ya no exige las variables de un bloque oculto.

```bash
npx vitest run src/lib/plantillas src/lib/cotizaciones src/lib/pdf
```

Expected: PASS (`contenido.test.ts` 6 tests, `documento.test.ts` 16, `render.test.ts` 3; el resto sin cambios).

- [ ] **Step 3: Tests de `mesEnLetras`, `esMes` y `esFecha` (fallan)**

En `src/lib/format/fechas.test.ts`, reemplazar el import por:

```ts
import {
  diasEntre,
  encabezadoFecha,
  esFecha,
  esMes,
  fechaEnLetras,
  formatFechaCorta,
  hoyArgentina,
  mesEnLetras,
  sumarDias,
} from './fechas'
```

y agregar al final del archivo:

```ts
describe('mesEnLetras', () => {
  it('escribe el mes como la próxima actualización del PDF', () => {
    expect(mesEnLetras('2026-11')).toBe('noviembre de 2026')
    expect(mesEnLetras('2027-01')).toBe('enero de 2027')
    expect(mesEnLetras('2026-09')).toBe('septiembre de 2026')
    expect(mesEnLetras('2026-12')).toBe('diciembre de 2026')
  })

  it('un mes vacío queda vacío', () => {
    expect(mesEnLetras('')).toBe('')
  })

  it.each(['2026-13', '2026-00', '2026-1', '26-11', '2026/11', '2026-11-01', ' 2026-11', '0999-11', 'noviembre'])(
    'rechaza %j',
    (mes) => {
      expect(() => mesEnLetras(mes)).toThrow('Mes inválido')
    },
  )
})

describe('esMes y esFecha', () => {
  it('esMes acepta solo YYYY-MM con un mes que existe', () => {
    expect(esMes('2026-11')).toBe(true)
    expect(esMes('2026-13')).toBe(false)
    expect(esMes('')).toBe(false)
  })

  it('esFecha acepta solo fechas que existen en el calendario', () => {
    expect(esFecha('2026-10-22')).toBe(true)
    expect(esFecha('2028-02-29')).toBe(true)
    expect(esFecha('2026-02-30')).toBe(false)
    expect(esFecha('0050-01-01')).toBe(false)
    expect(esFecha('22/10/2026')).toBe(false)
    expect(esFecha('')).toBe(false)
  })
})
```

```bash
npx vitest run src/lib/format/fechas.test.ts
```

Expected: FAIL con `TypeError: mesEnLetras is not a function` (y lo mismo con `esMes` y `esFecha`).

- [ ] **Step 4: Implementar `mesEnLetras`, `esMes` y `esFecha`**

En `src/lib/format/fechas.ts`, agregar justo antes de `/** "Neuquén, 22 de octubre de 2026." */` (usan `MESES` y `partes`, que ya están arriba en el archivo):

```ts
/** true si es una fecha 'YYYY-MM-DD' que existe (la misma regla que usan las funciones de este archivo). */
export function esFecha(iso: string): boolean {
  try {
    partes(iso)
    return true
  } catch {
    return false
  }
}

// 'YYYY-MM' como lo devuelve <input type="month">. El año arranca en 1000 por la misma razón que en `partes`.
const PATRON_MES = /^([1-9]\d{3})-(0[1-9]|1[0-2])$/

/** true si es un mes 'YYYY-MM' válido. */
export function esMes(mes: string): boolean {
  return PATRON_MES.test(mes)
}

/** "2026-11" → "noviembre de 2026" (como se escribe la próxima actualización en el PDF); "" → "". */
export function mesEnLetras(mes: string): string {
  if (mes === '') return ''
  const m = PATRON_MES.exec(mes)
  if (!m) throw new Error(`Mes inválido: ${mes}`)
  return `${MESES[Number(m[2]) - 1]} de ${m[1]}`
}
```

```bash
npx vitest run src/lib/format/fechas.test.ts
```

Expected: PASS (23 tests).

- [ ] **Step 5: Tests de `erroresPorRuta` (fallan)**

En `src/lib/formularios.test.ts`, reemplazar el import de `./formularios` por:

```ts
import { erroresPorRuta, exito, falloBase, falloValidacion, leerCampos, valorCampo } from './formularios'
```

y agregar este `describe` justo antes de `describe('falloBase', …)`:

```ts
describe('erroresPorRuta', () => {
  const esquema = z.object({
    cliente: z.string().min(1, 'Elegí el cliente'),
    items: z.array(
      z.object({
        descripcion: z.string().min(1, 'Falta la descripción'),
        precio: z.number('Precio inválido').nonnegative('El precio no puede ser negativo'),
      }),
    ),
    datos: z.object({ ubicacion: z.string().max(3, 'Máximo 3 caracteres') }),
  })

  function errores(valor: unknown) {
    const resultado = esquema.safeParse(valor)
    if (resultado.success) throw new Error('debería fallar')
    return erroresPorRuta(resultado.error)
  }

  it('usa la ruta completa como clave, con los índices de las listas', () => {
    expect(
      errores({
        cliente: '',
        items: [
          { descripcion: 'Jornada', precio: 1 },
          { descripcion: '', precio: -1 },
          { descripcion: 'Viaje', precio: 'abc' },
        ],
        datos: { ubicacion: 'Neuquén' },
      }),
    ).toEqual({
      cliente: 'Elegí el cliente',
      'items.1.descripcion': 'Falta la descripción',
      'items.1.precio': 'El precio no puede ser negativo',
      'items.2.precio': 'Precio inválido',
      'datos.ubicacion': 'Máximo 3 caracteres',
    })
  })

  it('se queda con el primer mensaje de cada ruta', () => {
    const doble = z.object({ nombre: z.string().min(3, 'Muy corto').regex(/^[a-z]+$/, 'Solo minúsculas') })
    const resultado = doble.safeParse({ nombre: 'A' })
    if (resultado.success) throw new Error('debería fallar')
    expect(erroresPorRuta(resultado.error)).toEqual({ nombre: 'Muy corto' })
  })

  it('un error del objeto entero queda con la clave vacía', () => {
    const conRegla = z
      .object({ desde: z.number(), hasta: z.number() })
      .refine((rango) => rango.desde <= rango.hasta, 'Rango invertido')
    const resultado = conRegla.safeParse({ desde: 2, hasta: 1 })
    if (resultado.success) throw new Error('debería fallar')
    expect(erroresPorRuta(resultado.error)).toEqual({ '': 'Rango invertido' })
  })

  it('una ruta con nombre de propiedad heredada no choca con el objeto', () => {
    const raro = z.object({ constructor: z.string('Texto requerido') })
    const resultado = raro.safeParse({ constructor: 1 })
    if (resultado.success) throw new Error('debería fallar')
    expect(erroresPorRuta(resultado.error)).toEqual({ constructor: 'Texto requerido' })
  })
})
```

```bash
npx vitest run src/lib/formularios.test.ts
```

Expected: FAIL, 4 tests con `TypeError: erroresPorRuta is not a function`.

- [ ] **Step 6: Implementar `erroresPorRuta`**

En `src/lib/formularios.ts`, agregar justo antes de `type ErrorBase = { code?: string; message: string }`:

```ts
/**
 * Errores de Zod con la ruta completa como clave ('items.2.precio', 'datos.ubicacion'; '' si el error es del objeto
 * entero), con el primer mensaje de cada ruta. Para los formularios con listas, donde `falloValidacion` no alcanza
 * (se queda con el primer tramo de la ruta).
 */
export function erroresPorRuta(error: ZodError): Record<string, string> {
  // Un Map y no un objeto: una ruta como 'constructor' o '__proto__' no choca con las propiedades heredadas.
  const errores = new Map<string, string>()
  for (const issue of error.issues) {
    const ruta = issue.path.map(String).join('.')
    if (!errores.has(ruta)) errores.set(ruta, issue.message)
  }
  return Object.fromEntries(errores)
}
```

(`ZodError` ya está importado como tipo en la primera línea del archivo.)

```bash
npx vitest run src/lib/formularios.test.ts
```

Expected: PASS (10 tests).

- [ ] **Step 7: Tests de `resultado.ts` (fallan)**

Crear `src/lib/resultado.test.ts`:

```ts
import { PostgrestError, StorageApiError } from '@supabase/supabase-js'
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { z } from 'zod'
import { ErrorCotizacion } from '@/lib/cotizaciones/servicio'
import { MENSAJE_INESPERADO, mensajeParaUsuario, type Resultado } from './resultado'

describe('mensajeParaUsuario', () => {
  let consola: MockInstance<typeof console.error>

  beforeEach(() => {
    consola = vi.spyOn(console, 'error').mockImplementation(() => {})
  })

  afterEach(() => {
    consola.mockRestore()
  })

  it('un ErrorCotizacion llega con su mensaje y no se registra', () => {
    expect(mensajeParaUsuario(new ErrorCotizacion('Hay ítems sin precio'))).toBe('Hay ítems sin precio')
    expect(consola).not.toHaveBeenCalled()
  })

  it('una regla de negocio de la base (P0001) llega con su texto y no se registra', () => {
    const error = { code: 'P0001', message: 'La cotización cambió desde que la abriste; volvé a intentarlo' }
    expect(mensajeParaUsuario(error)).toBe('La cotización cambió desde que la abriste; volvé a intentarlo')
    expect(consola).not.toHaveBeenCalled()
  })

  it('los demás errores de la base se traducen con mensajeErrorBase y se registran', () => {
    const permiso = { code: '42501', message: 'Tu usuario no está habilitado', details: null, hint: null }
    expect(mensajeParaUsuario(permiso)).toBe('No tenés permiso para hacer esta operación')
    expect(mensajeParaUsuario({ code: '23514', message: 'check' })).toBe('Algún dato no es válido')
    expect(mensajeParaUsuario({ code: '22003', message: 'overflow' })).toBe('Algún número es demasiado grande')
    // Lo que mensajeErrorBase no traduce dice "No se pudo guardar…": acá hay acciones que no guardan (rechazar,
    // duplicar, buscar clientes), así que va el genérico.
    expect(mensajeParaUsuario({ code: '23503', message: 'fk' })).toBe(MENSAJE_INESPERADO)
    expect(mensajeParaUsuario({ code: 'PGRST116', message: 'varias filas' })).toBe(MENSAJE_INESPERADO)
    expect(consola).toHaveBeenCalledTimes(5)
    expect(consola).toHaveBeenCalledWith(permiso)
  })

  it('un PostgrestError (la clase) también es un error de la base', () => {
    const error = new PostgrestError({ message: 'Hay ítems sin precio', details: '', hint: '', code: 'P0001' })
    expect(mensajeParaUsuario(error)).toBe('Hay ítems sin precio')
  })

  it('un error de Storage da el mensaje genérico aunque traiga código', () => {
    const error = new StorageApiError('The resource already exists', 409, '409', 'storage', 'ResourceAlreadyExists')
    expect(mensajeParaUsuario(error)).toBe(MENSAJE_INESPERADO)
    expect(consola).toHaveBeenCalledWith(error)
  })

  it('una falla de red de PostgREST (sin código) da el mensaje genérico', () => {
    const error = new PostgrestError({ message: 'FetchError: fetch failed', details: '', hint: '', code: '' })
    expect(mensajeParaUsuario(error)).toBe(MENSAJE_INESPERADO)
  })

  it('cualquier otra cosa da el mensaje genérico y se registra', () => {
    const errorNode = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    for (const error of [new Error('boom'), errorNode, z.string().safeParse(1).error, 'texto', undefined, null]) {
      expect(mensajeParaUsuario(error)).toBe(MENSAJE_INESPERADO)
    }
    expect(consola).toHaveBeenCalledTimes(6)
  })
})

describe('Resultado', () => {
  it('distingue el éxito (con datos) del fallo (con mensaje y errores opcionales)', () => {
    const exito: Resultado<{ id: string }> = { ok: true, datos: { id: 'x' } }
    const fallo: Resultado<{ id: string }> = {
      ok: false,
      mensaje: 'Revisá los datos marcados',
      errores: { cliente: 'Elegí el cliente' },
    }
    const sinDatos: Resultado = { ok: true, datos: null, mensaje: 'Cotización rechazada' }
    expect([exito.ok, fallo.ok, sinDatos.ok]).toEqual([true, false, true])
  })
})
```

```bash
npx vitest run src/lib/resultado.test.ts
```

Expected: FAIL con `Error: Cannot find module './resultado' imported from …/src/lib/resultado.test.ts`.

- [ ] **Step 8: Implementar `src/lib/resultado.ts`**

Cómo se distinguen los errores (verificado contra `@supabase/supabase-js` 2.118 instalado):
- PostgREST devuelve el error como objeto plano `{ code, details, hint, message }` (o como instancia de `PostgrestError` con la misma forma). `servicio.ts` lo tira tal cual.
- `StorageError`/`StorageApiError` de storage-js también pueden traer `code` (`'NoSuchKey'`, `'ResourceAlreadyExists'`), pero llevan la propiedad `__isStorageError` (es lo que mira `isStorageError` de storage-js).
- Los códigos de la base son SQLSTATE (5 caracteres en mayúsculas y dígitos) o `PGRST…`; un error de Node (`'ECONNREFUSED'`) o una falla de red de PostgREST (`code: ''`) no lo son.

Crear `src/lib/resultado.ts`:

```ts
// src/lib/resultado.ts
// Respuesta de las Server Actions que no reciben FormData (el editor de cotizaciones manda objetos).
// Solo para el servidor: importa el servicio de cotizaciones, que dibuja PDFs. Los componentes de cliente
// importan solo el tipo (`import type { Resultado } from '@/lib/resultado'`).
import { ErrorCotizacion } from '@/lib/cotizaciones/servicio'
import { mensajeErrorBase } from '@/lib/formularios'

export type Resultado<T = null> =
  | { ok: true; datos: T; mensaje?: string }
  | { ok: false; mensaje: string; errores?: Record<string, string> }

export const MENSAJE_INESPERADO = 'No se pudo completar la operación. Probá de nuevo en un momento.'

// Códigos de Postgres (SQLSTATE: 5 caracteres) y de PostgREST (PGRST116…). Un error de Storage también trae `code`
// ('NoSuchKey'), pero no es de la base: se separa por la marca de storage-js y por la forma del código.
const CODIGO_BASE = /^(?:[0-9A-Z]{5}|PGRST\d+)$/

function esErrorDeBase(error: unknown): error is { code: string; message: string } {
  if (typeof error !== 'object' || error === null || '__isStorageError' in error) return false
  const { code, message } = error as { code?: unknown; message?: unknown }
  return typeof code === 'string' && CODIGO_BASE.test(code) && typeof message === 'string'
}

/** Lo que devuelve mensajeErrorBase para un código que no traduce ("No se pudo guardar…"). */
const SIN_TRADUCCION = mensajeErrorBase({ code: '', message: '' })

/**
 * Mensaje para mostrarle al usuario a partir de lo que tiró el servicio o la base.
 * Uso en una acción:
 * `try { … } catch (e) { unstable_rethrow(e); return { ok: false, mensaje: mensajeParaUsuario(e) } }`.
 * - ErrorCotizacion: su mensaje (ya está pensado para el usuario).
 * - Error de Postgres/PostgREST: `mensajeErrorBase` (P0001 trae el texto de la regla de negocio). Un código que
 *   mensajeErrorBase no traduce da el genérico: su texto por defecto habla de guardar, y rechazar, duplicar o buscar
 *   no guardan.
 * - Storage, errores de programación o cualquier otra cosa: un mensaje genérico.
 * Todo lo que no es una regla de negocio se registra con console.error para poder rastrearlo en el servidor.
 */
export function mensajeParaUsuario(error: unknown): string {
  if (error instanceof ErrorCotizacion) return error.message
  if (esErrorDeBase(error)) {
    if (error.code !== 'P0001') console.error(error)
    const mensaje = mensajeErrorBase(error)
    return mensaje === SIN_TRADUCCION ? MENSAJE_INESPERADO : mensaje
  }
  console.error(error)
  return MENSAJE_INESPERADO
}
```

Importante para las tareas siguientes: `servicio.ts` **no** puede importar `resultado.ts` (sería un import circular), y un componente `'use client'` importa de acá solo tipos, con `import type`.

```bash
npx vitest run src/lib/resultado.test.ts
```

Expected: PASS (8 tests).

- [ ] **Step 9: Tests de `lista.ts` (fallan)**

Crear `src/lib/cotizaciones/lista.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  ESTADOS_FILTRO,
  POR_PAGINA,
  estadoVisible,
  hrefConFiltros,
  leerFiltros,
  rangoPaginas,
  resumenCotizacion,
  type FiltrosLista,
} from './lista'

const CLIENTE = '0b0f6a43-5d1c-4c1e-9a52-6f1f4f6a2b10'
const VACIOS: FiltrosLista = { q: '', estado: '', cliente: '', desde: '', hasta: '', pagina: 1 }

describe('constantes', () => {
  it('pagina de a 25 y filtra por los cinco estados visibles', () => {
    expect(POR_PAGINA).toBe(25)
    expect(ESTADOS_FILTRO).toEqual(['borrador', 'enviada', 'vencida', 'aprobada', 'rechazada'])
  })
})

describe('leerFiltros', () => {
  it('sin parámetros devuelve todo vacío y la página 1', () => {
    expect(leerFiltros({})).toEqual(VACIOS)
  })

  it('lee todos los filtros válidos', () => {
    const parametros = { q: 'grúa', estado: 'vencida', cliente: CLIENTE, desde: '2026-10-01', hasta: '2026-10-31' }
    expect(leerFiltros({ ...parametros, pagina: '3' })).toEqual({ ...parametros, pagina: 3 })
  })

  it('con parámetros repetidos se queda con el primero', () => {
    const repetidos = { q: ['vertice', 'milicic'], estado: ['enviada', 'borrador'], pagina: ['2', '5'] }
    expect(leerFiltros(repetidos)).toMatchObject({ q: 'vertice', estado: 'enviada', pagina: 2 })
  })

  it('recorta la búsqueda y la limita a 100 caracteres', () => {
    expect(leerFiltros({ q: '   112711  ' }).q).toBe('112711')
    expect(leerFiltros({ q: 'x'.repeat(150) }).q).toHaveLength(100)
  })

  it('un estado desconocido o vacío queda en "todos"', () => {
    expect(leerFiltros({ estado: 'anulada' }).estado).toBe('')
    expect(leerFiltros({ estado: 'ENVIADA' }).estado).toBe('')
    expect(leerFiltros({ estado: '' }).estado).toBe('')
  })

  it('un cliente que no es UUID se ignora', () => {
    expect(leerFiltros({ cliente: 'vertice' }).cliente).toBe('')
    expect(leerFiltros({ cliente: '' }).cliente).toBe('')
  })

  it('las fechas mal formadas o que no existen se ignoran sin tocar las demás', () => {
    expect(leerFiltros({ desde: '01/10/2026', hasta: '2026-10-31' })).toMatchObject({ desde: '', hasta: '2026-10-31' })
    expect(leerFiltros({ desde: '2026-02-30' }).desde).toBe('')
    expect(leerFiltros({ hasta: '2026-13-01' }).hasta).toBe('')
  })

  it('da vuelta un rango invertido', () => {
    expect(leerFiltros({ desde: '2026-10-31', hasta: '2026-10-01' })).toMatchObject({
      desde: '2026-10-01',
      hasta: '2026-10-31',
    })
  })

  it.each(['', 'abc', '0', '-2', '2.5', '1e3', '99999999'])('una página inválida (%j) vuelve a la 1', (pagina) => {
    expect(leerFiltros({ pagina }).pagina).toBe(1)
  })

  it('un filtro inválido no arrastra a los demás', () => {
    expect(leerFiltros({ q: 'vertice', estado: 'x', cliente: 'y', pagina: 'z' })).toEqual({ ...VACIOS, q: 'vertice' })
  })
})

describe('hrefConFiltros', () => {
  const filtros: FiltrosLista = { ...VACIOS, q: 'grúa 40', estado: 'enviada', pagina: 3 }

  it('sin filtros es la lista sola', () => {
    expect(hrefConFiltros(VACIOS, {})).toBe('/cotizaciones')
  })

  it('cambiar de página conserva los filtros', () => {
    expect(hrefConFiltros(filtros, { pagina: 4 })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada&pagina=4')
  })

  it('la página 1 no va en la URL', () => {
    expect(hrefConFiltros(filtros, { pagina: 1 })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada')
  })

  it('cambiar un filtro vuelve a la página 1', () => {
    expect(hrefConFiltros(filtros, { estado: 'vencida' })).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=vencida')
    expect(hrefConFiltros(filtros, { cliente: CLIENTE })).toBe(
      `/cotizaciones?q=gr%C3%BAa+40&estado=enviada&cliente=${CLIENTE}`,
    )
  })

  it('sin cambios conserva la página', () => {
    expect(hrefConFiltros(filtros, {})).toBe('/cotizaciones?q=gr%C3%BAa+40&estado=enviada&pagina=3')
  })

  it('arma las fechas y saca los filtros vacíos', () => {
    expect(hrefConFiltros(filtros, { q: '', estado: '', desde: '2026-10-01', hasta: '2026-10-31' })).toBe(
      '/cotizaciones?desde=2026-10-01&hasta=2026-10-31',
    )
  })

  it('limpiar todos los filtros deja la lista sola', () => {
    expect(hrefConFiltros(filtros, { q: '', estado: '', cliente: '', desde: '', hasta: '' })).toBe('/cotizaciones')
  })

  it('lo que arma se vuelve a leer igual', () => {
    const completo: FiltrosLista = {
      q: 'Ñandú & hijos',
      estado: 'rechazada',
      cliente: CLIENTE,
      desde: '2026-01-01',
      hasta: '2026-12-31',
      pagina: 2,
    }
    const url = new URL(hrefConFiltros(completo, { pagina: 2 }), 'http://localhost')
    expect(leerFiltros(Object.fromEntries(url.searchParams))).toEqual(completo)
  })
})

describe('estadoVisible', () => {
  it('una enviada vencida se ve como vencida', () => {
    expect(estadoVisible('enviada', true)).toBe('vencida')
  })

  it('una enviada al día (o sin el dato) se ve como enviada', () => {
    expect(estadoVisible('enviada', false)).toBe('enviada')
    expect(estadoVisible('enviada', null)).toBe('enviada')
  })

  it('los demás estados se ven como están, aunque la marca de vencida venga en true', () => {
    expect(estadoVisible('borrador', false)).toBe('borrador')
    expect(estadoVisible('aprobada', true)).toBe('aprobada')
    expect(estadoVisible('rechazada', null)).toBe('rechazada')
  })

  it('un estado desconocido es un error de programación', () => {
    expect(() => estadoVisible('anulada', false)).toThrow('Estado de cotización desconocido: anulada')
  })
})

describe('resumenCotizacion', () => {
  const equipo40 = {
    nombre: 'Grúa telescópica XCMG QY70K-1 40 TN',
    capacidad_tn: 40,
    descripcion: 'Grúa Telescópica marca XCMG modelo QY70K-1 de 40 TN',
  }
  const asuntoJornada =
    'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.'

  it('resuelve número y capacidad en el asunto de la plantilla por jornada', () => {
    expect(resumenCotizacion({ numero: 112711, asunto: asuntoJornada, datos: {}, equipo: equipo40 })).toBe(
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
    )
  })

  it('quita las variables que no se pueden resolver y los espacios que quedan', () => {
    expect(resumenCotizacion({ numero: 112712, asunto: asuntoJornada, datos: {}, equipo: null })).toBe(
      'Cotización N° 112712 alquiler de 1 (una) Grúa Telescópica capacidad TN con operador.',
    )
    const conFaltantes = { numero: 1, asunto: 'Izaje en {{ubicacion}} , {{ubicación}} norte', datos: {}, equipo: null }
    expect(resumenCotizacion(conFaltantes)).toBe('Izaje en, norte')
  })

  it('usa los datos de la cotización y la capacidad con coma decimal', () => {
    const fila = {
      numero: 1,
      asunto: 'Grúa de {{capacidad}} TN en {{ubicacion}}, pago {{forma_pago}}.',
      datos: { ubicacion: 'Añelo', forma_pago: 'a 30 días F.F.' },
      equipo: { ...equipo40, capacidad_tn: 60.5 },
    }
    expect(resumenCotizacion(fila)).toBe('Grúa de 60,5 TN en Añelo, pago a 30 días F.F.')
  })

  it('un asunto sin variables (presupuesto directo) se muestra tal cual', () => {
    expect(
      resumenCotizacion({ numero: 5, asunto: '  Montaje de tanque\nen Añelo ', datos: {}, equipo: null }),
    ).toBe('Montaje de tanque en Añelo')
  })

  it('sin asunto, muestra equipo y ubicación con lo que haya', () => {
    const datos = { ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41' }
    expect(resumenCotizacion({ numero: 1, asunto: '', datos, equipo: equipo40 })).toBe(
      'Grúa telescópica XCMG QY70K-1 40 TN · Sargento Vidal Ruta Nacional 151 km 41',
    )
    expect(resumenCotizacion({ numero: 1, asunto: '', datos, equipo: null })).toBe(
      'Sargento Vidal Ruta Nacional 151 km 41',
    )
    expect(resumenCotizacion({ numero: 1, asunto: '', datos: {}, equipo: equipo40 })).toBe(
      'Grúa telescópica XCMG QY70K-1 40 TN',
    )
  })

  it('un asunto que queda solo con signos cuenta como vacío', () => {
    expect(resumenCotizacion({ numero: 1, asunto: '{{ubicacion}}.', datos: {}, equipo: equipo40 })).toBe(
      'Grúa telescópica XCMG QY70K-1 40 TN',
    )
  })

  it('sin nada que mostrar, una raya', () => {
    expect(resumenCotizacion({ numero: 1, asunto: '', datos: null, equipo: null })).toBe('—')
    expect(resumenCotizacion({ numero: 1, asunto: '   ', datos: { ubicacion: '  ' }, equipo: null })).toBe('—')
  })
})

describe('rangoPaginas', () => {
  it('sin páginas no hay nada que mostrar', () => {
    expect(rangoPaginas(1, 0)).toEqual([])
  })

  it('hasta 7 páginas las muestra todas', () => {
    expect(rangoPaginas(1, 1)).toEqual([1])
    expect(rangoPaginas(3, 5)).toEqual([1, 2, 3, 4, 5])
    expect(rangoPaginas(7, 7)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('cerca del principio muestra las primeras cinco y la última', () => {
    expect(rangoPaginas(1, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(rangoPaginas(4, 12)).toEqual([1, 2, 3, 4, 5, '…', 12])
    expect(rangoPaginas(1, 8)).toEqual([1, 2, 3, 4, 5, '…', 8])
  })

  it('en el medio muestra la primera, la actual con sus vecinas y la última', () => {
    expect(rangoPaginas(5, 12)).toEqual([1, '…', 4, 5, 6, '…', 12])
    expect(rangoPaginas(8, 12)).toEqual([1, '…', 7, 8, 9, '…', 12])
  })

  it('cerca del final muestra la primera y las últimas cinco', () => {
    expect(rangoPaginas(9, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(rangoPaginas(12, 12)).toEqual([1, '…', 8, 9, 10, 11, 12])
    expect(rangoPaginas(5, 8)).toEqual([1, '…', 4, 5, 6, 7, 8])
  })

  it('una página fuera de rango se acomoda al extremo', () => {
    expect(rangoPaginas(0, 12)).toEqual(rangoPaginas(1, 12))
    expect(rangoPaginas(99, 12)).toEqual(rangoPaginas(12, 12))
  })

  it('nunca pasa de 7 lugares y siempre incluye la actual, la primera y la última', () => {
    for (let total = 1; total <= 30; total++) {
      for (let actual = 1; actual <= total; actual++) {
        const paginas = rangoPaginas(actual, total)
        expect(paginas.length).toBeLessThanOrEqual(7)
        expect(paginas).toContain(actual)
        expect(paginas[0]).toBe(1)
        expect(paginas.at(-1)).toBe(total)
      }
    }
  })
})
```

```bash
npx vitest run src/lib/cotizaciones/lista.test.ts
```

Expected: FAIL con `Error: Cannot find module './lista' imported from …/src/lib/cotizaciones/lista.test.ts`.

- [ ] **Step 10: Implementar `src/lib/cotizaciones/lista.ts`**

Notas de diseño (los tests las fijan):
- `leerFiltros` nunca falla: cada parámetro inválido cae a su valor por defecto sin arrastrar a los demás (`.catch()` por campo). `?a=1&a=2` llega como array y vale el primero. La página solo acepta dígitos (`'1e3'` y `'2.5'` vuelven a 1) y como máximo 10.000. Un rango de fechas invertido se da vuelta.
- `hrefConFiltros` arma los parámetros en orden fijo (`q, estado, cliente, desde, hasta, pagina`), sin vacíos ni `pagina=1`. Cambiar cualquier filtro que no sea la página vuelve a la 1. Codifica con `URLSearchParams` (espacio = `+`), que Next vuelve a leer igual.
- `estadoVisible`: la base solo guarda cuatro estados (CHECK); uno distinto es un error de programación y tira.
- `resumenCotizacion` (decisión 4): resuelve con `resolverVariables` lo que hay a mano (número, capacidad con coma decimal, descripción del equipo y los ocho campos de `datos`, sin caer a los valores de la empresa), quita las llaves que quedan, colapsa espacios y el espacio antes de `.,;:`, y aplica `colapsarPuntoDoble`. Si no queda ni una letra ni un número, usa `"{equipo} · {ubicación}"` con lo que exista, y si no, `"—"`.
- `rangoPaginas` siempre ocupa 7 lugares como máximo (los botones no saltan al cambiar de página).

Crear `src/lib/cotizaciones/lista.ts`:

```ts
// src/lib/cotizaciones/lista.ts
// Lógica pura de la lista de cotizaciones: filtros en la URL, estado que se muestra, columna "Trabajo" y páginas.
import { z } from 'zod'
import { resolverVariables, type NombreVariable } from '@/lib/plantillas/variables'
import { leerDatos } from './datos'
import { colapsarPuntoDoble } from './documento'

export const POR_PAGINA = 25

/** Estados por los que se filtra. "Vencida" no se guarda: es una enviada fuera de validez (la calcula la vista). */
export const ESTADOS_FILTRO = ['borrador', 'enviada', 'vencida', 'aprobada', 'rechazada'] as const

export type FiltrosLista = {
  q: string
  estado: '' | (typeof ESTADOS_FILTRO)[number]
  cliente: string
  desde: string
  hasta: string
  pagina: number
}

// Next entrega `?a=1&a=2` como array: vale el primero.
const primero = (valor: unknown) => (Array.isArray(valor) ? valor[0] : valor)

// Solo dígitos: '1e3' o '2.5' no son páginas.
const numeroDePagina = z.string().regex(/^\d{1,5}$/).transform(Number).pipe(z.number().min(1).max(10_000))

// Cada filtro inválido o ausente cae a su valor por defecto sin romper los demás (la URL la escribe cualquiera).
const esquemaFiltros = z.object({
  q: z.preprocess(primero, z.string().transform((texto) => texto.trim().slice(0, 100))).catch(''),
  estado: z.preprocess(primero, z.enum(['', ...ESTADOS_FILTRO])).catch(''),
  cliente: z.preprocess(primero, z.uuid()).catch(''),
  desde: z.preprocess(primero, z.iso.date()).catch(''),
  hasta: z.preprocess(primero, z.iso.date()).catch(''),
  pagina: z.preprocess(primero, numeroDePagina).catch(1),
})

/** Lee los filtros de `searchParams`. Nunca falla; si el rango de fechas viene invertido, lo da vuelta. */
export function leerFiltros(searchParams: Record<string, string | string[] | undefined>): FiltrosLista {
  const filtros = esquemaFiltros.parse(searchParams)
  if (filtros.desde && filtros.hasta && filtros.desde > filtros.hasta) {
    return { ...filtros, desde: filtros.hasta, hasta: filtros.desde }
  }
  return filtros
}

/**
 * Link a la lista con los filtros cambiados ('/cotizaciones?q=…&estado=…'), sin los vacíos ni la página 1.
 * Cambiar cualquier filtro (no la página) vuelve a la página 1: con el filtro nuevo, la de antes puede no existir.
 */
export function hrefConFiltros(filtros: FiltrosLista, cambios: Partial<FiltrosLista>): string {
  const cambiaFiltro = Object.keys(cambios).some((clave) => clave !== 'pagina')
  const final = { ...filtros, ...cambios, pagina: cambios.pagina ?? (cambiaFiltro ? 1 : filtros.pagina) }
  const parametros = new URLSearchParams()
  for (const clave of ['q', 'estado', 'cliente', 'desde', 'hasta'] as const) {
    if (final[clave]) parametros.set(clave, final[clave])
  }
  if (final.pagina > 1) parametros.set('pagina', String(final.pagina))
  const consulta = parametros.toString()
  return consulta ? `/cotizaciones?${consulta}` : '/cotizaciones'
}

export type EstadoVisible = 'borrador' | 'enviada' | 'vencida' | 'aprobada' | 'rechazada'

const ESTADOS_GUARDADOS = ['borrador', 'enviada', 'aprobada', 'rechazada'] as const

/** El estado que se muestra: una enviada fuera de validez se ve como "Vencida". `vencida` sale de v_cotizaciones. */
export function estadoVisible(estado: string, vencida: boolean | null): EstadoVisible {
  if (!(ESTADOS_GUARDADOS as readonly string[]).includes(estado)) {
    throw new Error(`Estado de cotización desconocido: ${estado}`)
  }
  if (estado === 'enviada' && vencida) return 'vencida'
  return estado as EstadoVisible
}

const LLAVES = /\{\{[^{}]*\}\}/g

/**
 * Lo que dice la columna "Trabajo": el asunto con las variables que se pueden resolver con lo que trae la fila
 * (número, equipo y `datos`); las demás se quitan. Si no queda texto (la plantilla mensual no tiene asunto, una
 * cargada tampoco), "{equipo} · {ubicación}" con lo que haya, o "—".
 */
export function resumenCotizacion(fila: {
  numero: number
  asunto: string
  datos: unknown
  equipo: { nombre: string; capacidad_tn: number | null; descripcion: string } | null
}): string {
  const datos = leerDatos(fila.datos)
  const capacidad = fila.equipo?.capacidad_tn
  const valores: Partial<Record<NombreVariable, string>> = {
    ...datos,
    numero: String(fila.numero),
    capacidad: capacidad === null || capacidad === undefined ? '' : String(capacidad).replace('.', ','),
    equipo_descripcion: fila.equipo?.descripcion ?? '',
  }
  const asunto = colapsarPuntoDoble(resolverVariables(fila.asunto, valores).texto.replace(LLAVES, ''))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,;:])/g, '$1')
    .trim()
  // Un asunto que quedó solo con signos ("." de "{{ubicacion}}.") no dice nada.
  if (/[\p{L}\p{N}]/u.test(asunto)) return asunto
  return [fila.equipo?.nombre.trim(), datos.ubicacion].filter(Boolean).join(' · ') || '—'
}

/**
 * Páginas para el pie de la lista, siempre con 7 lugares como máximo para que los botones no salten:
 * rangoPaginas(5, 12) → [1, '…', 4, 5, 6, '…', 12]. Con 7 páginas o menos van todas. Sin páginas, [].
 */
export function rangoPaginas(actual: number, total: number): (number | '…')[] {
  if (total < 1) return []
  const desde = (inicio: number, cantidad: number) => Array.from({ length: cantidad }, (_, i) => inicio + i)
  if (total <= 7) return desde(1, total)
  const pagina = Math.min(Math.max(actual, 1), total)
  if (pagina <= 4) return [...desde(1, 5), '…', total]
  if (pagina >= total - 3) return [1, '…', ...desde(total - 4, 5)]
  return [1, '…', pagina - 1, pagina, pagina + 1, '…', total]
}
```

Para la Task 7 (no es parte de esta tarea): la página usa `leerFiltros(await searchParams)`; el rango de PostgREST es `.range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)` y la cantidad de páginas `Math.ceil(total / POR_PAGINA)`. `resumenCotizacion` necesita el equipo embebido (`equipo:equipos(nombre, capacidad_tn, descripcion)`).

```bash
npx vitest run src/lib/cotizaciones/lista.test.ts
```

Expected: PASS (43 tests).

- [ ] **Step 11: Verificar y commit**

```bash
npm run check
npm run test:int
```

Expected: `npm run check` sin errores de lint ni de tipos y todos los unitarios en verde (los 20 archivos que había más `resultado.test.ts` y `lista.test.ts`). `npm run test:int` en verde: `servicio.ts` lee los bloques con `leerBloques` y arma el documento con `armarDocumento`, y ninguna cotización de los tests tiene bloques ocultos, así que no cambia nada (necesita la base local levantada con `npm run db:start`).

```bash
git add src/lib/plantillas/contenido.ts src/lib/plantillas/contenido.test.ts \
  src/lib/cotizaciones/documento.ts src/lib/cotizaciones/documento.test.ts src/lib/pdf/render.test.ts \
  src/lib/format/fechas.ts src/lib/format/fechas.test.ts src/lib/formularios.ts src/lib/formularios.test.ts \
  src/lib/resultado.ts src/lib/resultado.test.ts src/lib/cotizaciones/lista.ts src/lib/cotizaciones/lista.test.ts
git commit -m "feat: bloques ocultos, mes en letras, errores por ruta, resultado de acciones y lógica de la lista

- esquemaBloque suma oculto (false por defecto) y armarDocumento no dibuja ni exige las variables de los ocultos
- mesEnLetras, esMes y esFecha para la próxima actualización y las fechas del editor
- erroresPorRuta: errores de Zod con la ruta completa ('items.2.precio')
- Resultado<T> y mensajeParaUsuario para las acciones que reciben objetos
- lista de cotizaciones: filtros en la URL, estado visible, columna Trabajo y páginas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 3: Lógica pura del editor de cotizaciones

**Files:**
- Create: `src/lib/cotizaciones/editor.ts`, `src/lib/cotizaciones/editor.test.ts`
- Modify: `src/lib/cotizaciones/datos.ts`, `src/lib/cotizaciones/datos.test.ts` (mensajes de `esquemaItem` en castellano)
- Modify: `src/lib/cotizaciones/documento.ts`, `src/lib/cotizaciones/documento.test.ts` (número `null` en una cotización sin guardar)
- Modify: `src/lib/pdf/cotizacion-mensual.tsx`, `src/lib/pdf/cotizacion-jornada.tsx`, `src/lib/pdf/render.test.ts`
- Test: los `*.test.ts` de arriba (Vitest, proyecto `unit`) y `npm run typecheck` (comprobación de tipos de `FilaEditor`)

**Depende de la Task 2:** `esquemaBloque` con `oculto` y `armarDocumento` que no dibuja los bloques ocultos (`src/lib/plantillas/contenido.ts`, `src/lib/cotizaciones/documento.ts`); `mesEnLetras`, `esMes` y `esFecha` (`src/lib/format/fechas.ts`); `erroresPorRuta` (`src/lib/formularios.ts`).

`src/lib/cotizaciones/editor.ts` es todo el estado del editor y lo que se calcula a partir de él, sin React ni Supabase (se importa desde el navegador y desde el servidor). Quién usa qué:

| Tarea | Usa |
|---|---|
| Task 4 (servicio, `vistaPrevia`) | `fuenteDesdeEditor(estado, catalogos, contacto)` + `armarDocumento`, con `CatalogosEditor` armado desde la base |
| Task 5 (acciones y rutas) | `payloadGuardar(estado)`: si `!ok`, la acción devuelve `{ ok: false, mensaje: 'Revisá los datos marcados', errores }`; `POST /cotizaciones/vista-previa` valida el cuerpo con `esquemaEstadoEditor` (400 si no valida) |
| Task 8 (páginas y guardar) | `SELECT_EDITOR` + `FilaEditor` + `estadoDesdeFila`, `estadoNuevo`, `reducirEditor` (`useReducer`), `hayCambios`, acción `guardado` |
| Task 9 (ítems) | acciones de ítems y secciones; `textoPrecio(parsePrecio(texto))` para normalizar un precio al salir de la celda |
| Task 10 (textos) | acciones de bloques, `restaurarBloques` |
| Task 12 (estados y franjas) | `pendientesEditor` + `puedeEnviar`; `hayCambios` para guardar antes de enviar o aprobar |

Reglas que fijan los tests (para no "arreglarlas" sin querer):
1. **Cantidad y precio se guardan como texto** mientras se escriben y se leen con `parsePrecio` (coma decimal, punto de miles, hasta 2 decimales: lo que admiten `numeric(12,2)` y `numeric(14,2)`). Precio vacío = sin precio (`null`); cantidad vacía es un error. `textoPrecio` y `textoCantidad` escriben un número guardado como lo vuelve a leer `parsePrecio` (`39.000.000`, `1.950.000,50`, `1,5`).
2. **`payloadGuardar` manda la cabecera COMPLETA** (`guardar_cotizacion` pisa con vacío lo que no viene): `cliente_id, contacto_id, formato, plantilla_id, equipo_id, firmante_id, fecha, asunto, intro, datos, bloques, validez_dias, mostrar_total, fecha_proxima_actualizacion, reemplaza_a`. Los uuid vacíos van como `null`. El mes de próxima actualización llena `fecha_proxima_actualizacion = 'YYYY-MM-01'` y `datos.proxima_actualizacion = mesEnLetras(mes)`; sin mes, la fecha va en `null` y va el texto que tenga el estado. El reducer mantiene ese texto al día (decisión 7): elegir un mes lo escribe y vaciar el control lo borra (el PDF vuelve al valor de la empresa); una fila con texto y sin fecha lo conserva mientras no se toque el control. `notas` no va: `guardar_cotizacion` conserva las que haya (Task 1). Los bloques viajan sin `clave` y con `oculto`. `reemplaza_a` va siempre (la RPC solo lo usa al crear). Asunto, intro, títulos, secciones y descripciones se recortan; el contenido de los bloques no (dos espacios al principio son una subviñeta).
3. **Claves de error** = las de `EstadoEditor`: `cliente`, `contactoId`, `plantillaId`, `formato`, `equipoId`, `firmanteId`, `fecha`, `validezDias`, `proximaActualizacion`, `asunto`, `intro`, `datos.<campo>`, `items.N.seccion|descripcion|cantidad|precio|unidad`, `bloques.N.titulo|contenido`, `reemplazaA`. Una fila cuyo total (`cantidad × precio`) no entra en `numeric(16,2)` da error en `items.N.precio`. Con datos mal formados (la acción recibe lo que manda el navegador) devuelve errores, no tira.
4. **`hayCambios` compara lo que se guardaría** (el payload), no las claves ni cómo está escrito un precio; si alguno de los dos estados no valida (precio a medio escribir, sin cliente), compara el contenido sin las claves.
5. **`estadoNuevo`** sin plantilla arranca en formato `mensual` y validez `'30'` (el valor por defecto de la base); con plantilla, la aplica. `aplicarPlantilla` reemplaza formato, asunto, introducción, textos, validez e ítems (sin precio) y conserva cliente, contacto, equipo, firmante, fecha, datos, próxima actualización y "mostrar total".
6. **Ítems y secciones:** una sección es una racha de filas consecutivas con el mismo texto. `agregarItem` copia sección y unidad de la fila de referencia (`despuesDe` o la última); en una grilla vacía la unidad es `JORNADA` en formato por jornada y `UNIDAD` en mensual. `moverItem` mueve como `arrayMove` de dnd-kit y, si la fila cae **en el medio** de otro grupo, toma esa sección (si no, partiría el grupo); en el borde entre dos grupos conserva la suya. `renombrarSeccion` renombra solo la racha de esa fila (si el nombre nuevo queda igual al del grupo vecino, los dos pasan a ser uno: la Task 9 puede despachar el renombre al salir del campo). `agregarSeccion` agrega una fila vacía al final con ese nombre (`'Nueva sección'` si viene vacío). Una acción que no cambia nada devuelve el mismo objeto de estado.
7. **Número de una cotización sin guardar (decisión 8):** `FuenteDocumento.cotizacion.numero` y `DocumentoCotizacion.numero` pasan a `number | null`; con `null`, `{{numero}}` queda sin resolver y el PDF escribe `Cotización N° {{numero}}` (la Task 4 lo resalta en la vista previa). `pendientesEditor` no cuenta `numero` mientras `estado.id` sea `null`.
8. **`fuenteDesdeEditor` no rompe con lo que está a medio escribir:** fecha inválida → hoy (`armarDocumento` necesita una fecha que exista), validez inválida → 0, cantidad inválida → 1, precio inválido → sin precio, equipo o firmante que no está en los catálogos → `null`.
9. **`esquemaEstadoEditor`** valida solo la forma (tipos, enums, uuid o `''` en los ids, largos máximos para no aceptar cuerpos enormes); un estado que no se puede guardar pasa igual. Es para rechazar con 400 un cuerpo que no es un estado del editor.

- [ ] **Step 1: Mensajes de `esquemaItem` en castellano (test que falla)**

`esquemaItem` (`src/lib/cotizaciones/datos.ts`) tiene `max()` y `z.enum()` sin mensaje, que Zod 4 escribe en inglés ("Too big: …"). El editor muestra esos mensajes junto a cada celda. En `src/lib/cotizaciones/datos.test.ts`, dentro de `describe('esquemaItem', …)`, agregar después del caso que ya existe:

```ts
  it('explica cada error en castellano', () => {
    const resultado = esquemaItem.safeParse({
      seccion: 'x'.repeat(101),
      descripcion: 'x'.repeat(501),
      cantidad: 1_000_000,
      precio_unitario: 1_000_000_000_000,
      unidad: 'LITRO',
    })
    expect(resultado.error?.issues.map((issue) => [issue.path.join('.'), issue.message])).toEqual([
      ['seccion', 'Máximo 100 caracteres'],
      ['descripcion', 'Máximo 500 caracteres'],
      ['cantidad', 'La cantidad es demasiado grande'],
      ['precio_unitario', 'El precio es demasiado grande'],
      ['unidad', 'Elegí la unidad'],
    ])
  })
```

```bash
npx vitest run src/lib/cotizaciones/datos.test.ts
```

Expected: FAIL en `explica cada error en castellano` (`expected [ [ 'seccion', …(1) ], …(4) ] to deeply equal [ [ 'seccion', …(1) ], …(4) ]`).

- [ ] **Step 2: Implementar los mensajes**

En `src/lib/cotizaciones/datos.ts`, reemplazar:

```ts
export const esquemaItem = z.object({
  seccion: z.string().trim().max(100).default(''),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500),
  cantidad: z.number().positive('La cantidad tiene que ser mayor a 0').max(999_999),
  precio_unitario: z.number().nonnegative('El precio no puede ser negativo').max(999_999_999_999).nullable(),
  unidad: z.enum(UNIDADES),
})
```

por:

```ts
// Todos los mensajes en castellano: el editor los muestra junto a cada celda de la grilla.
export const esquemaItem = z.object({
  seccion: z.string().trim().max(100, 'Máximo 100 caracteres').default(''),
  descripcion: z.string().trim().min(1, 'Falta la descripción').max(500, 'Máximo 500 caracteres'),
  cantidad: z.number().positive('La cantidad tiene que ser mayor a 0').max(999_999, 'La cantidad es demasiado grande'),
  precio_unitario: z
    .number()
    .nonnegative('El precio no puede ser negativo')
    .max(999_999_999_999, 'El precio es demasiado grande')
    .nullable(),
  unidad: z.enum(UNIDADES, { error: 'Elegí la unidad' }),
})
```

Las reglas no cambian (solo los mensajes); `esquemaItem` no se usa en otro lado todavía.

```bash
npx vitest run src/lib/cotizaciones/datos.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 3: Número `null` en una cotización sin guardar (tests que fallan)**

En `src/lib/cotizaciones/documento.test.ts`, dentro de `describe('armarDocumento', …)`, agregar justo antes de `it('sin equipo, capacidad y descripción quedan como faltantes', …)`:

```ts
  it('sin número (cotización sin guardar), {{numero}} queda como faltante', () => {
    const doc = armarDocumento({ ...EJEMPLO_JORNADA, cotizacion: { ...EJEMPLO_JORNADA.cotizacion, numero: null } })
    expect(doc.numero).toBeNull()
    expect(doc.faltantes).toEqual(['numero'])
    expect(doc.asunto).toBe('Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
  })
```

Al final de `src/lib/pdf/render.test.ts`, agregar:

```ts
describe('cotización sin guardar', () => {
  it('sin número, el PDF muestra {{numero}} en su lugar', async () => {
    const mensual = { ...EJEMPLO_MENSUAL, cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, numero: null } }
    expect(await textoDelPdf(await renderizarCotizacion(armarDocumento(mensual)))).toContain('Cotización N° {{numero}}')

    const jornada = { ...EJEMPLO_JORNADA, cotizacion: { ...EJEMPLO_JORNADA.cotizacion, numero: null } }
    expect(await textoDelPdf(await renderizarCotizacion(armarDocumento(jornada)))).toContain('Cotización N° {{numero}}')
  }, 20_000)
})
```

```bash
npx vitest run src/lib/cotizaciones/documento.test.ts src/lib/pdf/render.test.ts
```

Expected: FAIL, 2 tests: `sin número (cotización sin guardar)…` (`expected [] to deeply equal [ 'numero' ]`: hoy `String(null)` resuelve la variable como "null") y `sin número, el PDF muestra {{numero}}…` (`expected 'Neuquén, 15 de julio de 2026. Milicic…' to contain 'Cotización N° {{numero}}'`).

- [ ] **Step 4: Implementar el número `null`**

En `src/lib/cotizaciones/documento.ts`:

1. En `type FuenteDocumento`, reemplazar:

```ts
export type FuenteDocumento = {
  cotizacion: {
    numero: number
```

por:

```ts
export type FuenteDocumento = {
  cotizacion: {
    /** null: todavía no se guardó (vista previa del editor). {{numero}} queda sin completar. */
    numero: number | null
```

2. En `type DocumentoCotizacion`, reemplazar:

```ts
export type DocumentoCotizacion = {
  numero: number
```

por:

```ts
export type DocumentoCotizacion = {
  numero: number | null
```

3. En `valoresVariables`, reemplazar:

```ts
    numero: String(fuente.cotizacion.numero),
```

por:

```ts
    numero: fuente.cotizacion.numero === null ? '' : String(fuente.cotizacion.numero),
```

En `src/lib/pdf/cotizacion-mensual.tsx`, reemplazar las dos apariciones del número:

```tsx
    <Document title={`Cotización N° ${doc.numero}`} language="es-AR">
```

por:

```tsx
    <Document title={`Cotización N° ${doc.numero ?? '{{numero}}'}`} language="es-AR">
```

y:

```tsx
          <Text style={estilos.subrayado}>Cotización N° {doc.numero}</Text>
```

por:

```tsx
          <Text style={estilos.subrayado}>Cotización N° {doc.numero ?? '{{numero}}'}</Text>
```

En `src/lib/pdf/cotizacion-jornada.tsx`, reemplazar:

```tsx
    <Document title={`Cotización N° ${doc.numero}`} language="es-AR">
```

por:

```tsx
    <Document title={`Cotización N° ${doc.numero ?? '{{numero}}'}`} language="es-AR">
```

(En la por jornada el número visible sale del asunto, que ya deja `{{numero}}` sin resolver.) `servicio.ts` no cambia: siempre arma la fuente desde la base, con número.

```bash
npx vitest run src/lib/cotizaciones src/lib/pdf
npm run typecheck
```

Expected: PASS (`documento.test.ts` 17 tests, `render.test.ts` 4) y typecheck sin errores (nada más usa `DocumentoCotizacion.numero` como `number`).

- [ ] **Step 5: Tests del editor (fallan)**

Los UUID de los tests son constantes inventadas (no hace falta la base). `FILA` imita lo que devuelve la consulta de la página, con los ítems desordenados y un bloque guardado antes de existir la marca de oculto. El primer `describe` es una comprobación de tipos: no ejecuta ninguna consulta, pero `npm run typecheck` falla si lo que infiere supabase-js para `SELECT_EDITOR` deja de encajar en `FilaEditor`.

Crear `src/lib/cotizaciones/editor.test.ts`:

```ts
import type { SupabaseClient } from '@supabase/supabase-js'
import { describe, expect, expectTypeOf, it, vi } from 'vitest'
import { hoyArgentina } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import type { Database } from '@/lib/supabase/database.types'
import { armarDocumento } from './documento'
import {
  SELECT_EDITOR,
  aplicarPlantilla,
  esquemaEstadoEditor,
  estadoDesdeFila,
  estadoNuevo,
  fuenteDesdeEditor,
  hayCambios,
  nuevaClave,
  payloadGuardar,
  pendientesEditor,
  puedeEnviar,
  reducirEditor,
  textoCantidad,
  textoPrecio,
  type CatalogosEditor,
  type EstadoEditor,
  type FilaEditor,
  type ItemEditor,
  type Pendientes,
  type PlantillaEditor,
} from './editor'
import { EJEMPLO_JORNADA } from './ejemplos'

const ID = '5a8d1c2e-1f4b-4c3a-9e7d-2b6f8a9c0d11'
const CLIENTE = {
  id: '0b0f6a43-5d1c-4c1e-9a52-6f1f4f6a2b10',
  razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
  cuit: '30719529670',
}
const CONTACTO = '7c1e2d3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const EQUIPO_40 = '1d2e3f4a-5b6c-4d7e-8f9a-0b1c2d3e4f5a'
const EQUIPO_70 = '2e3f4a5b-6c7d-4e8f-9a0b-1c2d3e4f5a6b'
const FIRMANTE = '3f4a5b6c-7d8e-4f9a-8b1c-2d3e4f5a6b7c'
const PLANTILLA_JORNADA_ID = '4a5b6c7d-8e9f-4a0b-9c2d-3e4f5a6b7c8d'
const PLANTILLA_MENSUAL_ID = '6c7d8e9f-0a1b-4c2d-8e4f-5a6b7c8d9e0f'
const ANTERIOR = '8e9f0a1b-2c3d-4e4f-9a6b-7c8d9e0f1a2b'

// Las plantillas de los datos iniciales, recortadas a lo que importa para estos tests.
const DESCRIPCIONES_JORNADA = [
  'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)',
  'Movilización y desmovilización de Grúa Telescópica',
  'Jornadas diarias (8 hs) adicionales, domingos y feriados',
]

const PLANTILLA_JORNADA: PlantillaEditor = {
  id: PLANTILLA_JORNADA_ID,
  nombre: 'Por jornada - Grúa con operador',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
  intro: 'Alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para servicios de izajes en {{ubicacion}}.',
  validez_dias: 30,
  bloques: [
    { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}', oculto: false },
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.\nTiempo estimado: {{duracion_estimada}}.', oculto: false },
    { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.', oculto: false },
  ],
  items: [
    { seccion: 'Precios Jornada', descripcion: DESCRIPCIONES_JORNADA[0], unidad: 'JORNADA', cantidad: 1 },
    { seccion: 'Precios Jornada', descripcion: DESCRIPCIONES_JORNADA[1], unidad: 'VIAJE', cantidad: 1 },
    { seccion: 'Precios Jornada Adicional', descripcion: DESCRIPCIONES_JORNADA[2], unidad: 'JORNADA', cantidad: 1 },
  ],
}

const PLANTILLA_MENSUAL: PlantillaEditor = {
  id: PLANTILLA_MENSUAL_ID,
  nombre: 'Mensual - Grúa con operador',
  formato: 'mensual',
  asunto: '',
  intro: '',
  validez_dias: 15,
  bloques: [
    { titulo: 'RENEGOCIACIÓN DE TARIFAS', contenido: 'Próxima actualización: {{proxima_actualizacion}}.', oculto: false },
  ],
  items: [{ seccion: '', descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', unidad: 'UNIDAD', cantidad: 1 }],
}

const CATALOGOS: CatalogosEditor = {
  plantillas: [PLANTILLA_MENSUAL, PLANTILLA_JORNADA],
  equipos: [
    {
      id: EQUIPO_40,
      nombre: 'Grúa telescópica XCMG QY70K-1 40 TN',
      capacidad_tn: 40,
      descripcion: 'Grúa XCMG QY70K-1 de 40 TN.',
      activo: true,
    },
    { id: EQUIPO_70, nombre: 'Grúa XCMG 70 TN', capacidad_tn: 70, descripcion: 'Grúa XCMG de 70 TN.', activo: false },
  ],
  firmantes: [
    { id: FIRMANTE, nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '299 418 3985', activo: true },
  ],
  empresa: EJEMPLO_JORNADA.empresa,
}

const DATOS_COMPLETOS = {
  ubicacion: 'Ruta 7 y Ruta 5, Neuquén',
  horario: '08:30 hs a 17:30 hs',
  plazo_entrega: '',
  duracion_estimada: '1 jornada',
  forma_pago: 'a 30 - 45 días F.F.',
  disponibilidad: 'a confirmar',
  indice_base: '',
  proxima_actualizacion: '',
}

/** Una por jornada nueva con todo completo y precios, lista para guardar. */
function completa(): EstadoEditor {
  const estado = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: FIRMANTE, hoy: '2026-10-25' })
  const precios = ['1.950.000', '2.800.000', '2530000']
  return {
    ...estado,
    cliente: CLIENTE,
    contactoId: CONTACTO,
    equipoId: EQUIPO_40,
    datos: DATOS_COMPLETOS,
    items: estado.items.map((item, indice) => ({ ...item, precio: precios[indice] })),
  }
}

/** El estado sin las claves (que son aleatorias), para comparar. */
function sinClaves(estado: EstadoEditor) {
  return {
    ...estado,
    items: estado.items.map(({ clave, ...item }) => ({ ...item, clave: typeof clave })),
    bloques: estado.bloques.map(({ clave, ...bloque }) => ({ ...bloque, clave: typeof clave })),
  }
}

function claves(items: { clave: string }[]) {
  return items.map((item) => item.clave)
}

function item(cambios: Partial<ItemEditor>): ItemEditor {
  return { clave: nuevaClave(), seccion: '', descripcion: 'Jornada', cantidad: '1', precio: '', unidad: 'JORNADA', ...cambios }
}

function conItems(items: ItemEditor[]): EstadoEditor {
  return { ...completa(), items }
}

function errores(estado: EstadoEditor) {
  const resultado = payloadGuardar(estado)
  if (resultado.ok) throw new Error('debería fallar')
  return resultado.errores
}

function payload(estado: EstadoEditor) {
  const resultado = payloadGuardar(estado)
  if (!resultado.ok) throw new Error(`no debería fallar: ${JSON.stringify(resultado.errores)}`)
  return resultado.payload
}

const FILA: FilaEditor = {
  id: ID,
  numero: 112712,
  estado: 'enviada',
  origen: 'app',
  fecha: '2026-10-20',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}}',
  intro: 'Intro',
  datos: { ubicacion: '  Añelo ', horario: 8, otra: 'x' },
  bloques: [
    { titulo: 'Alcance', contenido: '- Item' },
    { titulo: 'Notas', contenido: 'Oculto', oculto: true },
  ],
  validez_dias: 15,
  mostrar_total: true,
  fecha_proxima_actualizacion: '2026-11-01',
  contacto_id: null,
  plantilla_id: PLANTILLA_JORNADA_ID,
  equipo_id: EQUIPO_40,
  firmante_id: null,
  reemplaza_a: ANTERIOR,
  fecha_aprobacion: null,
  archivo_original_path: null,
  updated_at: '2026-10-20T15:04:05.123456+00:00',
  cliente: CLIENTE,
  items: [
    { orden: 2, seccion: 'Precios', descripcion: 'Movilización', cantidad: 1.5, precio_unitario: null, unidad: 'VIAJE' },
    { orden: 1, seccion: 'Precios', descripcion: 'Jornada', cantidad: 1, precio_unitario: 1_950_000.5, unidad: 'JORNADA' },
  ],
  envios: [{ id: '9f0a1b2c-3d4e-4f5a-8b7c-8d9e0f1a2b3c', enviada_at: '2026-10-21T10:00:00+00:00' }],
}

describe('FilaEditor', () => {
  it('encaja con lo que devuelve la consulta de SELECT_EDITOR (lo comprueba npm run typecheck)', () => {
    // No se ejecuta ninguna consulta: solo se compara el tipo que infiere supabase-js con FilaEditor.
    const consulta = (supabase: SupabaseClient<Database>) =>
      supabase.from('cotizaciones').select(SELECT_EDITOR).eq('id', ID).maybeSingle()
    expectTypeOf(consulta).returns.resolves.toHaveProperty('data').exclude<null>().toExtend<FilaEditor>()
  })
})

describe('nuevaClave', () => {
  it('genera claves UUID distintas', () => {
    const [a, b] = [nuevaClave(), nuevaClave()]
    expect(a).toMatch(/^[0-9a-f-]{36}$/)
    expect(a).not.toBe(b)
  })

  it('sin crypto.randomUUID (el dev server abierto por la IP de la red, sin HTTPS) igual da claves distintas', () => {
    vi.stubGlobal('crypto', {})
    try {
      const [a, b] = [nuevaClave(), nuevaClave()]
      expect(a).not.toBe(b)
      expect(a).toMatch(/^[0-9a-z-]{1,64}$/)
    } finally {
      vi.unstubAllGlobals()
    }
  })
})

describe('textoPrecio y textoCantidad', () => {
  it('escriben los números como se tipean en la grilla', () => {
    expect(textoPrecio(39_000_000)).toBe('39.000.000')
    expect(textoPrecio(1_950_000.5)).toBe('1.950.000,50')
    expect(textoPrecio(0)).toBe('0')
    expect(textoCantidad(1)).toBe('1')
    expect(textoCantidad(1.5)).toBe('1,5')
    expect(textoCantidad(0.25)).toBe('0,25')
  })

  it.each([0, 1, 950, 1_950, 260_000, 1_950_000.5, 39_000_000, 999_999_999_999.99, 0.5])(
    'parsePrecio vuelve a leer el precio %d',
    (precio) => {
      expect(parsePrecio(textoPrecio(precio))).toBe(precio)
    },
  )

  it.each([1, 1.5, 2.25, 12, 1000, 999_999])('parsePrecio vuelve a leer la cantidad %d', (cantidad) => {
    expect(parsePrecio(textoCantidad(cantidad))).toBe(cantidad)
  })
})

describe('estadoNuevo', () => {
  it('con plantilla: borrador de la app con asunto, textos, validez e ítems sin precio', () => {
    const estado = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: FIRMANTE, hoy: '2026-10-25' })
    expect(sinClaves(estado)).toEqual({
      id: null,
      version: null,
      numero: null,
      estado: 'borrador',
      origen: 'app',
      cliente: null,
      contactoId: '',
      plantillaId: PLANTILLA_JORNADA_ID,
      formato: 'jornada',
      equipoId: '',
      firmanteId: FIRMANTE,
      fecha: '2026-10-25',
      validezDias: '30',
      mostrarTotal: false,
      proximaActualizacion: '',
      asunto: PLANTILLA_JORNADA.asunto,
      intro: PLANTILLA_JORNADA.intro,
      datos: {
        ubicacion: '',
        horario: '',
        plazo_entrega: '',
        duracion_estimada: '',
        forma_pago: '',
        disponibilidad: '',
        indice_base: '',
        proxima_actualizacion: '',
      },
      items: PLANTILLA_JORNADA.items.map((item) => ({
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: '1',
        precio: '',
        unidad: item.unidad,
        clave: 'string',
      })),
      bloques: PLANTILLA_JORNADA.bloques.map((bloque) => ({ ...bloque, clave: 'string' })),
      reemplazaA: null,
    })
    expect(new Set([...claves(estado.items), ...claves(estado.bloques)]).size).toBe(6)
  })

  it('sin plantilla: vacía, mensual y con la validez por defecto de la base', () => {
    const estado = estadoNuevo({ plantilla: null, firmanteId: '', hoy: '2026-10-25' })
    expect(estado).toMatchObject({ plantillaId: '', formato: 'mensual', validezDias: '30', items: [], bloques: [] })
  })
})

describe('estadoDesdeFila', () => {
  it('convierte la fila guardada al estado del editor', () => {
    expect(sinClaves(estadoDesdeFila(FILA))).toEqual({
      id: ID,
      version: '2026-10-20T15:04:05.123456+00:00',
      numero: 112712,
      estado: 'enviada',
      origen: 'app',
      cliente: CLIENTE,
      contactoId: '',
      plantillaId: PLANTILLA_JORNADA_ID,
      formato: 'jornada',
      equipoId: EQUIPO_40,
      firmanteId: '',
      fecha: '2026-10-20',
      validezDias: '15',
      mostrarTotal: true,
      proximaActualizacion: '2026-11',
      asunto: 'Cotización N° {{numero}}',
      intro: 'Intro',
      datos: {
        ubicacion: 'Añelo',
        horario: '',
        plazo_entrega: '',
        duracion_estimada: '',
        forma_pago: '',
        disponibilidad: '',
        indice_base: '',
        proxima_actualizacion: '',
      },
      items: [
        { seccion: 'Precios', descripcion: 'Jornada', cantidad: '1', precio: '1.950.000,50', unidad: 'JORNADA', clave: 'string' },
        { seccion: 'Precios', descripcion: 'Movilización', cantidad: '1,5', precio: '', unidad: 'VIAJE', clave: 'string' },
      ],
      bloques: [
        { titulo: 'Alcance', contenido: '- Item', oculto: false, clave: 'string' },
        { titulo: 'Notas', contenido: 'Oculto', oculto: true, clave: 'string' },
      ],
      reemplazaA: ANTERIOR,
    })
  })

  it('sin fecha de próxima actualización el mes queda vacío', () => {
    expect(estadoDesdeFila({ ...FILA, fecha_proxima_actualizacion: null }).proximaActualizacion).toBe('')
  })

  it('leer dos veces la misma fila no cuenta como cambio (las claves no importan)', () => {
    expect(hayCambios(estadoDesdeFila(FILA), estadoDesdeFila(FILA))).toBe(false)
  })

  it('un valor que la base no permite es un error de programación', () => {
    expect(() => estadoDesdeFila({ ...FILA, estado: 'anulada' })).toThrow('Estado desconocido: anulada')
    expect(() => estadoDesdeFila({ ...FILA, formato: 'semanal' })).toThrow('Formato desconocido: semanal')
    expect(() => estadoDesdeFila({ ...FILA, items: [{ ...FILA.items[0], unidad: 'LITRO' }] })).toThrow(
      'Unidad desconocida: LITRO',
    )
    expect(() => estadoDesdeFila({ ...FILA, bloques: [{ titulo: 1 }] })).toThrow()
  })
})

describe('aplicarPlantilla', () => {
  it('reemplaza formato, asunto, introducción, textos, validez e ítems; conserva lo demás', () => {
    const antes = { ...completa(), proximaActualizacion: '2026-11', mostrarTotal: true }
    const despues = aplicarPlantilla(antes, PLANTILLA_MENSUAL)
    expect(despues).toMatchObject({
      plantillaId: PLANTILLA_MENSUAL_ID,
      formato: 'mensual',
      asunto: '',
      intro: '',
      validezDias: '15',
      cliente: CLIENTE,
      contactoId: CONTACTO,
      equipoId: EQUIPO_40,
      firmanteId: FIRMANTE,
      fecha: '2026-10-25',
      datos: DATOS_COMPLETOS,
      proximaActualizacion: '2026-11',
      mostrarTotal: true,
    })
    expect(despues.items.map(({ descripcion, precio, unidad }) => ({ descripcion, precio, unidad }))).toEqual([
      { descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', precio: '', unidad: 'UNIDAD' },
    ])
    expect(despues.bloques.map((bloque) => bloque.titulo)).toEqual(['RENEGOCIACIÓN DE TARIFAS'])
  })
})

describe('reducirEditor', () => {
  it('campo: cambia el campo pedido sin tocar el estado anterior', () => {
    const antes = completa()
    const despues = reducirEditor(antes, { tipo: 'campo', campo: 'asunto', valor: 'Otro asunto' })
    expect(despues.asunto).toBe('Otro asunto')
    expect(antes.asunto).toBe(PLANTILLA_JORNADA.asunto)
    expect(reducirEditor(antes, { tipo: 'campo', campo: 'validezDias', valor: '45' }).validezDias).toBe('45')
    const mes = reducirEditor(antes, { tipo: 'campo', campo: 'proximaActualizacion', valor: '2026-11' })
    expect(mes.proximaActualizacion).toBe('2026-11')
    expect(reducirEditor(antes, { tipo: 'campo', campo: 'equipoId', valor: '' }).equipoId).toBe('')
  })

  it('próxima actualización: el mes escribe también el texto del PDF y vaciarlo lo borra (decisión 7)', () => {
    const conTexto = { ...completa(), datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'marzo de 2027' } }
    const mes = reducirEditor(conTexto, { tipo: 'campo', campo: 'proximaActualizacion', valor: '2026-11' })
    expect(mes).toMatchObject({ proximaActualizacion: '2026-11', datos: { proxima_actualizacion: 'noviembre de 2026' } })
    const vacio = reducirEditor(mes, { tipo: 'campo', campo: 'proximaActualizacion', valor: '' })
    expect(vacio).toMatchObject({ proximaActualizacion: '', datos: { proxima_actualizacion: '' } })
    // Sin fecha ni texto, el PDF usa el de la empresa: lo mismo antes y después de recargar.
    expect(payload(vacio).p_datos).toMatchObject({ fecha_proxima_actualizacion: null, datos: { proxima_actualizacion: '' } })
  })

  it('dato: cambia una variable de la cotización', () => {
    const despues = reducirEditor(completa(), { tipo: 'dato', campo: 'ubicacion', valor: 'Añelo' })
    expect(despues.datos).toEqual({ ...DATOS_COMPLETOS, ubicacion: 'Añelo' })
  })

  it('mostrarTotal', () => {
    expect(reducirEditor(completa(), { tipo: 'mostrarTotal', valor: true }).mostrarTotal).toBe(true)
  })

  it('cliente: cambia el cliente y el contacto juntos', () => {
    const otro = { id: ANTERIOR, razon_social: 'Milicic S.A.', cuit: null }
    expect(reducirEditor(completa(), { tipo: 'cliente', cliente: otro, contactoId: '' })).toMatchObject({
      cliente: otro,
      contactoId: '',
    })
    expect(reducirEditor(completa(), { tipo: 'cliente', cliente: null, contactoId: '' }).cliente).toBeNull()
  })

  it('plantilla: aplica la plantilla', () => {
    const despues = reducirEditor(completa(), { tipo: 'plantilla', plantilla: PLANTILLA_MENSUAL })
    expect(despues).toMatchObject({ plantillaId: PLANTILLA_MENSUAL_ID, formato: 'mensual', validezDias: '15' })
  })

  describe('agregarItem', () => {
    it('sin referencia agrega al final copiando sección y unidad de la última fila', () => {
      const antes = completa()
      const despues = reducirEditor(antes, { tipo: 'agregarItem' })
      expect(despues.items).toHaveLength(4)
      expect(despues.items.slice(0, 3)).toEqual(antes.items)
      expect(despues.items[3]).toEqual({
        clave: expect.any(String),
        seccion: 'Precios Jornada Adicional',
        descripcion: '',
        cantidad: '1',
        precio: '',
        unidad: 'JORNADA',
      })
    })

    it('después de una fila: la agrega debajo, con su sección y su unidad', () => {
      const antes = completa()
      const despues = reducirEditor(antes, { tipo: 'agregarItem', despuesDe: antes.items[1].clave })
      expect(claves(despues.items).indexOf(antes.items[1].clave)).toBe(1)
      expect(despues.items[2]).toMatchObject({ seccion: 'Precios Jornada', unidad: 'VIAJE', descripcion: '' })
      expect(despues.items[3]).toEqual(antes.items[2])
    })

    it('con sección explícita la usa', () => {
      const despues = reducirEditor(completa(), { tipo: 'agregarItem', seccion: 'Otros' })
      expect(despues.items.at(-1)?.seccion).toBe('Otros')
    })

    it('con una fila que ya no existe agrega al final', () => {
      const despues = reducirEditor(completa(), { tipo: 'agregarItem', despuesDe: 'no-existe' })
      expect(despues.items).toHaveLength(4)
      expect(despues.items[3].descripcion).toBe('')
    })

    it('en una grilla vacía usa la unidad del formato', () => {
      const jornada = { ...completa(), items: [] }
      expect(reducirEditor(jornada, { tipo: 'agregarItem' }).items[0]).toMatchObject({ seccion: '', unidad: 'JORNADA' })
      const mensual = { ...jornada, formato: 'mensual' as const }
      expect(reducirEditor(mensual, { tipo: 'agregarItem' }).items[0].unidad).toBe('UNIDAD')
    })
  })

  it('item: cambia solo esa fila y conserva su clave', () => {
    const antes = completa()
    const clave = antes.items[1].clave
    const despues = reducirEditor(antes, { tipo: 'item', clave, cambios: { precio: '3.000.000', unidad: 'JORNADA' } })
    expect(despues.items[1]).toEqual({ ...antes.items[1], precio: '3.000.000', unidad: 'JORNADA' })
    expect(despues.items[0]).toBe(antes.items[0])
    const conClave = { precio: '1', clave: 'otra' } as Partial<Omit<ItemEditor, 'clave'>>
    expect(reducirEditor(antes, { tipo: 'item', clave, cambios: conClave }).items[1].clave).toBe(clave)
  })

  describe('moverItem', () => {
    it('mueve una fila de lugar', () => {
      const antes = conItems([item({ descripcion: 'a' }), item({ descripcion: 'b' }), item({ descripcion: 'c' })])
      const despues = reducirEditor(antes, { tipo: 'moverItem', desde: 2, hasta: 0 })
      expect(despues.items.map((fila) => fila.descripcion)).toEqual(['c', 'a', 'b'])
    })

    it('fuera de rango o al mismo lugar no cambia nada', () => {
      const antes = conItems([item({}), item({})])
      expect(reducirEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 5 })).toBe(antes)
      expect(reducirEditor(antes, { tipo: 'moverItem', desde: -1, hasta: 0 })).toBe(antes)
      expect(reducirEditor(antes, { tipo: 'moverItem', desde: 1, hasta: 1 })).toBe(antes)
    })

    it('si cae en el medio de otro grupo, se suma a ese grupo', () => {
      const antes = conItems([
        item({ seccion: 'A', descripcion: 'a1' }),
        item({ seccion: 'B', descripcion: 'b1' }),
        item({ seccion: 'B', descripcion: 'b2' }),
      ])
      const despues = reducirEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 1 })
      expect(despues.items.map((fila) => `${fila.seccion}:${fila.descripcion}`)).toEqual(['B:b1', 'B:a1', 'B:b2'])
    })

    it('en el borde entre dos grupos conserva su sección', () => {
      const antes = conItems([
        item({ seccion: 'A', descripcion: 'a1' }),
        item({ seccion: 'A', descripcion: 'a2' }),
        item({ seccion: 'B', descripcion: 'b1' }),
        item({ seccion: 'C', descripcion: 'c1' }),
      ])
      const alFinal = reducirEditor(antes, { tipo: 'moverItem', desde: 0, hasta: 3 })
      expect(alFinal.items.map((fila) => `${fila.seccion}:${fila.descripcion}`)).toEqual([
        'A:a2',
        'B:b1',
        'C:c1',
        'A:a1',
      ])
      const entreGrupos = reducirEditor(antes, { tipo: 'moverItem', desde: 3, hasta: 2 })
      expect(entreGrupos.items.map((fila) => fila.seccion)).toEqual(['A', 'A', 'C', 'B'])
    })
  })

  it('quitarItem', () => {
    const antes = completa()
    const despues = reducirEditor(antes, { tipo: 'quitarItem', clave: antes.items[0].clave })
    expect(despues.items).toEqual(antes.items.slice(1))
  })

  it('duplicarItem: la copia va debajo con otra clave', () => {
    const antes = completa()
    const despues = reducirEditor(antes, { tipo: 'duplicarItem', clave: antes.items[0].clave })
    expect(despues.items).toHaveLength(4)
    expect(despues.items[1]).toEqual({ ...antes.items[0], clave: expect.any(String) })
    expect(despues.items[1].clave).not.toBe(antes.items[0].clave)
    expect(reducirEditor(antes, { tipo: 'duplicarItem', clave: 'no-existe' })).toBe(antes)
  })

  it('renombrarSeccion: renombra solo el grupo consecutivo de esa fila', () => {
    const antes = conItems([
      item({ seccion: 'A' }),
      item({ seccion: 'A' }),
      item({ seccion: 'B' }),
      item({ seccion: 'A' }),
    ])
    const despues = reducirEditor(antes, { tipo: 'renombrarSeccion', clave: antes.items[1].clave, seccion: 'Precios' })
    expect(despues.items.map((fila) => fila.seccion)).toEqual(['Precios', 'Precios', 'B', 'A'])
    expect(reducirEditor(antes, { tipo: 'renombrarSeccion', clave: 'no-existe', seccion: 'X' })).toBe(antes)
  })

  it('agregarSeccion: agrega una fila vacía en una sección nueva al final', () => {
    const despues = reducirEditor(completa(), { tipo: 'agregarSeccion', nombre: '  Horas extra ' })
    expect(despues.items.at(-1)).toMatchObject({ seccion: 'Horas extra', descripcion: '', unidad: 'JORNADA' })
    const sinNombre = reducirEditor(completa(), { tipo: 'agregarSeccion', nombre: ' ' })
    expect(sinNombre.items.at(-1)?.seccion).toBe('Nueva sección')
  })

  it('bloque: cambia texto u oculto de un bloque', () => {
    const antes = completa()
    const clave = antes.bloques[1].clave
    const despues = reducirEditor(antes, { tipo: 'bloque', clave, cambios: { oculto: true } })
    expect(despues.bloques[1]).toEqual({ ...antes.bloques[1], oculto: true })
    expect(despues.bloques[0]).toBe(antes.bloques[0])
  })

  it('moverBloque: sube o baja uno; en los extremos no cambia', () => {
    const antes = completa()
    const [primero, segundo, tercero] = claves(antes.bloques)
    expect(claves(reducirEditor(antes, { tipo: 'moverBloque', clave: segundo, direccion: -1 }).bloques)).toEqual([
      segundo,
      primero,
      tercero,
    ])
    expect(claves(reducirEditor(antes, { tipo: 'moverBloque', clave: segundo, direccion: 1 }).bloques)).toEqual([
      primero,
      tercero,
      segundo,
    ])
    expect(reducirEditor(antes, { tipo: 'moverBloque', clave: primero, direccion: -1 })).toBe(antes)
    expect(reducirEditor(antes, { tipo: 'moverBloque', clave: tercero, direccion: 1 })).toBe(antes)
  })

  it('restaurarBloques: reemplaza los bloques por los dados, con claves nuevas', () => {
    const despues = reducirEditor(completa(), { tipo: 'restaurarBloques', bloques: PLANTILLA_MENSUAL.bloques })
    expect(despues.bloques).toEqual([{ ...PLANTILLA_MENSUAL.bloques[0], clave: expect.any(String) }])
  })

  it('guardado: anota id, versión y número sin tocar el contenido', () => {
    const antes = completa()
    const version = '2026-10-25T12:00:00+00:00'
    const despues = reducirEditor(antes, { tipo: 'guardado', id: ID, version, numero: 112713 })
    expect(despues).toEqual({ ...antes, id: ID, version, numero: 112713 })
  })

  it('reemplazar: devuelve el estado dado', () => {
    const otro = estadoDesdeFila(FILA)
    expect(reducirEditor(completa(), { tipo: 'reemplazar', estado: otro })).toBe(otro)
  })
})

describe('hayCambios', () => {
  it('el mismo estado no tiene cambios', () => {
    const estado = completa()
    expect(hayCambios(estado, estado)).toBe(false)
  })

  it('cambiar algo y volverlo atrás', () => {
    const guardado = completa()
    const editado = reducirEditor(guardado, { tipo: 'dato', campo: 'ubicacion', valor: 'Añelo' })
    expect(hayCambios(guardado, editado)).toBe(true)
    const revertido = reducirEditor(editado, { tipo: 'dato', campo: 'ubicacion', valor: DATOS_COMPLETOS.ubicacion })
    expect(hayCambios(guardado, revertido)).toBe(false)
  })

  it('lo que no cambia lo guardado no cuenta: formato del precio, espacios de más y el número asignado', () => {
    const guardado = completa()
    const clave = guardado.items[2].clave
    const precio = reducirEditor(guardado, { tipo: 'item', clave, cambios: { precio: '2.530.000,00' } })
    expect(hayCambios(guardado, precio)).toBe(false)
    expect(hayCambios(guardado, { ...guardado, asunto: `${guardado.asunto}  ` })).toBe(false)
    const conNumero = reducirEditor(guardado, { tipo: 'guardado', id: ID, version: 'v2', numero: 112713 })
    expect(hayCambios(guardado, conNumero)).toBe(false)
  })

  it('reordenar ítems u ocultar un bloque sí es un cambio', () => {
    const guardado = completa()
    expect(hayCambios(guardado, reducirEditor(guardado, { tipo: 'moverItem', desde: 0, hasta: 1 }))).toBe(true)
    const clave = guardado.bloques[0].clave
    expect(hayCambios(guardado, reducirEditor(guardado, { tipo: 'bloque', clave, cambios: { oculto: true } }))).toBe(true)
  })

  it('con algo a medio escribir compara el contenido', () => {
    const guardado = completa()
    const clave = guardado.items[0].clave
    expect(hayCambios(guardado, reducirEditor(guardado, { tipo: 'item', clave, cambios: { precio: 'abc' } }))).toBe(true)
    const nueva = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: FIRMANTE, hoy: '2026-10-25' })
    expect(hayCambios(nueva, nueva)).toBe(false)
    expect(hayCambios(nueva, reducirEditor(nueva, { tipo: 'campo', campo: 'asunto', valor: 'x' }))).toBe(true)
  })
})

describe('payloadGuardar', () => {
  it('arma la cabecera completa y los ítems que espera guardar_cotizacion', () => {
    const estado: EstadoEditor = {
      ...completa(),
      asunto: '  Cotización N° {{numero}}  ',
      validezDias: ' 45 ',
      proximaActualizacion: '2026-11',
      mostrarTotal: true,
      reemplazaA: ANTERIOR,
      items: [
        item({ seccion: ' Precios Jornada ', descripcion: ' Jornada ', cantidad: '1,5', precio: '39.000.000,00' }),
        item({ seccion: '', descripcion: 'Movilización', cantidad: '2', precio: '', unidad: 'VIAJE' }),
      ],
    }
    expect(payload(estado)).toEqual({
      p_datos: {
        cliente_id: CLIENTE.id,
        contacto_id: CONTACTO,
        formato: 'jornada',
        plantilla_id: PLANTILLA_JORNADA_ID,
        equipo_id: EQUIPO_40,
        firmante_id: FIRMANTE,
        fecha: '2026-10-25',
        asunto: 'Cotización N° {{numero}}',
        intro: PLANTILLA_JORNADA.intro,
        datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'noviembre de 2026' },
        bloques: PLANTILLA_JORNADA.bloques,
        validez_dias: 45,
        mostrar_total: true,
        fecha_proxima_actualizacion: '2026-11-01',
        reemplaza_a: ANTERIOR,
      },
      p_items: [
        { seccion: 'Precios Jornada', descripcion: 'Jornada', cantidad: 1.5, precio_unitario: 39e6, unidad: 'JORNADA' },
        { seccion: '', descripcion: 'Movilización', cantidad: 2, precio_unitario: null, unidad: 'VIAJE' },
      ],
    })
  })

  it('los uuid vacíos van como null', () => {
    const datos = payload({ ...completa(), contactoId: '', equipoId: '', firmanteId: '', plantillaId: '' }).p_datos
    expect(datos).toMatchObject({ contacto_id: null, equipo_id: null, firmante_id: null, plantilla_id: null })
  })

  it('sin mes de actualización: la fecha va en null y se conserva el texto que hubiera', () => {
    const estado = { ...completa(), datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'marzo de 2027' } }
    expect(payload(estado).p_datos).toMatchObject({
      fecha_proxima_actualizacion: null,
      datos: { proxima_actualizacion: 'marzo de 2027' },
    })
  })

  it('los bloques ocultos viajan con oculto: true y sin las claves', () => {
    const estado = completa()
    const oculto = reducirEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, cambios: { oculto: true } })
    expect(payload(oculto).p_datos.bloques).toEqual([
      PLANTILLA_JORNADA.bloques[0],
      { ...PLANTILLA_JORNADA.bloques[1], oculto: true },
      PLANTILLA_JORNADA.bloques[2],
    ])
  })

  it('el contenido de un bloque no se recorta (dos espacios al principio son una subviñeta)', () => {
    const estado = completa()
    const conSangria = reducirEditor(estado, {
      tipo: 'bloque',
      clave: estado.bloques[0].clave,
      cambios: { titulo: '  Equipo  ', contenido: '  - Grúa\n' },
    })
    expect((payload(conSangria).p_datos.bloques as { titulo: string; contenido: string }[])[0]).toMatchObject({
      titulo: 'Equipo',
      contenido: '  - Grúa\n',
    })
  })

  it('una cotización sin ítems se puede guardar (borrador)', () => {
    expect(payload({ ...completa(), items: [] }).p_items).toEqual([])
  })

  it('exige el cliente', () => {
    expect(errores({ ...completa(), cliente: null })).toEqual({ cliente: 'Elegí el cliente' })
    expect(errores({ ...completa(), cliente: { ...CLIENTE, id: 'x' } })).toEqual({ cliente: 'Elegí el cliente' })
  })

  it.each(['', '0', '366', 'abc', '30.5', '-3'])('rechaza la validez %j', (validezDias) => {
    expect(errores({ ...completa(), validezDias })).toEqual({ validezDias: 'Ingresá una validez de 1 a 365 días' })
  })

  it('valida fecha, mes, formato e identificadores', () => {
    expect(errores({ ...completa(), fecha: '2026-02-30' })).toEqual({ fecha: 'Ingresá una fecha válida' })
    expect(errores({ ...completa(), fecha: '' })).toEqual({ fecha: 'Ingresá una fecha válida' })
    expect(errores({ ...completa(), proximaActualizacion: '2026-13' })).toEqual({
      proximaActualizacion: 'Elegí un mes válido',
    })
    expect(errores({ ...completa(), formato: 'semanal' as never })).toEqual({ formato: 'Elegí el formato' })
    expect(errores({ ...completa(), equipoId: 'x', contactoId: 'y', reemplazaA: 'z' })).toEqual({
      equipoId: 'Equipo inválido',
      contactoId: 'Contacto inválido',
      reemplazaA: 'Cotización anterior inválida',
    })
  })

  it('marca cada celda con error con su fila', () => {
    const estado = conItems([
      item({ descripcion: 'Bien', precio: '100' }),
      item({ descripcion: '  ', cantidad: '', precio: 'abc' }),
      item({ cantidad: '0', precio: '-5' }),
      item({ cantidad: 'dos', precio: '1.000.000.000.000' }),
      item({ unidad: 'LITRO' as never }),
    ])
    expect(errores(estado)).toEqual({
      'items.1.descripcion': 'Falta la descripción',
      'items.1.cantidad': 'Ingresá la cantidad',
      'items.1.precio': 'Precio inválido',
      'items.2.cantidad': 'La cantidad tiene que ser mayor a 0',
      'items.2.precio': 'Precio inválido',
      'items.3.cantidad': 'Cantidad inválida',
      'items.3.precio': 'El precio es demasiado grande',
      'items.4.unidad': 'Elegí la unidad',
    })
  })

  it('rechaza una fila cuyo total no entra en la base', () => {
    const estado = conItems([item({ cantidad: '999.999', precio: '999.999.999' })])
    expect(errores(estado)).toEqual({ 'items.0.precio': 'El total de la fila es demasiado grande' })
  })

  it('valida el largo de los datos y los textos', () => {
    const largo = 'x'.repeat(501)
    expect(errores({ ...completa(), asunto: largo, datos: { ...DATOS_COMPLETOS, ubicacion: largo } })).toEqual({
      asunto: 'Máximo 500 caracteres',
      'datos.ubicacion': 'Máximo 500 caracteres',
    })
  })

  it('junta todos los errores a la vez', () => {
    const estado = { ...completa(), cliente: null, validezDias: '', items: [item({ descripcion: '' })] }
    expect(Object.keys(errores(estado))).toEqual(['cliente', 'validezDias', 'items.0.descripcion'])
  })

  it('no explota con datos mal formados (la Server Action recibe lo que mande el navegador)', () => {
    const roto = { ...completa(), items: 'nada', bloques: null, datos: 3 } as unknown as EstadoEditor
    expect(Object.keys(errores(roto))).toEqual(['datos', 'items', 'bloques'])
    expect(errores(null as unknown as EstadoEditor)).toHaveProperty('')
  })
})

describe('esquemaEstadoEditor', () => {
  it('acepta cualquier estado que arma el editor, aunque no se pueda guardar', () => {
    const nueva = estadoNuevo({ plantilla: PLANTILLA_JORNADA, firmanteId: '', hoy: '2026-10-25' })
    expect(esquemaEstadoEditor.parse(nueva)).toEqual(nueva)
    const leida = estadoDesdeFila(FILA)
    expect(esquemaEstadoEditor.parse(leida)).toEqual(leida)
    const aMedias = { ...completa(), fecha: '', validezDias: 'x', items: [item({ precio: 'abc', cantidad: '' })] }
    expect(esquemaEstadoEditor.safeParse(aMedias).success).toBe(true)
  })

  it('rechaza lo que no es un estado del editor', () => {
    const estado = completa()
    for (const roto of [
      null,
      { ...estado, items: 'nada' },
      { ...estado, cliente: { ...CLIENTE, id: 'x' } },
      { ...estado, equipoId: 'x' },
      { ...estado, estado: 'anulada' },
      { ...estado, items: [{ ...estado.items[0], unidad: 'LITRO' }] },
      { ...estado, intro: 'x'.repeat(20_001) },
      { ...estado, items: Array.from({ length: 501 }, () => item({})) },
    ]) {
      expect(esquemaEstadoEditor.safeParse(roto).success).toBe(false)
    }
  })
})

describe('fuenteDesdeEditor', () => {
  it('arma el documento con los catálogos, el contacto y el estado sin guardar', () => {
    const estado = { ...completa(), numero: 112713, proximaActualizacion: '2026-12' }
    const fuente = fuenteDesdeEditor(estado, CATALOGOS, { nombre: 'Yanina Colman', email: 'yanina@vertice.com.ar' })
    expect(fuente).toEqual({
      cotizacion: {
        numero: 112713,
        fecha: '2026-10-25',
        formato: 'jornada',
        asunto: PLANTILLA_JORNADA.asunto,
        intro: PLANTILLA_JORNADA.intro,
        validez_dias: 30,
        mostrar_total: false,
        datos: { ...DATOS_COMPLETOS, proxima_actualizacion: 'diciembre de 2026' },
        bloques: PLANTILLA_JORNADA.bloques,
      },
      items: PLANTILLA_JORNADA.items.map((item, indice) => ({
        orden: indice + 1,
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: 1,
        precio_unitario: [1_950_000, 2_800_000, 2_530_000][indice],
        unidad: item.unidad,
      })),
      cliente: { razon_social: CLIENTE.razon_social, cuit: CLIENTE.cuit },
      contacto: { nombre: 'Yanina Colman', email: 'yanina@vertice.com.ar' },
      equipo: { capacidad_tn: 40, descripcion: 'Grúa XCMG QY70K-1 de 40 TN.' },
      firmante: { nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '299 418 3985' },
      empresa: EJEMPLO_JORNADA.empresa,
    })
    const doc = armarDocumento(fuente)
    expect(doc.asunto).toBe('Cotización N° 112713 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.')
    expect(doc.destinatario).toMatchObject({ cuit: '30-71952967-0', atencion: 'Yanina Colman' })
  })

  it('lo que está a medio escribir no rompe el documento', () => {
    const estado = {
      ...completa(),
      cliente: null,
      fecha: '',
      validezDias: '',
      equipoId: 'no-existe',
      items: [item({ cantidad: 'x', precio: 'y' })],
    }
    const fuente = fuenteDesdeEditor(estado, CATALOGOS, null)
    expect(fuente.cotizacion).toMatchObject({ fecha: hoyArgentina(), validez_dias: 0, numero: null })
    expect(fuente.items[0]).toMatchObject({ cantidad: 1, precio_unitario: null })
    expect(fuente).toMatchObject({ cliente: { razon_social: '', cuit: null }, equipo: null })
    expect(() => armarDocumento(fuente)).not.toThrow()
  })
})

describe('pendientesEditor y puedeEnviar', () => {
  const guardada = (estado: EstadoEditor): EstadoEditor => ({ ...estado, id: ID, numero: 112713 })

  it('una cotización completa no tiene pendientes y se puede enviar', () => {
    const pendientes = pendientesEditor(guardada(completa()), CATALOGOS)
    expect(pendientes).toEqual({ variables: [], desconocidas: [], itemsSinPrecio: 0, sinItems: false })
    expect(puedeEnviar(pendientes)).toBe(true)
  })

  it('sin guardar, el número no figura como pendiente', () => {
    expect(pendientesEditor(completa(), CATALOGOS).variables).toEqual([])
  })

  it('informa las variables sin valor, en el orden en que aparecen', () => {
    const datos = { ...DATOS_COMPLETOS, ubicacion: '', forma_pago: ' ' }
    const estado = guardada({ ...completa(), equipoId: '', datos })
    expect(pendientesEditor(estado, CATALOGOS).variables).toEqual([
      'capacidad',
      'ubicacion',
      'equipo_descripcion',
      'forma_pago',
    ])
  })

  it('un equipo inactivo que ya estaba elegido sigue resolviendo sus variables', () => {
    expect(pendientesEditor(guardada({ ...completa(), equipoId: EQUIPO_70 }), CATALOGOS).variables).toEqual([])
  })

  it('las variables de un bloque oculto no cuentan', () => {
    const estado = guardada({ ...completa(), datos: { ...DATOS_COMPLETOS, horario: '', duracion_estimada: '' } })
    expect(pendientesEditor(estado, CATALOGOS).variables).toEqual(['horario', 'duracion_estimada'])
    const oculto = reducirEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, cambios: { oculto: true } })
    expect(pendientesEditor(oculto, CATALOGOS).variables).toEqual([])
  })

  it('la próxima actualización sale del mes elegido o, si no hay, del valor de la empresa', () => {
    const mensual = guardada({
      ...completa(),
      formato: 'mensual',
      bloques: [{ clave: nuevaClave(), titulo: '', contenido: 'Próxima: {{proxima_actualizacion}}.', oculto: false }],
    })
    expect(pendientesEditor(mensual, CATALOGOS).variables).toEqual([])
    const sinEmpresa = { ...CATALOGOS, empresa: { ...CATALOGOS.empresa, proxima_actualizacion: '' } }
    expect(pendientesEditor(mensual, sinEmpresa).variables).toEqual(['proxima_actualizacion'])
    expect(pendientesEditor({ ...mensual, proximaActualizacion: '2026-11' }, sinEmpresa).variables).toEqual([])
  })

  it('informa las variables mal escritas', () => {
    const estado = guardada({ ...completa(), intro: 'Servicios en {{ubicación}}.' })
    const pendientes = pendientesEditor(estado, CATALOGOS)
    expect(pendientes.desconocidas).toEqual(['ubicación'])
    expect(puedeEnviar(pendientes)).toBe(false)
  })

  it('cuenta los ítems sin precio (vacíos o mal escritos) y si no hay ítems', () => {
    const estado = guardada(conItems([item({ precio: '100' }), item({ precio: '' }), item({ precio: 'abc' })]))
    expect(pendientesEditor(estado, CATALOGOS)).toMatchObject({ itemsSinPrecio: 2, sinItems: false })
    expect(pendientesEditor(guardada({ ...completa(), items: [] }), CATALOGOS)).toMatchObject({
      itemsSinPrecio: 0,
      sinItems: true,
    })
  })

  it('con fecha o validez a medio escribir no explota', () => {
    expect(() => pendientesEditor({ ...completa(), fecha: '2026-1', validezDias: 'x' }, CATALOGOS)).not.toThrow()
  })

  it('puedeEnviar exige que no falte nada', () => {
    const nada: Pendientes = { variables: [], desconocidas: [], itemsSinPrecio: 0, sinItems: false }
    expect(puedeEnviar(nada)).toBe(true)
    expect(puedeEnviar({ ...nada, variables: ['ubicacion'] })).toBe(false)
    expect(puedeEnviar({ ...nada, desconocidas: ['ubicación'] })).toBe(false)
    expect(puedeEnviar({ ...nada, itemsSinPrecio: 1 })).toBe(false)
    expect(puedeEnviar({ ...nada, sinItems: true })).toBe(false)
  })
})
```

```bash
npx vitest run src/lib/cotizaciones/editor.test.ts
```

Expected: FAIL con `Error: Cannot find module './editor' imported from …/src/lib/cotizaciones/editor.test.ts`.

- [ ] **Step 6: Implementar `src/lib/cotizaciones/editor.ts`**

Los tipos `ItemEditor`, `BloqueEditor`, `EstadoEditor`, `PlantillaEditor`, `CatalogosEditor`, `AccionEditor`, `PayloadGuardar`, `Pendientes` y las firmas de las funciones son las del contrato de la cabecera del plan. Se suman: `SELECT_EDITOR` y `FilaEditor` (lo que lee la página de la Task 8), `CampoEditor` (el nombre del union de la acción `campo`), `textoPrecio`, `textoCantidad`, `esquemaEstadoEditor` y `MENSAJE_CONFLICTO` (el texto del conflicto de versión, en un solo lugar: lo usan el servicio de la Task 4 y las acciones de la Task 12).

Crear `src/lib/cotizaciones/editor.ts`:

```ts
// src/lib/cotizaciones/editor.ts
// Estado del editor de cotizaciones y todo lo que se calcula a partir de él, sin React ni Supabase: el componente
// lo usa con useReducer, la Server Action valida con payloadGuardar y la vista previa arma el documento con
// fuenteDesdeEditor. Se puede importar desde el navegador.
import { z } from 'zod'
import { esFecha, esMes, hoyArgentina, mesEnLetras } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import { erroresPorRuta } from '@/lib/formularios'
import {
  UNIDADES,
  leerBloques,
  type Bloque,
  type Formato,
  type ItemPlantilla,
  type Unidad,
} from '@/lib/plantillas/contenido'
import type { NombreVariable } from '@/lib/plantillas/variables'
import { esUuid } from '@/lib/validacion'
import { esquemaDatos, esquemaItem, leerDatos, type CampoDatos, type DatosCotizacion } from './datos'
import { armarDocumento, type FuenteDocumento } from './documento'

// ---------------------------------------------------------------------------------------------------------------
// Tipos

/** Una fila de la grilla. Cantidad y precio quedan como texto mientras se escriben ("39.000.000", "1,5"). */
export type ItemEditor = {
  clave: string
  seccion: string
  descripcion: string
  cantidad: string
  precio: string
  unidad: Unidad
}
export type BloqueEditor = { clave: string; titulo: string; contenido: string; oculto: boolean }

export type EstadoEditor = {
  id: string | null
  version: string | null
  numero: number | null
  estado: 'borrador' | 'enviada' | 'aprobada' | 'rechazada'
  origen: 'app' | 'importada' | 'directa'
  cliente: { id: string; razon_social: string; cuit: string | null } | null
  contactoId: string // '' = Sin Atte.
  plantillaId: string
  formato: Formato
  equipoId: string
  firmanteId: string
  fecha: string // 'YYYY-MM-DD'
  validezDias: string
  mostrarTotal: boolean
  proximaActualizacion: string // 'YYYY-MM' o ''
  asunto: string
  intro: string
  datos: DatosCotizacion // incluye proxima_actualizacion (texto) e indice_base
  items: ItemEditor[]
  bloques: BloqueEditor[]
  reemplazaA: string | null // solo cuenta al crear
}

export type PlantillaEditor = {
  id: string
  nombre: string
  formato: Formato
  asunto: string
  intro: string
  validez_dias: number
  bloques: Bloque[]
  items: ItemPlantilla[]
}

export type CatalogosEditor = {
  plantillas: PlantillaEditor[]
  equipos: { id: string; nombre: string; capacidad_tn: number | null; descripcion: string; activo: boolean }[]
  firmantes: { id: string; nombre: string; cargo: string; telefono: string; activo: boolean }[]
  empresa: FuenteDocumento['empresa']
}

/**
 * Lo que la página del editor lee de una cotización:
 * `supabase.from('cotizaciones').select(SELECT_EDITOR).eq('id', id).maybeSingle()`.
 * Los envíos vienen sin orden (la página los ordena por `enviada_at`); estadoDesdeFila no los usa, pero la página
 * los necesita para el historial y para avisar si se aprueba algo editado después del último envío.
 */
export const SELECT_EDITOR = `id, numero, estado, origen, fecha, formato, asunto, intro, datos, bloques, validez_dias,
  mostrar_total, fecha_proxima_actualizacion, contacto_id, plantilla_id, equipo_id, firmante_id, reemplaza_a,
  fecha_aprobacion, archivo_original_path, updated_at,
  cliente:clientes(id, razon_social, cuit),
  items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad),
  envios:cotizacion_envios(id, enviada_at)`

/** La fila que devuelve la consulta de SELECT_EDITOR (editor.test.ts comprueba que el tipo inferido encaja). */
export type FilaEditor = {
  id: string
  numero: number
  estado: string
  origen: string
  fecha: string
  formato: string
  asunto: string
  intro: string
  datos: unknown
  bloques: unknown
  validez_dias: number
  mostrar_total: boolean
  fecha_proxima_actualizacion: string | null
  contacto_id: string | null
  plantilla_id: string | null
  equipo_id: string | null
  firmante_id: string | null
  reemplaza_a: string | null
  fecha_aprobacion: string | null
  archivo_original_path: string | null
  updated_at: string
  cliente: { id: string; razon_social: string; cuit: string | null }
  items: {
    orden: number
    seccion: string
    descripcion: string
    cantidad: number
    precio_unitario: number | null
    unidad: string
  }[]
  envios: { id: string; enviada_at: string }[]
}

export type AccionEditor =
  | { tipo: 'campo'; campo: CampoEditor; valor: string }
  | { tipo: 'dato'; campo: CampoDatos; valor: string }
  | { tipo: 'mostrarTotal'; valor: boolean }
  | { tipo: 'cliente'; cliente: EstadoEditor['cliente']; contactoId: string }
  | { tipo: 'plantilla'; plantilla: PlantillaEditor }
  | { tipo: 'agregarItem'; despuesDe?: string; seccion?: string }
  | { tipo: 'item'; clave: string; cambios: Partial<Omit<ItemEditor, 'clave'>> }
  | { tipo: 'moverItem'; desde: number; hasta: number }
  | { tipo: 'quitarItem'; clave: string }
  | { tipo: 'duplicarItem'; clave: string }
  | { tipo: 'renombrarSeccion'; clave: string; seccion: string }
  | { tipo: 'agregarSeccion'; nombre: string }
  | { tipo: 'bloque'; clave: string; cambios: Partial<Omit<BloqueEditor, 'clave'>> }
  | { tipo: 'moverBloque'; clave: string; direccion: -1 | 1 }
  | { tipo: 'restaurarBloques'; bloques: Bloque[] }
  | { tipo: 'guardado'; id: string; version: string; numero: number }
  | { tipo: 'reemplazar'; estado: EstadoEditor }

/** Campos de texto de la cabecera que se cambian con la acción 'campo'. */
export type CampoEditor =
  | 'contactoId'
  | 'equipoId'
  | 'firmanteId'
  | 'fecha'
  | 'validezDias'
  | 'proximaActualizacion'
  | 'asunto'
  | 'intro'

export type PayloadGuardar = { p_datos: Record<string, unknown>; p_items: Record<string, unknown>[] }

export type Pendientes = {
  variables: NombreVariable[]
  desconocidas: string[]
  itemsSinPrecio: number
  sinItems: boolean
}

/**
 * El texto de private.exigir_version (supabase/migrations/20261025100200_cotizaciones_estados.sql) cuando la versión
 * que vio la pantalla ya no es la de la fila. El servicio da el mismo error antes de generar un PDF y el editor lo
 * reconoce para ofrecer "Recargar" (acciones-estado.ts): si cambia en la base, cambia acá.
 */
export const MENSAJE_CONFLICTO = 'La cotización cambió desde que la abriste; volvé a intentarlo'

// ---------------------------------------------------------------------------------------------------------------
// Texto de los números de la grilla

let clavesSinCrypto = 0

/** Clave estable de una fila o un bloque (para React y para arrastrar); no se guarda. */
export function nuevaClave(): string {
  // crypto.randomUUID solo existe en un contexto seguro (HTTPS o localhost): el dev server abierto desde el celular
  // por la IP de la red no lo tiene. La clave no se guarda: alcanza con que no se repita en la página.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  clavesSinCrypto += 1
  return `clave-${clavesSinCrypto}-${Math.random().toString(36).slice(2)}`
}

const sinDecimales = new Intl.NumberFormat('es-AR', { maximumFractionDigits: 0, useGrouping: 'always' })
const conDecimales = new Intl.NumberFormat('es-AR', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  useGrouping: 'always',
})

/** Precio guardado → texto de la celda: "39.000.000" o "1.950.000,50". parsePrecio lo vuelve a leer igual. */
export function textoPrecio(precio: number): string {
  return Number.isInteger(precio) ? sinDecimales.format(precio) : conDecimales.format(precio)
}

/** Cantidad guardada → texto de la celda, con coma decimal: 1 → "1", 1.5 → "1,5". */
export function textoCantidad(cantidad: number): string {
  return String(cantidad).replace('.', ',')
}

// ---------------------------------------------------------------------------------------------------------------
// Crear el estado

const ESTADOS = ['borrador', 'enviada', 'aprobada', 'rechazada'] as const
const ORIGENES = ['app', 'importada', 'directa'] as const
const FORMATOS_EDITOR = ['mensual', 'jornada'] as const satisfies readonly Formato[]

/** La base garantiza estos valores (CHECK): uno distinto es un error de programación. */
function unoDe<const T extends readonly string[]>(valor: string, opciones: T, error: string): T[number] {
  if (!opciones.includes(valor)) throw new Error(`${error}: ${valor}`)
  return valor as T[number]
}

function bloquesDelEditor(bloques: Bloque[]): BloqueEditor[] {
  return bloques.map((bloque) => ({
    clave: nuevaClave(),
    titulo: bloque.titulo,
    contenido: bloque.contenido,
    oculto: bloque.oculto,
  }))
}

/** Una cotización nueva: borrador de la app, con la plantilla aplicada si hay una. */
export function estadoNuevo(args: {
  plantilla: PlantillaEditor | null
  firmanteId: string
  hoy: string
}): EstadoEditor {
  const vacio: EstadoEditor = {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: null,
    contactoId: '',
    plantillaId: '',
    formato: 'mensual',
    equipoId: '',
    firmanteId: args.firmanteId,
    fecha: args.hoy,
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: '',
    intro: '',
    datos: leerDatos({}),
    items: [],
    bloques: [],
    reemplazaA: null,
  }
  return args.plantilla ? aplicarPlantilla(vacio, args.plantilla) : vacio
}

/** El estado de una cotización guardada, tal como la lee la página (ver SELECT_EDITOR). */
export function estadoDesdeFila(fila: FilaEditor): EstadoEditor {
  return {
    id: fila.id,
    version: fila.updated_at,
    numero: fila.numero,
    estado: unoDe(fila.estado, ESTADOS, 'Estado desconocido'),
    origen: unoDe(fila.origen, ORIGENES, 'Origen desconocido'),
    cliente: { id: fila.cliente.id, razon_social: fila.cliente.razon_social, cuit: fila.cliente.cuit },
    contactoId: fila.contacto_id ?? '',
    plantillaId: fila.plantilla_id ?? '',
    formato: unoDe(fila.formato, FORMATOS_EDITOR, 'Formato desconocido'),
    equipoId: fila.equipo_id ?? '',
    firmanteId: fila.firmante_id ?? '',
    fecha: fila.fecha,
    validezDias: String(fila.validez_dias),
    mostrarTotal: fila.mostrar_total,
    // La columna guarda el primer día del mes ('2026-11-01'); el control es <input type="month">.
    proximaActualizacion: fila.fecha_proxima_actualizacion?.slice(0, 7) ?? '',
    asunto: fila.asunto,
    intro: fila.intro,
    datos: leerDatos(fila.datos),
    items: [...fila.items]
      .sort((a, b) => a.orden - b.orden)
      .map((item) => ({
        clave: nuevaClave(),
        seccion: item.seccion,
        descripcion: item.descripcion,
        cantidad: textoCantidad(item.cantidad),
        precio: item.precio_unitario === null ? '' : textoPrecio(item.precio_unitario),
        unidad: unoDe(item.unidad, UNIDADES, 'Unidad desconocida'),
      })),
    bloques: bloquesDelEditor(leerBloques(fila.bloques)),
    reemplazaA: fila.reemplaza_a,
  }
}

/**
 * Precarga lo que trae la plantilla: formato, asunto, introducción, textos, validez e ítems sin precio.
 * Cliente, contacto, equipo, firmante, fecha, datos, próxima actualización y "mostrar total" no cambian.
 */
export function aplicarPlantilla(estado: EstadoEditor, plantilla: PlantillaEditor): EstadoEditor {
  return {
    ...estado,
    plantillaId: plantilla.id,
    formato: plantilla.formato,
    asunto: plantilla.asunto,
    intro: plantilla.intro,
    validezDias: String(plantilla.validez_dias),
    items: plantilla.items.map((item) => ({
      clave: nuevaClave(),
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: textoCantidad(item.cantidad),
      precio: '',
      unidad: item.unidad,
    })),
    bloques: bloquesDelEditor(plantilla.bloques),
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Reducer

function insertar<T>(lista: T[], posicion: number, elemento: T): T[] {
  return [...lista.slice(0, posicion), elemento, ...lista.slice(posicion)]
}

/** Saca el elemento de `desde` y lo pone en `hasta` (como arrayMove de dnd-kit). */
function mover<T>(lista: T[], desde: number, hasta: number): T[] {
  const copia = [...lista]
  const [elemento] = copia.splice(desde, 1)
  copia.splice(hasta, 0, elemento)
  return copia
}

/** Fila vacía: copia sección y unidad de la fila de referencia; sin referencia, la unidad típica del formato. */
function itemNuevo(estado: EstadoEditor, referencia: ItemEditor | undefined, seccion?: string): ItemEditor {
  return {
    clave: nuevaClave(),
    seccion: seccion ?? referencia?.seccion ?? '',
    descripcion: '',
    cantidad: '1',
    precio: '',
    unidad: referencia?.unidad ?? (estado.formato === 'jornada' ? 'JORNADA' : 'UNIDAD'),
  }
}

function moverItem(items: ItemEditor[], desde: number, hasta: number): ItemEditor[] {
  const valido = (indice: number) => Number.isInteger(indice) && indice >= 0 && indice < items.length
  if (desde === hasta || !valido(desde) || !valido(hasta)) return items
  const lista = mover(items, desde, hasta)
  const anterior = lista[hasta - 1]
  const siguiente = lista[hasta + 1]
  const movido = lista[hasta]
  // Las secciones son rachas de filas consecutivas. Si la fila cae en el medio de otro grupo, se suma a ese grupo:
  // si conservara la suya, partiría el grupo en dos. En el borde entre dos grupos conserva su sección.
  if (anterior && siguiente && anterior.seccion === siguiente.seccion && movido.seccion !== anterior.seccion) {
    lista[hasta] = { ...movido, seccion: anterior.seccion }
  }
  return lista
}

/** Renombra la racha de filas consecutivas con la misma sección que la fila `clave` (no otras rachas iguales). */
function renombrarSeccion(items: ItemEditor[], clave: string, seccion: string): ItemEditor[] {
  const indice = items.findIndex((item) => item.clave === clave)
  if (indice < 0) return items
  const actual = items[indice].seccion
  let inicio = indice
  while (inicio > 0 && items[inicio - 1].seccion === actual) inicio--
  let fin = indice
  while (fin < items.length - 1 && items[fin + 1].seccion === actual) fin++
  return items.map((item, i) => (i >= inicio && i <= fin ? { ...item, seccion } : item))
}

/**
 * Todas las transiciones del editor. Pura salvo las claves nuevas (crypto.randomUUID). Si la acción no cambia nada
 * (mover fuera de rango, una clave que ya no existe), devuelve el mismo estado.
 */
export function reducirEditor(estado: EstadoEditor, accion: AccionEditor): EstadoEditor {
  switch (accion.tipo) {
    case 'campo':
      if (accion.campo === 'proximaActualizacion') {
        // Un solo control llena la fecha y el texto del PDF (decisión 7). Vaciarlo borra también el texto: el PDF
        // vuelve al valor de la empresa, igual antes y después de recargar. Mientras no se toque, el texto que trajo
        // la fila se conserva.
        return {
          ...estado,
          proximaActualizacion: accion.valor,
          datos: { ...estado.datos, proxima_actualizacion: esMes(accion.valor) ? mesEnLetras(accion.valor) : '' },
        }
      }
      return { ...estado, [accion.campo]: accion.valor }
    case 'dato':
      return { ...estado, datos: { ...estado.datos, [accion.campo]: accion.valor } }
    case 'mostrarTotal':
      return { ...estado, mostrarTotal: accion.valor }
    case 'cliente':
      return { ...estado, cliente: accion.cliente, contactoId: accion.contactoId }
    case 'plantilla':
      return aplicarPlantilla(estado, accion.plantilla)
    case 'agregarItem': {
      const indice = accion.despuesDe ? estado.items.findIndex((item) => item.clave === accion.despuesDe) : -1
      const referencia = indice >= 0 ? estado.items[indice] : estado.items.at(-1)
      const nuevo = itemNuevo(estado, referencia, accion.seccion)
      return { ...estado, items: insertar(estado.items, indice >= 0 ? indice + 1 : estado.items.length, nuevo) }
    }
    case 'item':
      return {
        ...estado,
        items: estado.items.map((item) =>
          item.clave === accion.clave ? { ...item, ...accion.cambios, clave: item.clave } : item,
        ),
      }
    case 'moverItem': {
      const items = moverItem(estado.items, accion.desde, accion.hasta)
      return items === estado.items ? estado : { ...estado, items }
    }
    case 'quitarItem':
      return { ...estado, items: estado.items.filter((item) => item.clave !== accion.clave) }
    case 'duplicarItem': {
      const indice = estado.items.findIndex((item) => item.clave === accion.clave)
      if (indice < 0) return estado
      const copia = { ...estado.items[indice], clave: nuevaClave() }
      return { ...estado, items: insertar(estado.items, indice + 1, copia) }
    }
    case 'renombrarSeccion': {
      const items = renombrarSeccion(estado.items, accion.clave, accion.seccion)
      return items === estado.items ? estado : { ...estado, items }
    }
    case 'agregarSeccion': {
      const nuevo = itemNuevo(estado, estado.items.at(-1), accion.nombre.trim() || 'Nueva sección')
      return { ...estado, items: [...estado.items, nuevo] }
    }
    case 'bloque':
      return {
        ...estado,
        bloques: estado.bloques.map((bloque) =>
          bloque.clave === accion.clave ? { ...bloque, ...accion.cambios, clave: bloque.clave } : bloque,
        ),
      }
    case 'moverBloque': {
      const indice = estado.bloques.findIndex((bloque) => bloque.clave === accion.clave)
      const destino = indice + accion.direccion
      if (indice < 0 || destino < 0 || destino >= estado.bloques.length) return estado
      return { ...estado, bloques: mover(estado.bloques, indice, destino) }
    }
    case 'restaurarBloques':
      return { ...estado, bloques: bloquesDelEditor(accion.bloques) }
    case 'guardado':
      return { ...estado, id: accion.id, version: accion.version, numero: accion.numero }
    case 'reemplazar':
      return accion.estado
  }
}

// ---------------------------------------------------------------------------------------------------------------
// Forma de lo que llega del navegador

const textoLibre = z.string().max(20_000)
const idOpcional = z.union([z.literal(''), z.uuid()])

/**
 * La forma de EstadoEditor, sin reglas de negocio (un precio mal escrito o la falta de cliente pasan). Sirve para
 * rechazar con 400 un cuerpo que no es un estado del editor (POST /cotizaciones/vista-previa) antes de usarlo; las
 * reglas para guardar están en payloadGuardar. Los ids son uuid o '' porque el servidor los relee de la base.
 */
export const esquemaEstadoEditor = z.object({
  id: z.uuid().nullable(),
  version: z.string().max(64).nullable(),
  numero: z.number().int().positive().nullable(),
  estado: z.enum(ESTADOS),
  origen: z.enum(ORIGENES),
  cliente: z.object({ id: z.uuid(), razon_social: textoLibre, cuit: z.string().max(20).nullable() }).nullable(),
  contactoId: idOpcional,
  plantillaId: idOpcional,
  formato: z.enum(FORMATOS_EDITOR),
  equipoId: idOpcional,
  firmanteId: idOpcional,
  fecha: z.string().max(10),
  validezDias: z.string().max(10),
  mostrarTotal: z.boolean(),
  proximaActualizacion: z.string().max(7),
  asunto: textoLibre,
  intro: textoLibre,
  datos: z.object({
    ubicacion: textoLibre,
    horario: textoLibre,
    plazo_entrega: textoLibre,
    duracion_estimada: textoLibre,
    forma_pago: textoLibre,
    disponibilidad: textoLibre,
    indice_base: textoLibre,
    proxima_actualizacion: textoLibre,
  }),
  items: z
    .array(
      z.object({
        clave: z.string().max(64),
        seccion: textoLibre,
        descripcion: textoLibre,
        cantidad: z.string().max(30),
        precio: z.string().max(30),
        unidad: z.enum(UNIDADES),
      }),
    )
    .max(500),
  bloques: z
    .array(z.object({ clave: z.string().max(64), titulo: textoLibre, contenido: textoLibre, oculto: z.boolean() }))
    .max(100),
  reemplazaA: z.uuid().nullable(),
}) satisfies z.ZodType<EstadoEditor>

// ---------------------------------------------------------------------------------------------------------------
// Guardar

const MENSAJE_VALIDEZ = 'Ingresá una validez de 1 a 365 días'
const MENSAJE_MES = 'Elegí un mes válido'
const MENSAJE_FECHA = 'Ingresá una fecha válida'

/** El texto de la próxima actualización en el PDF: el mes elegido manda; sin mes, queda el texto que hubiera. */
function proximaActualizacionEnTexto(mes: string, textoActual: string): string {
  return esMes(mes) ? mesEnLetras(mes) : textoActual
}

function uuidOpcional(mensaje: string) {
  return z
    .string(mensaje)
    .refine((valor) => valor === '' || esUuid(valor), mensaje)
    .transform((valor) => valor || null)
}

const clienteElegido = z.unknown().transform((cliente, ctx) => {
  const id = cliente !== null && typeof cliente === 'object' ? (cliente as { id?: unknown }).id : undefined
  if (typeof id === 'string' && esUuid(id)) return id
  ctx.addIssue({ code: 'custom', message: 'Elegí el cliente' })
  return z.NEVER
})

const cantidadEscrita = z
  .string('Ingresá la cantidad')
  .transform((texto, ctx) => {
    const cantidad = parsePrecio(texto)
    if (cantidad === null) {
      ctx.addIssue({ code: 'custom', message: texto.trim() ? 'Cantidad inválida' : 'Ingresá la cantidad' })
      return z.NEVER
    }
    return cantidad
  })
  .pipe(esquemaItem.shape.cantidad)

const precioEscrito = z
  .string('Precio inválido')
  .transform((texto, ctx) => {
    if (texto.trim() === '') return null
    const precio = parsePrecio(texto)
    if (precio === null) {
      ctx.addIssue({ code: 'custom', message: 'Precio inválido' })
      return z.NEVER
    }
    return precio
  })
  .pipe(esquemaItem.shape.precio_unitario)

// Las reglas de cada celda son las de esquemaItem; las claves de error usan los nombres de la grilla
// ('items.2.precio'), no los de la base ('precio_unitario').
const esquemaItemEditor = z
  .object({
    seccion: esquemaItem.shape.seccion,
    descripcion: esquemaItem.shape.descripcion,
    cantidad: cantidadEscrita,
    precio: precioEscrito,
    unidad: esquemaItem.shape.unidad,
  })
  .superRefine((item, ctx) => {
    // El total de la fila es numeric(16,2) en la base: si no entra, la base contestaría con un error de desborde.
    if (item.precio !== null && item.cantidad * item.precio >= 1e14) {
      ctx.addIssue({ code: 'custom', path: ['precio'], message: 'El total de la fila es demasiado grande' })
    }
  })
  .transform((item) => ({
    seccion: item.seccion,
    descripcion: item.descripcion,
    cantidad: item.cantidad,
    precio_unitario: item.precio,
    unidad: item.unidad,
  }))

const esquemaBloqueEditor = z.object({
  titulo: z.string().trim().max(200, 'Máximo 200 caracteres'),
  // Sin trim: dos espacios al principio de una línea son una subviñeta.
  contenido: z.string().max(10_000, 'Máximo 10.000 caracteres'),
  oculto: z.boolean(),
})

// Las claves son las de EstadoEditor, así erroresPorRuta devuelve 'cliente', 'validezDias', 'items.2.precio'…
const esquemaEditor = z.object({
  cliente: clienteElegido,
  contactoId: uuidOpcional('Contacto inválido'),
  plantillaId: uuidOpcional('Plantilla inválida'),
  formato: z.enum(FORMATOS_EDITOR, { error: 'Elegí el formato' }),
  equipoId: uuidOpcional('Equipo inválido'),
  firmanteId: uuidOpcional('Firmante inválido'),
  fecha: z.string(MENSAJE_FECHA).refine(esFecha, MENSAJE_FECHA),
  validezDias: z
    .string(MENSAJE_VALIDEZ)
    .trim()
    .regex(/^\d{1,3}$/, MENSAJE_VALIDEZ)
    .transform(Number)
    .refine((dias) => dias >= 1 && dias <= 365, MENSAJE_VALIDEZ),
  mostrarTotal: z.boolean(),
  proximaActualizacion: z.string(MENSAJE_MES).refine((mes) => mes === '' || esMes(mes), MENSAJE_MES),
  asunto: z.string().trim().max(500, 'Máximo 500 caracteres'),
  intro: z.string().trim().max(5000, 'Máximo 5000 caracteres'),
  datos: esquemaDatos,
  items: z.array(esquemaItemEditor),
  bloques: z.array(esquemaBloqueEditor),
  reemplazaA: z
    .string()
    .nullable()
    .refine((id) => id === null || esUuid(id), 'Cotización anterior inválida'),
})

/**
 * Valida el estado y arma los parámetros de guardar_cotizacion. p_datos lleva la cabecera COMPLETA porque la RPC
 * pisa con vacío lo que no se manda. Los uuid vacíos van como null; el mes elegido llena
 * fecha_proxima_actualizacion ('YYYY-MM-01') y el texto datos.proxima_actualizacion; los bloques ocultos viajan
 * con oculto: true. Lo usan la Server Action (que no confía en lo que manda el navegador) y hayCambios.
 */
export function payloadGuardar(
  estado: EstadoEditor,
): { ok: true; payload: PayloadGuardar } | { ok: false; errores: Record<string, string> } {
  const resultado = esquemaEditor.safeParse(estado)
  if (!resultado.success) return { ok: false, errores: erroresPorRuta(resultado.error) }
  const valido = resultado.data
  return {
    ok: true,
    payload: {
      p_datos: {
        cliente_id: valido.cliente,
        contacto_id: valido.contactoId,
        formato: valido.formato,
        plantilla_id: valido.plantillaId,
        equipo_id: valido.equipoId,
        firmante_id: valido.firmanteId,
        fecha: valido.fecha,
        asunto: valido.asunto,
        intro: valido.intro,
        datos: {
          ...valido.datos,
          proxima_actualizacion: proximaActualizacionEnTexto(
            valido.proximaActualizacion,
            valido.datos.proxima_actualizacion,
          ),
        },
        bloques: valido.bloques,
        validez_dias: valido.validezDias,
        mostrar_total: valido.mostrarTotal,
        fecha_proxima_actualizacion: valido.proximaActualizacion ? `${valido.proximaActualizacion}-01` : null,
        reemplaza_a: valido.reemplazaA,
      },
      p_items: valido.items,
    },
  }
}

/** Huella de lo que se guardaría. Con algo a medio escribir (un precio inválido, sin cliente) se usa el contenido. */
function huella(estado: EstadoEditor): string {
  const resultado = payloadGuardar(estado)
  if (resultado.ok) return `payload:${JSON.stringify(resultado.payload)}`
  return `estado:${JSON.stringify({
    ...estado,
    items: estado.items.map((item) => [item.seccion, item.descripcion, item.cantidad, item.precio, item.unidad]),
    bloques: estado.bloques.map((bloque) => [bloque.titulo, bloque.contenido, bloque.oculto]),
  })}`
}

/**
 * true si guardar cambiaría algo. Compara lo que se mandaría a la base, no las claves ni cómo está escrito
 * ("39000000" y "39.000.000" son el mismo precio).
 */
export function hayCambios(guardado: EstadoEditor, actual: EstadoEditor): boolean {
  return huella(guardado) !== huella(actual)
}

// ---------------------------------------------------------------------------------------------------------------
// Documento y pendientes

/**
 * El FuenteDocumento del estado sin guardar, para armarDocumento (pendientes en el navegador, vista previa en el
 * servidor). Equipo y firmante salen de los catálogos; el contacto lo pasa quien llama (null alcanza para las
 * variables). Lo que está a medio escribir no rompe: fecha inválida → hoy, validez inválida → 0, cantidad
 * inválida → 1, precio inválido → sin precio.
 */
export function fuenteDesdeEditor(
  estado: EstadoEditor,
  catalogos: CatalogosEditor,
  contacto: { nombre: string; email: string } | null,
): FuenteDocumento {
  const equipo = catalogos.equipos.find((candidato) => candidato.id === estado.equipoId)
  const firmante = catalogos.firmantes.find((candidato) => candidato.id === estado.firmanteId)
  const validez = Number(estado.validezDias.trim())
  return {
    cotizacion: {
      numero: estado.numero,
      fecha: esFecha(estado.fecha) ? estado.fecha : hoyArgentina(),
      formato: estado.formato,
      asunto: estado.asunto,
      intro: estado.intro,
      validez_dias: Number.isInteger(validez) && validez > 0 ? validez : 0,
      mostrar_total: estado.mostrarTotal,
      datos: {
        ...estado.datos,
        proxima_actualizacion: proximaActualizacionEnTexto(
          estado.proximaActualizacion,
          estado.datos.proxima_actualizacion,
        ),
      },
      bloques: estado.bloques.map(({ titulo, contenido, oculto }) => ({ titulo, contenido, oculto })),
    },
    items: estado.items.map((item, indice) => ({
      orden: indice + 1,
      seccion: item.seccion,
      descripcion: item.descripcion,
      cantidad: parsePrecio(item.cantidad) ?? 1,
      precio_unitario: parsePrecio(item.precio),
      unidad: item.unidad,
    })),
    cliente: { razon_social: estado.cliente?.razon_social ?? '', cuit: estado.cliente?.cuit ?? null },
    contacto,
    equipo: equipo ? { capacidad_tn: equipo.capacidad_tn, descripcion: equipo.descripcion } : null,
    firmante: firmante ? { nombre: firmante.nombre, cargo: firmante.cargo, telefono: firmante.telefono } : null,
    empresa: catalogos.empresa,
  }
}

/** Lo que falta para poder enviar o aprobar, calculado con el mismo armarDocumento que dibuja el PDF. */
export function pendientesEditor(estado: EstadoEditor, catalogos: CatalogosEditor): Pendientes {
  const documento = armarDocumento(fuenteDesdeEditor(estado, catalogos, null))
  return {
    // Sin guardar todavía no hay número: se asigna al guardar, no es algo que el usuario tenga que completar.
    variables: documento.faltantes.filter((nombre) => nombre !== 'numero' || estado.id !== null),
    desconocidas: documento.desconocidas,
    itemsSinPrecio: estado.items.filter((item) => parsePrecio(item.precio) === null).length,
    sinItems: estado.items.length === 0,
  }
}

export function puedeEnviar(p: Pendientes): boolean {
  return p.variables.length === 0 && p.desconocidas.length === 0 && p.itemsSinPrecio === 0 && !p.sinItems
}
```

```bash
npx vitest run src/lib/cotizaciones/editor.test.ts
```

Expected: PASS (89 tests).

- [ ] **Step 7: Comprobar que `FilaEditor` encaja con la consulta**

```bash
npm run typecheck
```

Expected: sin errores. Si falla en `editor.test.ts` con `error TS2344: Type 'FilaEditor' does not satisfy the constraint …`, `SELECT_EDITOR` y `FilaEditor` se desalinearon (una columna de más o de menos, o un tipo distinto): corregir `FilaEditor` para que coincida con lo que devuelve la consulta, nunca forzar el tipo en la página. Si una tarea posterior necesita leer otra columna en la página del editor, la agrega a `SELECT_EDITOR` y a `FilaEditor` juntas.

- [ ] **Step 8: Verificar y commit**

```bash
npm run check
npm run test:int
```

Expected: `npm run check` sin errores de lint ni de tipos y todos los unitarios en verde (23 archivos). `npm run test:int` en verde: el PDF que generan enviar y aprobar sale de la base, con número, igual que antes (necesita la base local levantada con `npm run db:start`).

```bash
git add src/lib/cotizaciones/editor.ts src/lib/cotizaciones/editor.test.ts \
  src/lib/cotizaciones/datos.ts src/lib/cotizaciones/datos.test.ts \
  src/lib/cotizaciones/documento.ts src/lib/cotizaciones/documento.test.ts \
  src/lib/pdf/cotizacion-mensual.tsx src/lib/pdf/cotizacion-jornada.tsx src/lib/pdf/render.test.ts
git commit -m "feat: estado del editor de cotizaciones, reducer, guardado y pendientes

- editor.ts: estado nuevo y desde la fila, plantilla, reducer con todas las acciones de cabecera, ítems y textos
- payloadGuardar valida con Zod y arma la cabecera completa de guardar_cotizacion (bloques ocultos incluidos)
- hayCambios, pendientesEditor, puedeEnviar, fuenteDesdeEditor y esquemaEstadoEditor para la vista previa
- una cotización sin guardar no tiene número: el documento deja {{numero}} sin completar
- mensajes de esquemaItem en castellano

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 4: Servicio: guardar, versión en enviar y aprobar, transiciones, vista previa y resaltado en el PDF

**Depende de:**
- Task 1: `guardar_cotizacion` con `p_updated_at`, el helper `versionDe` y `tests/integration/cotizaciones-editor.test.ts` (acá se le suman tests).
- Task 2: `oculto` en `esquemaBloque` y `armarDocumento` que no dibuja los bloques ocultos (la vista previa lo usa tal cual; un test lo comprueba).
- Task 3 (`src/lib/cotizaciones/editor.ts`): los tipos `EstadoEditor`, `PayloadGuardar` y `CatalogosEditor`, `fuenteDesdeEditor(estado, catalogos, contacto)` (toma equipo y firmante de los catálogos por id, usa hoy si la fecha no es válida) y, en los tests, `payloadGuardar(estado)`. También que `FuenteDocumento['cotizacion']['numero']` y `DocumentoCotizacion['numero']` son `number | null` (sin guardar, `{{numero}}` queda sin completar) y que `cotizacion-mensual.tsx` y `cotizacion-jornada.tsx` ya escriben `doc.numero ?? '{{numero}}'`: esta task parte de esas líneas.
- No usa `lista.ts` ni `resultado.ts`: el servicio tira `ErrorCotizacion` y las Server Actions (Task 5) lo traducen con `mensajeParaUsuario`.

**Qué deja** (`src/lib/cotizaciones/servicio.ts`, sin `server-only`, con el cliente de Supabase por parámetro):
- `guardarCotizacion(supabase, payload, id?, version?)` → `{ id, numero, version }`: llama a `guardar_cotizacion` (con `p_id` y `p_updated_at` si hay id) y relee `numero` y `updated_at`.
- `enviarCotizacion(supabase, id, version?)` → `{ envioId }` y `aprobarCotizacion(supabase, id, fecha?, version?)` → `{ anterior }`. Con `version`, la comparan al milisegundo con la fila recién leída **antes** de generar el PDF y, si no coincide, tiran `ErrorCotizacion('La cotización cambió desde que la abriste; volvé a intentarlo')` sin subir nada. `anterior` es la cotización de `reemplaza_a` si está aprobada con el presupuesto en curso.
- `rechazarCotizacion`, `reabrirCotizacion`, `revertirAprobacion`, `borrarCotizacion`, `duplicarCotizacion` (→ `{ id }`) y `finalizarPresupuesto` (`cambiar_estado_presupuesto(id, 'finalizado')`): envoltorios de las RPC; los P0001 llegan como `ErrorCotizacion` con el texto de la base y el resto tal cual (`errorDeRpc`).
- `EntradaVistaPrevia = { estado: EstadoEditor }` y `vistaPrevia(supabase, entrada)` → `Buffer`: el PDF del estado sin guardar con las variables pendientes en amarillo. Cliente, contacto (solo si es de ese cliente), equipo, firmante y empresa se releen de la base por id; lo demás (textos, ítems, datos) sale del estado.
- `pdfParaMostrar(supabase, id, envioId?, { actual? })`: con `actual: true`, una de la app que no está aprobada se genera en el momento (con lo guardado, aunque esté enviada) y con las variables en amarillo. Aprobadas, cargadas, directas y la llamada sin `actual`, igual que hoy.
- En `src/lib/pdf`: `renderizarCotizacion(doc, { resaltarVariables? })`, `AMARILLO_VARIABLE` (`estilos.ts`) y, en `comunes.tsx`, el contexto `ResaltarVariables`, `TextoVariables({ texto })` y `textoNumero(numero)` (`'{{numero}}'` si es `null`).

**Files:**
- Modify: `src/lib/cotizaciones/servicio.ts`, `src/lib/pdf/estilos.ts`, `src/lib/pdf/comunes.tsx`, `src/lib/pdf/render.tsx`, `src/lib/pdf/cotizacion-mensual.tsx`, `src/lib/pdf/cotizacion-jornada.tsx`, `tests/integration/cotizaciones-editor.test.ts`
- Create: `src/lib/pdf/resaltar.test.ts`
- Test: `src/lib/pdf/resaltar.test.ts`, `src/lib/pdf/render.test.ts` (no cambia: tiene que seguir pasando), `tests/integration/cotizaciones-editor.test.ts`, `tests/integration/cotizaciones-servicio.test.ts` (no cambia: `enviarCotizacion` y `aprobarCotizacion` siguen aceptando las llamadas de antes)

- [ ] **Step 1: Test del resaltado en el PDF (falla)**

El fondo amarillo no se ve en el texto extraído: se busca el color de relleno entre las operaciones de dibujo de la página (`getOperatorList` de pdf.js, que `unpdf` trae; el color llega como `'#rrggbb'`). Crear `src/lib/pdf/resaltar.test.ts`:

```ts
// src/lib/pdf/resaltar.test.ts
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { describe, expect, it } from 'vitest'
import { armarDocumento } from '@/lib/cotizaciones/documento'
import { EJEMPLO_JORNADA, EJEMPLO_MENSUAL } from '@/lib/cotizaciones/ejemplos'
import { AMARILLO_VARIABLE } from './estilos'
import { renderizarCotizacion } from './render'

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** Los colores de relleno que usa el PDF ('#rrggbb'), leídos de las operaciones de dibujo de cada página. */
async function coloresDeRelleno(pdf: Buffer): Promise<Set<string>> {
  const { OPS } = await getResolvedPDFJS()
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const colores = new Set<string>()
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const { fnArray, argsArray } = await (await documento.getPage(numero)).getOperatorList()
    fnArray.forEach((operacion, indice) => {
      if (operacion === OPS.setFillRGBColor) colores.add(String(argsArray[indice][0]).toLowerCase())
    })
  }
  return colores
}

const AMARILLO = AMARILLO_VARIABLE.toLowerCase()

/** La 112523 sin los datos de la cotización: quedan {{horario}}, {{ubicacion}}, {{plazo_entrega}} y {{forma_pago}}. */
const SIN_DATOS = { ...EJEMPLO_MENSUAL, cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, datos: {} } }

describe('resaltar variables (vista previa)', () => {
  it('con resaltarVariables pinta de amarillo las variables sin completar y las deja en el texto', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(SIN_DATOS), { resaltarVariables: true })
    expect(await textoDelPdf(pdf)).toContain('{{ubicacion}}')
    expect(await coloresDeRelleno(pdf)).toContain(AMARILLO)
  }, 20_000)

  it('sin la opción (el PDF que se envía o se aprueba) no pinta nada', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(SIN_DATOS))
    expect(await textoDelPdf(pdf)).toContain('{{ubicacion}}')
    expect(await coloresDeRelleno(pdf)).not.toContain(AMARILLO)
  }, 20_000)

  it('un documento completo no tiene nada que resaltar y el texto sale corrido', async () => {
    const pdf = await renderizarCotizacion(armarDocumento(EJEMPLO_JORNADA), { resaltarVariables: true })
    expect(await coloresDeRelleno(pdf)).not.toContain(AMARILLO)
    expect(await textoDelPdf(pdf)).toContain(
      'Cotización N° 112711 alquiler de 1 (una) Grúa Telescópica capacidad 40 TN con operador.',
    )
  }, 20_000)

  it('sin número (una cotización sin guardar) muestra {{numero}} resaltado', async () => {
    const sinNumero = { ...EJEMPLO_MENSUAL, cotizacion: { ...EJEMPLO_MENSUAL.cotizacion, numero: null } }
    const pdf = await renderizarCotizacion(armarDocumento(sinNumero), { resaltarVariables: true })
    expect(await textoDelPdf(pdf)).toContain('Cotización N° {{numero}}')
    expect(await coloresDeRelleno(pdf)).toContain(AMARILLO)
  }, 20_000)
})
```

- [ ] **Step 2: Correr y ver que falla**

```bash
npm test -- src/lib/pdf/resaltar.test.ts
```

Expected: FAIL (`AMARILLO_VARIABLE` todavía no existe: `Cannot read properties of undefined (reading 'toLowerCase')`).

- [ ] **Step 3: Resaltado en `src/lib/pdf`**

Las variables sin completar llegan al documento como `{{x}}` dentro del texto (`armarDocumento` las deja así). En la vista previa, cada texto que puede tenerlas pasa por `TextoVariables`, que parte el texto con `partirVariables` y dibuja cada variable en un `<Text>` anidado con fondo amarillo (react-pdf pinta el `backgroundColor` de un `Text` anidado). La opción baja por un contexto de React, así ningún componente cambia de firma. Si la Task 2 tocó alguna de estas líneas, aplicar el mismo cambio sobre la versión nueva.

`src/lib/pdf/estilos.ts`: después de `export const AZUL_LINK = '#1F4E9E'`, agregar:

```ts
/** El amarillo de la marca (#E6DC1F) al 40 % sobre blanco, como `bg-brand-yellow/40` en el editor. */
export const AMARILLO_VARIABLE = '#F5F1A5'
```

y en `estilos`, después de `negrita: { fontWeight: 'bold' },`:

```ts
  // Variable sin completar en la vista previa (ver TextoVariables).
  variable: { backgroundColor: AMARILLO_VARIABLE },
```

`src/lib/pdf/comunes.tsx`: los imports quedan

```tsx
import { Image, Text, View } from '@react-pdf/renderer'
import { createContext, useContext } from 'react'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import type { NodoFormato, Segmento } from '@/lib/plantillas/formato'
import { partirVariables } from '@/lib/plantillas/variables'
import { estilos } from './estilos'
import { RUTA_LOGO } from './fuentes'
```

después de `type EstiloImagen = React.ComponentProps<typeof Image>['style']`, agregar:

```tsx
/**
 * En la vista previa (renderizarCotizacion con resaltarVariables) las {{variables}} que quedaron sin completar
 * se pintan con fondo amarillo, como en el editor. En el PDF que se envía o se aprueba nunca quedan.
 */
export const ResaltarVariables = createContext(false)

/** Texto que puede tener {{variables}} sin completar. Va siempre adentro de un <Text>. */
export function TextoVariables({ texto }: { texto: string }) {
  const resaltar = useContext(ResaltarVariables)
  if (!resaltar || !texto.includes('{{')) return <>{texto}</>
  // partirVariables deja los nombres en las posiciones impares.
  return (
    <>
      {partirVariables(texto).map((parte, indice) =>
        indice % 2 === 1 ? (
          <Text key={indice} style={estilos.variable}>{`{{${parte}}}`}</Text>
        ) : (
          parte
        ),
      )}
    </>
  )
}

/** El número de la cotización; sin guardar todavía no tiene (la vista previa muestra la variable). */
export function textoNumero(numero: number | null): string {
  return numero === null ? '{{numero}}' : String(numero)
}
```

y en `Segmentos` dibujar cada segmento con `TextoVariables`:

```tsx
        <Text key={indice} style={segmento.negrita ? estilos.negrita : undefined}>
          {segmento.texto}
        </Text>
```

→

```tsx
        <Text key={indice} style={segmento.negrita ? estilos.negrita : undefined}>
          <TextoVariables texto={segmento.texto} />
        </Text>
```

`src/lib/pdf/render.tsx` (archivo completo):

```tsx
import { renderToBuffer } from '@react-pdf/renderer'
import type { DocumentoCotizacion } from '@/lib/cotizaciones/documento'
import { ResaltarVariables } from './comunes'
import { CotizacionJornada } from './cotizacion-jornada'
import { CotizacionMensual } from './cotizacion-mensual'
import { registrarFuentes } from './fuentes'

export type OpcionesRender = {
  /** Vista previa: las {{variables}} sin completar salen con fondo amarillo. */
  resaltarVariables?: boolean
}

export async function renderizarCotizacion(doc: DocumentoCotizacion, opciones: OpcionesRender = {}): Promise<Buffer> {
  registrarFuentes()
  const Componente = doc.formato === 'mensual' ? CotizacionMensual : CotizacionJornada
  return renderToBuffer(
    <ResaltarVariables.Provider value={opciones.resaltarVariables ?? false}>
      <Componente doc={doc} />
    </ResaltarVariables.Provider>,
  )
}
```

`src/lib/pdf/cotizacion-mensual.tsx` (el título del documento, que la Task 3 ya dejó con `doc.numero ?? '{{numero}}'`, no cambia):

```tsx
import { Firma, Membrete, Pie, TextoFormateado } from './comunes'
```

→

```tsx
import { Firma, Membrete, Pie, TextoFormateado, TextoVariables, textoNumero } from './comunes'
```

```tsx
          <Celda indice={1}>{item.descripcion}</Celda>
```

→

```tsx
          <Celda indice={1}>
            <TextoVariables texto={item.descripcion} />
          </Celda>
```

```tsx
          <Text style={estilos.subrayado}>Cotización N° {doc.numero ?? '{{numero}}'}</Text>
```

→

```tsx
          <Text style={estilos.subrayado}>
            Cotización N° <TextoVariables texto={textoNumero(doc.numero)} />
          </Text>
```

```tsx
              <Text style={estilos.tituloBloque} minPresenceAhead={40}>
                {bloque.titulo}
              </Text>
```

→

```tsx
              <Text style={estilos.tituloBloque} minPresenceAhead={40}>
                <TextoVariables texto={bloque.titulo} />
              </Text>
```

`src/lib/pdf/cotizacion-jornada.tsx` (el número visible sale del asunto; el título y la sección de los ítems, que no pasa por variables en `armarDocumento`, quedan igual):

```tsx
import { Firma, Membrete, Pie, TextoFormateado } from './comunes'
```

→

```tsx
import { Firma, Membrete, Pie, TextoFormateado, TextoVariables } from './comunes'
```

```tsx
        {doc.asunto ? <Text style={{ marginBottom: 10 }}>{doc.asunto}</Text> : null}
        {doc.intro ? <Text style={{ marginBottom: 10 }}>{doc.intro}</Text> : null}
```

→

```tsx
        {doc.asunto ? (
          <Text style={{ marginBottom: 10 }}>
            <TextoVariables texto={doc.asunto} />
          </Text>
        ) : null}
        {doc.intro ? (
          <Text style={{ marginBottom: 10 }}>
            <TextoVariables texto={doc.intro} />
          </Text>
        ) : null}
```

```tsx
            <Text style={[estilos.subrayado, { marginBottom: 4 }]} minPresenceAhead={40}>
              {conDosPuntos(bloque.titulo)}
            </Text>
```

→

```tsx
            <Text style={[estilos.subrayado, { marginBottom: 4 }]} minPresenceAhead={40}>
              <TextoVariables texto={conDosPuntos(bloque.titulo)} />
            </Text>
```

```tsx
                <Text style={{ flex: 1, paddingRight: 12 }}>
                  {item.descripcion}
```

→

```tsx
                <Text style={{ flex: 1, paddingRight: 12 }}>
                  <TextoVariables texto={item.descripcion} />
```

Sin `resaltarVariables`, `TextoVariables` devuelve el texto tal cual: el PDF que se envía o se aprueba sale igual que antes.

- [ ] **Step 4: Correr los unitarios del PDF**

```bash
npm test -- src/lib/pdf
```

Expected: PASS (`resaltar.test.ts` 4, `render.test.ts` 4 con los de las Tasks 2 y 3, y `nombre-archivo.test.ts` 3). Que `render.test.ts` siga pasando muestra que sin la opción el texto sale igual que antes (incluidos `Cotización N° 112523` y el `Cotización N° {{numero}}` sin número de la Task 3).

- [ ] **Step 5: Tests de integración del servicio (fallan)**

En `tests/integration/cotizaciones-editor.test.ts`, reemplazar el bloque de imports que dejó la Task 1:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'
```

por:

```ts
import { extractText, getDocumentProxy, getResolvedPDFJS } from 'unpdf'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { payloadGuardar, type EstadoEditor, type PayloadGuardar } from '@/lib/cotizaciones/editor'
import {
  ErrorCotizacion,
  aprobarCotizacion,
  borrarCotizacion,
  duplicarCotizacion,
  enviarCotizacion,
  finalizarPresupuesto,
  guardarCotizacion,
  pdfParaMostrar,
  reabrirCotizacion,
  rechazarCotizacion,
  revertirAprobacion,
  vistaPrevia,
} from '@/lib/cotizaciones/servicio'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { AMARILLO_VARIABLE } from '@/lib/pdf/estilos'
import { ITEMS_JORNADA, idsDeEjemplo, versionDe } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, contraTransaccionEnCurso, crearUsuario, sql } from './helpers'
```

y agregar al final del archivo (usa `MARCA`, `CAMBIO`, `activo`, `inactivo`, `ids` y `fila` de la Task 1). El editor no maneja `notas`: una cotización que crea queda con notas vacías (al actualizar, `guardar_cotizacion` conserva las que tenga). Por eso `payload()` agrega la marca de limpieza y `marcarCopia` la pone en las copias de `duplicar_cotizacion`, que no copia notas.

```ts
// --- Servicio (Task 4) ---

const VERSION_VIEJA = '2020-01-01T00:00:00.000Z'

/** El estado del editor de una cotización por jornada completa (sin guardar), con lo que cambie cada test. */
function estadoEditor(cambios: Partial<EstadoEditor> = {}): EstadoEditor {
  return {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: { id: ids.cliente_id, razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.', cuit: null },
    contactoId: '',
    plantillaId: ids.plantilla_jornada_id,
    formato: 'jornada',
    equipoId: ids.equipo_id,
    firmanteId: ids.firmante_id,
    fecha: '2026-10-22',
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
    intro: 'Servicios de izaje en {{ubicacion}}.',
    datos: {
      ubicacion: 'Ruta 7 y Ruta 5, Neuquén',
      horario: '',
      plazo_entrega: '',
      duracion_estimada: '',
      forma_pago: '',
      disponibilidad: '',
      indice_base: '',
      proxima_actualizacion: '',
    },
    items: [
      {
        clave: 'a',
        seccion: 'Precios Jornada',
        descripcion: 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN',
        cantidad: '1',
        precio: '1.950.000',
        unidad: 'JORNADA',
      },
      {
        clave: 'b',
        seccion: 'Precios Jornada',
        descripcion: 'Movilización',
        cantidad: '1',
        precio: '2.800.000',
        unidad: 'VIAJE',
      },
    ],
    bloques: [{ clave: 'c', titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.', oculto: false }],
    reemplazaA: null,
    ...cambios,
  }
}

/**
 * El payload del editor con la marca de los tests en `notas`: el editor no manda notas (una cotización que crea
 * queda sin notas) y la limpieza de este archivo borra por notas.
 */
function payload(estado: EstadoEditor = estadoEditor()): PayloadGuardar {
  const armado = payloadGuardar(estado)
  if (!armado.ok) throw new Error('El estado del test no es válido: ' + JSON.stringify(armado.errores))
  return { ...armado.payload, p_datos: { ...armado.payload.p_datos, notas: MARCA } }
}

/** Exige que la operación se rechace con un ErrorCotizacion (mensaje para el usuario) con ese texto. */
async function rechazaCon(operacion: Promise<unknown>, mensaje: string) {
  const error = await operacion.then(
    () => undefined,
    (e: unknown) => e,
  )
  expect(error).toBeInstanceOf(ErrorCotizacion)
  expect((error as Error).message).toBe(mensaje)
}

async function subidos(id: string) {
  return sql<{ name: string }>('select name from storage.objects where name like $1 order by name', [
    `cotizaciones/${id}/%`,
  ])
}

async function estadoDe(id: string) {
  const [encontrada] = await sql<{ estado: string; presupuesto_estado: string | null }>(
    'select estado, presupuesto_estado from public.cotizaciones where id = $1',
    [id],
  )
  return encontrada
}

/** Marca con MARCA una copia hecha por duplicar_cotizacion (no copia las notas) y devuelve su versión. */
async function marcarCopia(id: string): Promise<string> {
  await sql('update public.cotizaciones set notas = $1 where id = $2', [MARCA, id])
  return versionDe(activo.client, id)
}

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** Los colores de relleno que usa el PDF ('#rrggbb'), leídos de las operaciones de dibujo de cada página. */
async function coloresDeRelleno(pdf: Buffer): Promise<Set<string>> {
  const { OPS } = await getResolvedPDFJS()
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const colores = new Set<string>()
  for (let numero = 1; numero <= documento.numPages; numero++) {
    const { fnArray, argsArray } = await (await documento.getPage(numero)).getOperatorList()
    fnArray.forEach((operacion, indice) => {
      if (operacion === OPS.setFillRGBColor) colores.add(String(argsArray[indice][0]).toLowerCase())
    })
  }
  return colores
}

describe('servicio: guardar', () => {
  it('crea con el payload del editor, devuelve número y versión, y actualiza solo con la versión vigente', async () => {
    const creada = await guardarCotizacion(activo.client, payload())
    expect(creada.numero).toBeGreaterThanOrEqual(112712)
    expect(creada.version).toBe(await versionDe(activo.client, creada.id))
    const precios = await sql<{ precio_unitario: string }>(
      'select precio_unitario from public.cotizacion_items where cotizacion_id = $1 order by orden',
      [creada.id],
    )
    expect(precios.map((item) => Number(item.precio_unitario))).toEqual([1950000, 2800000])

    const conAsunto = (asunto: string) => payload(estadoEditor({ asunto }))
    const segunda = await guardarCotizacion(activo.client, conAsunto('Segunda'), creada.id, creada.version)
    expect(segunda).toMatchObject({ id: creada.id, numero: creada.numero })
    expect(segunda.version).not.toBe(creada.version)

    await rechazaCon(guardarCotizacion(activo.client, conAsunto('Vieja'), creada.id, creada.version), CAMBIO)
    await rechazaCon(guardarCotizacion(activo.client, payload(), creada.id), 'Falta la versión de la cotización')
    expect((await fila(creada.id)).asunto).toBe('Segunda')
  })
})

describe('servicio: enviar y aprobar con la versión de la pantalla', () => {
  it('enviar devuelve el envío; con una versión vieja no genera ni sube nada', async () => {
    const { id, version } = await guardarCotizacion(activo.client, payload())
    await rechazaCon(enviarCotizacion(activo.client, id, VERSION_VIEJA), CAMBIO)
    expect(await subidos(id)).toEqual([])

    const { envioId } = await enviarCotizacion(activo.client, id, version)
    const [envio] = await sql<{ id: string }>('select id from public.cotizacion_envios where cotizacion_id = $1', [id])
    expect(envioId).toBe(envio.id)
    const mostrado = await pdfParaMostrar(activo.client, id, envioId)
    expect(mostrado?.pdf.subarray(0, 5).toString()).toBe('%PDF-')
  })

  it('la versión se compara al milisegundo, como llega de un Date del navegador', async () => {
    const { id, version } = await guardarCotizacion(activo.client, payload())
    await expect(enviarCotizacion(activo.client, id, new Date(version).toISOString())).resolves.toHaveProperty('envioId')
  })

  it('aprobar con una versión vieja no genera ni sube nada', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    await rechazaCon(aprobarCotizacion(activo.client, id, '2026-10-23', VERSION_VIEJA), CAMBIO)
    expect(await subidos(id)).toEqual([])
    expect((await estadoDe(id)).estado).toBe('borrador')
  })

  it('aprobar una renegociación devuelve la anterior si su presupuesto sigue en curso; se la puede finalizar', async () => {
    const original = await guardarCotizacion(activo.client, payload())
    expect(await aprobarCotizacion(activo.client, original.id, '2026-10-23', original.version)).toEqual({ anterior: null })

    // duplicar_cotizacion con el mismo cliente la deja como renegociación (reemplaza_a) y con fecha de hoy.
    const copia = await duplicarCotizacion(activo.client, original.id)
    const { anterior } = await aprobarCotizacion(activo.client, copia.id, undefined, await marcarCopia(copia.id))
    expect(anterior).toEqual({ id: original.id, numero: original.numero })

    await finalizarPresupuesto(activo.client, original.id)
    expect(await estadoDe(original.id)).toEqual({ estado: 'aprobada', presupuesto_estado: 'finalizado' })

    const otra = await duplicarCotizacion(activo.client, original.id)
    const versionOtra = await marcarCopia(otra.id)
    expect(await aprobarCotizacion(activo.client, otra.id, undefined, versionOtra)).toEqual({ anterior: null })
  })
})

describe('servicio: transiciones', () => {
  it('rechazar, reabrir, revertir, duplicar y borrar hacen su transición', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    await rechazarCotizacion(activo.client, id)
    expect((await estadoDe(id)).estado).toBe('rechazada')
    await reabrirCotizacion(activo.client, id)
    expect((await estadoDe(id)).estado).toBe('borrador')

    await aprobarCotizacion(activo.client, id, '2026-10-23', await versionDe(activo.client, id))
    await revertirAprobacion(activo.client, id)
    expect(await estadoDe(id)).toEqual({ estado: 'borrador', presupuesto_estado: null })

    const copia = await duplicarCotizacion(activo.client, id)
    await marcarCopia(copia.id)
    await borrarCotizacion(activo.client, copia.id)
    expect(await sql('select 1 from public.cotizaciones where id = $1', [copia.id])).toHaveLength(0)
  })

  it('los errores de negocio llegan como ErrorCotizacion con el mensaje de la base', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    await rechazaCon(reabrirCotizacion(activo.client, id), 'Solo se puede reabrir una cotización rechazada')
    await rechazaCon(
      revertirAprobacion(activo.client, id),
      'Solo se puede revertir la aprobación de una cotización aprobada',
    )
    await rechazaCon(finalizarPresupuesto(activo.client, id), 'El presupuesto no existe')
    await rechazaCon(duplicarCotizacion(activo.client, crypto.randomUUID()), 'La cotización no existe')

    await enviarCotizacion(activo.client, id)
    await rechazaCon(borrarCotizacion(activo.client, id), 'Solo se pueden borrar cotizaciones en borrador')
    await rechazarCotizacion(activo.client, id)
    await rechazaCon(rechazarCotizacion(activo.client, id), 'Solo se puede rechazar una cotización en borrador o enviada')
  })

  it('un error que no es de negocio llega tal cual (usuario inactivo)', async () => {
    const { id } = await guardarCotizacion(activo.client, payload())
    const error = await rechazarCotizacion(inactivo.client, id).then(
      () => undefined,
      (e: unknown) => e,
    )
    expect(error).not.toBeInstanceOf(ErrorCotizacion)
    expect(error).toMatchObject({ code: '42501' })
    expect((await estadoDe(id)).estado).toBe('borrador')
  })
})

describe('servicio: vista previa', () => {
  it('dibuja el editor sin guardar, con los datos de la base y las variables pendientes en amarillo', async () => {
    const antes = await sql('select id from public.cotizaciones where notas = $1', [MARCA])
    const pdf = await vistaPrevia(activo.client, {
      estado: estadoEditor({
        cliente: { id: ids.cliente_id, razon_social: 'Lo que diga el navegador', cuit: null },
        contactoId: ids.contacto_id, // es de otro cliente (Milicic): no va
        datos: { ...estadoEditor().datos, ubicacion: '' },
        bloques: [
          ...estadoEditor().bloques,
          { clave: 'd', titulo: 'Bloque oculto', contenido: '- No tiene que salir', oculto: true },
        ],
      }),
    })

    const texto = await textoDelPdf(pdf)
    expect(texto).toContain('VERTICE SERVICIOS INTEGRALES S.R.L.')
    expect(texto).not.toContain('Lo que diga el navegador')
    expect(texto).not.toContain('Atte.')
    expect(texto).toContain('capacidad 40 TN')
    expect(texto).toContain('Servicios de izaje en {{ubicacion}}.')
    expect(texto).toContain('Horario de 8 a 17 hs.')
    expect(texto).not.toContain('No tiene que salir')
    // Sin guardar todavía no tiene número (decisión 8).
    expect(texto).toContain('Cotización N° {{numero}}')
    expect(await coloresDeRelleno(pdf)).toContain(AMARILLO_VARIABLE.toLowerCase())
    expect(await sql('select id from public.cotizaciones where notas = $1', [MARCA])).toEqual(antes)
  })

  it('con un contacto del cliente lo pone en Atte.; guardada, muestra su número', async () => {
    const [contacto] = await sql<{ nombre: string }>('select nombre from public.contactos where id = $1', [ids.contacto_id])
    const creada = await guardarCotizacion(activo.client, payload())
    const pdf = await vistaPrevia(activo.client, {
      estado: estadoEditor({
        id: creada.id,
        version: creada.version,
        numero: creada.numero,
        cliente: { id: ids.cliente_con_contacto_id, razon_social: 'Milicic S.A.', cuit: null },
        contactoId: ids.contacto_id,
      }),
    })
    const texto = await textoDelPdf(pdf)
    expect(texto).toContain(`Atte. ${contacto.nombre}`)
    expect(texto).toContain(`Cotización N° ${creada.numero}`)
  })
})

describe('servicio: PDF actual', () => {
  it('con actual, una enviada muestra lo guardado y no el último envío; una aprobada, su PDF congelado', async () => {
    const conIntro = (intro: string) => payload(estadoEditor({ intro }))
    const creada = await guardarCotizacion(activo.client, conIntro('Versión enviada en {{ubicacion}}.'))
    await enviarCotizacion(activo.client, creada.id, creada.version)
    const editada = await guardarCotizacion(
      activo.client,
      conIntro('Versión corregida en {{ubicacion}}.'),
      creada.id,
      await versionDe(activo.client, creada.id),
    )

    const ultimoEnvio = await pdfParaMostrar(activo.client, creada.id)
    expect(await textoDelPdf(ultimoEnvio!.pdf)).toContain('Versión enviada en')
    const actual = await pdfParaMostrar(activo.client, creada.id, undefined, { actual: true })
    expect(await textoDelPdf(actual!.pdf)).toContain('Versión corregida en')

    await aprobarCotizacion(activo.client, creada.id, '2026-10-23', editada.version)
    const [{ pdf_aprobado_path }] = await sql<{ pdf_aprobado_path: string }>(
      'select pdf_aprobado_path from public.cotizaciones where id = $1',
      [creada.id],
    )
    const congelado = await activo.client.storage.from('documentos').download(pdf_aprobado_path)
    const aprobada = await pdfParaMostrar(activo.client, creada.id, undefined, { actual: true })
    expect(Buffer.compare(aprobada!.pdf, Buffer.from(await congelado.data!.arrayBuffer()))).toBe(0)
  })
})
```

- [ ] **Step 6: Correr y ver que fallan**

```bash
npm run test:int -- tests/integration/cotizaciones-editor.test.ts
```

Expected: los 15 de la Task 1 siguen en PASS; los nuevos FAIL (`… guardarCotizacion is not a function`, `… vistaPrevia is not a function`, y los de enviar/aprobar porque hoy ignoran la versión y no devuelven `envioId` ni `anterior`).

- [ ] **Step 7: Servicio**

Reemplazar `src/lib/cotizaciones/servicio.ts` completo. Cambios respecto del actual: `leerEmpresa` sale de `cargarFuente` (la usa también la vista previa) y `cargarFuente` lee además `reemplaza_a`; `exigirVersion` antes de cualquier validación o render en enviar y aprobar; `enviarCotizacion` devuelve el id del envío (lo busca por la ruta que acaba de registrar, que es única); `aprobarCotizacion` tiene una sola llamada a la RPC para las dos ramas (`p_pdf_path` `undefined` en una cargada, que no se manda) y devuelve `anterior`; `llamar` envuelve las RPC sin resultado; `guardarCotizacion`, las transiciones, `finalizarPresupuesto` y `vistaPrevia` son nuevas; `pdfParaMostrar` suma `opciones.actual`. Lo demás (validaciones previas, mensajes, rutas de Storage, `CON_ENVIO`) queda igual.

```ts
// src/lib/cotizaciones/servicio.ts
// Orquesta cotizaciones del lado del servidor. Recibe el cliente de Supabase por parámetro
// (el de la sesión del usuario), así respeta la RLS y se puede probar en integración.
// No importar 'server-only' acá: Vitest lo carga.
import type { SupabaseClient } from '@supabase/supabase-js'
import { z } from 'zod'
import { hoyArgentina } from '@/lib/format/fechas'
import { leerBloques, type Formato, type Unidad } from '@/lib/plantillas/contenido'
import { VARIABLES } from '@/lib/plantillas/variables'
import { nombreArchivoCotizacion } from '@/lib/pdf/nombre-archivo'
import { renderizarCotizacion } from '@/lib/pdf/render'
import type { Database, Json } from '@/lib/supabase/database.types'
import { armarDocumento, type DocumentoCotizacion, type FuenteDocumento } from './documento'
import {
  MENSAJE_CONFLICTO,
  fuenteDesdeEditor,
  type CatalogosEditor,
  type EstadoEditor,
  type PayloadGuardar,
} from './editor'

type Cliente = SupabaseClient<Database>

const BUCKET = 'documentos'

/** Error con un mensaje pensado para mostrarle al usuario. */
export class ErrorCotizacion extends Error {}

/** Datos de la empresa que van en el PDF (membrete, pie y valores por defecto de las variables). */
async function leerEmpresa(supabase: Cliente): Promise<FuenteDocumento['empresa']> {
  const { data, error } = await supabase
    .from('empresa_config')
    .select('razon_social, direccion, ciudad, telefono, email, web, indice_base, proxima_actualizacion')
    .single()
  if (error) throw error
  return data
}

/**
 * Lee la cotización con todo lo que necesita el PDF en una sola consulta: así `updated_at`
 * (la versión que se manda a las RPC) corresponde exactamente al contenido que se dibuja.
 */
async function cargarFuente(supabase: Cliente, id: string) {
  const { data: fila, error } = await supabase
    .from('cotizaciones')
    .select(
      `id, numero, fecha, formato, asunto, intro, validez_dias, mostrar_total, datos, bloques, estado, origen,
       updated_at, pdf_aprobado_path, archivo_original_path, reemplaza_a,
       cliente:clientes(razon_social, cuit),
       contacto:contactos(nombre, email),
       equipo:equipos(capacidad_tn, descripcion),
       firmante:firmantes(nombre, cargo, telefono),
       items:cotizacion_items(orden, seccion, descripcion, cantidad, precio_unitario, unidad)`,
    )
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  if (!fila) return null

  const fuente: FuenteDocumento = {
    cotizacion: {
      numero: fila.numero,
      fecha: fila.fecha,
      formato: fila.formato as Formato,
      asunto: fila.asunto,
      intro: fila.intro,
      validez_dias: fila.validez_dias,
      mostrar_total: fila.mostrar_total,
      datos: fila.datos,
      bloques: leerBloques(fila.bloques),
    },
    items: fila.items.map((item) => ({ ...item, unidad: item.unidad as Unidad })),
    cliente: fila.cliente,
    contacto: fila.contacto,
    equipo: fila.equipo,
    firmante: fila.firmante,
    empresa: await leerEmpresa(supabase),
  }
  return { fila, fuente }
}

async function cargarOFallar(supabase: Cliente, id: string) {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) throw new ErrorCotizacion('La cotización no existe')
  return cargada
}

type Fila = NonNullable<Awaited<ReturnType<typeof cargarFuente>>>['fila']

const ABIERTAS = ['borrador', 'enviada']

// Lo que la base va a rechazar y ya se ve en la fila cargada se revisa antes de generar y subir el PDF,
// con los mismos mensajes: un PDF subido no se puede borrar desde la app y quedaría huérfano. La base
// sigue siendo la que decide (bloquea la fila y vuelve a validar todo); solo un cambio entre la lectura
// y la RPC puede dejar un archivo de más.

/**
 * La versión que vio la pantalla (el updated_at con el que se abrió o se guardó por última vez) tiene que ser la
 * de la fila que se va a dibujar: si no, se enviaría o aprobaría algo que el usuario no vio. Se compara al
 * milisegundo, como la base, porque la versión pasa por un Date de JS en el navegador. Sin versión (scripts y
 * tests), vale la que se acaba de leer.
 */
function exigirVersion(fila: Fila, version: string | undefined) {
  if (version === undefined) return
  const vista = Date.parse(version)
  // El mismo texto que da la base (private.exigir_version): así el editor lo reconoce y ofrece "Recargar".
  if (Number.isNaN(vista) || vista !== Date.parse(fila.updated_at)) throw new ErrorCotizacion(MENSAJE_CONFLICTO)
}

function exigirPrecios(fila: Fila) {
  if (!fila.items.length) throw new ErrorCotizacion('La cotización no tiene ítems')
  if (fila.items.some((item) => item.precio_unitario === null)) throw new ErrorCotizacion('Hay ítems sin precio')
}

function exigirEnviable(fila: Fila) {
  if (!ABIERTAS.includes(fila.estado)) {
    throw new ErrorCotizacion('Solo se puede enviar una cotización en borrador o ya enviada')
  }
  if (fila.origen !== 'app') {
    throw new ErrorCotizacion('Una cotización cargada no se envía desde la app: su documento es el PDF original')
  }
  exigirPrecios(fila)
}

function exigirAprobable(fila: Fila, fecha: string) {
  if (!ABIERTAS.includes(fila.estado)) throw new ErrorCotizacion('Solo se puede aprobar una cotización en borrador o enviada')
  if (!z.iso.date().safeParse(fecha).success) throw new ErrorCotizacion('La fecha de aprobación no es válida')
  if (fecha < fila.fecha) throw new ErrorCotizacion('La fecha de aprobación no puede ser anterior a la cotización')
  if (fila.origen !== 'importada') exigirPrecios(fila)
}

/** Arma el documento y exige que no queden variables sin completar ni mal escritas (informa todas juntas). */
function documentoCompleto(fuente: FuenteDocumento): DocumentoCotizacion {
  const documento = armarDocumento(fuente)
  const problemas: string[] = []
  if (documento.faltantes.length) {
    problemas.push(`Faltan completar: ${documento.faltantes.map((nombre) => VARIABLES[nombre]).join(', ')}`)
  }
  if (documento.desconocidas.length) {
    problemas.push(`Hay variables mal escritas: ${documento.desconocidas.map((nombre) => `{{${nombre}}}`).join(', ')}`)
  }
  if (problemas.length) throw new ErrorCotizacion(problemas.join('. '))
  return documento
}

async function subirPdf(supabase: Cliente, ruta: string, pdf: Buffer) {
  const { error } = await supabase.storage.from(BUCKET).upload(ruta, pdf, { contentType: 'application/pdf', upsert: false })
  if (error) throw error
}

type ErrorRpc = { code?: string; message: string }

/** Los errores de negocio de la base (P0001) llegan como ErrorCotizacion; el resto, tal cual. */
function errorDeRpc(error: ErrorRpc) {
  return error.code === 'P0001' ? new ErrorCotizacion(error.message) : error
}

/** Ejecuta una RPC que no devuelve nada y tira su error (ver errorDeRpc). */
async function llamar(rpc: PromiseLike<{ error: ErrorRpc | null }>): Promise<void> {
  const { error } = await rpc
  if (error) throw errorDeRpc(error)
}

/**
 * Crea (sin id) o actualiza una cotización con todos sus ítems. Para actualizar hace falta la versión que se editó:
 * si otro guardó en el medio, la base lo rechaza con "La cotización cambió…" y no pisa nada.
 * Devuelve el número (se asigna al crear) y la versión nueva, que es la que la pantalla manda la próxima vez.
 */
export async function guardarCotizacion(
  supabase: Cliente,
  payload: PayloadGuardar,
  id?: string,
  version?: string,
): Promise<{ id: string; numero: number; version: string }> {
  const { data: guardada, error } = await supabase.rpc('guardar_cotizacion', {
    p_datos: payload.p_datos as Json,
    p_items: payload.p_items as Json,
    p_id: id,
    p_updated_at: id ? version : undefined,
  })
  if (error) throw errorDeRpc(error)

  // La RPC devuelve solo el id. Si otro guardara justo entre las dos llamadas, acá se leería su versión y el
  // próximo guardado lo pisaría sin aviso: es una ventana de milisegundos que se acepta.
  const { data: fila, error: errorLectura } = await supabase
    .from('cotizaciones')
    .select('numero, updated_at')
    .eq('id', guardada)
    .single()
  if (errorLectura) throw errorLectura
  return { id: guardada, numero: fila.numero, version: fila.updated_at }
}

/**
 * Genera el PDF, lo guarda como lo que recibió el cliente y marca la cotización como enviada.
 * Con `version`, exige que sea la que vio la pantalla antes de generar nada. Devuelve el id del envío,
 * para descargar exactamente ese PDF (/cotizaciones/{id}/pdf?envio={envioId}&descargar=1).
 */
export async function enviarCotizacion(supabase: Cliente, id: string, version?: string): Promise<{ envioId: string }> {
  const { fila, fuente } = await cargarOFallar(supabase, id)
  exigirVersion(fila, version)
  exigirEnviable(fila)

  const pdf = await renderizarCotizacion(documentoCompleto(fuente))
  const ruta = `cotizaciones/${id}/enviada-${Date.now()}.pdf`
  await subirPdf(supabase, ruta, pdf)
  await llamar(supabase.rpc('marcar_enviada', { p_id: id, p_updated_at: fila.updated_at, p_pdf_path: ruta }))

  // La ruta lleva la hora en milisegundos y no se pisa: identifica el envío que se acaba de registrar.
  const { data: envio, error } = await supabase
    .from('cotizacion_envios')
    .select('id')
    .eq('cotizacion_id', id)
    .eq('pdf_path', ruta)
    .single()
  if (error) throw error
  return { envioId: envio.id }
}

/**
 * La cotización que esta reemplaza (renegociación), si es un presupuesto aprobado en curso: la pantalla ofrece
 * finalizarlo. La aprobación ya quedó registrada, así que si esta lectura falla no se ofrece nada (no es un error).
 */
async function anteriorEnCurso(
  supabase: Cliente,
  reemplazaA: string | null,
): Promise<{ id: string; numero: number } | null> {
  if (!reemplazaA) return null
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('id, numero, estado, presupuesto_estado')
    .eq('id', reemplazaA)
    .maybeSingle()
  if (error || !data) return null
  return data.estado === 'aprobada' && data.presupuesto_estado === 'en_curso' ? { id: data.id, numero: data.numero } : null
}

/**
 * Aprueba (la cotización queda congelada). Si se armó en la app, genera y guarda el PDF definitivo;
 * si es una cotización cargada, se aprueba con su PDF original y no se genera nada.
 * Sin fecha, se aprueba con la de hoy en Argentina (como haría la base), ya validada.
 * Con `version`, exige que sea la que vio la pantalla antes de generar nada.
 * Devuelve la cotización anterior si esta la reemplaza y su presupuesto sigue en curso.
 */
export async function aprobarCotizacion(
  supabase: Cliente,
  id: string,
  fecha?: string,
  version?: string,
): Promise<{ anterior: { id: string; numero: number } | null }> {
  const { fila, fuente } = await cargarOFallar(supabase, id)
  exigirVersion(fila, version)
  const fechaAprobacion = fecha ?? hoyArgentina()
  exigirAprobable(fila, fechaAprobacion)

  let ruta: string | undefined
  if (fila.origen !== 'importada') {
    const pdf = await renderizarCotizacion(documentoCompleto(fuente))
    ruta = `cotizaciones/${id}/aprobada-${Date.now()}.pdf`
    await subirPdf(supabase, ruta, pdf)
  }
  await llamar(
    supabase.rpc('aprobar_cotizacion', {
      p_id: id,
      p_updated_at: fila.updated_at,
      p_pdf_path: ruta,
      p_fecha: fechaAprobacion,
    }),
  )
  return { anterior: await anteriorEnCurso(supabase, fila.reemplaza_a) }
}

/** Desde borrador o enviada (de la app o cargada). */
export async function rechazarCotizacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('rechazar_cotizacion', { p_id: id }))
}

/** Una rechazada de la app vuelve a borrador; una cargada, a enviada. */
export async function reabrirCotizacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('reabrir_cotizacion', { p_id: id }))
}

/** Vuelve a enviada (si tuvo envíos o es cargada) o a borrador. No con documentos activos ni en un directo. */
export async function revertirAprobacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('revertir_aprobacion', { p_id: id }))
}

/** Un borrador que nunca se envió, o una cargada que no está aprobada. */
export async function borrarCotizacion(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('borrar_cotizacion', { p_id: id }))
}

/** Copia como borrador nuevo del mismo cliente (queda como renegociación: reemplaza_a). */
export async function duplicarCotizacion(supabase: Cliente, id: string): Promise<{ id: string }> {
  const { data, error } = await supabase.rpc('duplicar_cotizacion', { p_id: id })
  if (error) throw errorDeRpc(error)
  return { id: data }
}

/** Finaliza el presupuesto de una cotización aprobada (la anterior de una renegociación). */
export async function finalizarPresupuesto(supabase: Cliente, id: string): Promise<void> {
  await llamar(supabase.rpc('cambiar_estado_presupuesto', { p_id: id, p_estado: 'finalizado' }))
}

export type EntradaVistaPrevia = { estado: EstadoEditor }

async function leerCliente(supabase: Cliente, id: string) {
  const { data, error } = await supabase.from('clientes').select('id, razon_social, cuit').eq('id', id).maybeSingle()
  if (error) throw error
  return data
}

/** El contacto solo si es de ese cliente (como exige la base al guardar). */
async function leerContacto(supabase: Cliente, clienteId: string, id: string) {
  const { data, error } = await supabase
    .from('contactos')
    .select('nombre, email')
    .eq('id', id)
    .eq('cliente_id', clienteId)
    .maybeSingle()
  if (error) throw error
  return data
}

async function leerEquipo(supabase: Cliente, id: string) {
  const { data, error } = await supabase
    .from('equipos')
    .select('id, nombre, capacidad_tn, descripcion, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

async function leerFirmante(supabase: Cliente, id: string) {
  const { data, error } = await supabase
    .from('firmantes')
    .select('id, nombre, cargo, telefono, activo')
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return data
}

/**
 * El PDF de lo que está en el editor, sin guardar, con los mismos componentes que el definitivo y las variables
 * sin completar en amarillo. Del navegador se toman los textos, los ítems y los ids: el cliente, el contacto, el
 * equipo, el firmante y la empresa se releen de la base (un id que no existe, o un contacto de otro cliente,
 * queda vacío).
 */
export async function vistaPrevia(supabase: Cliente, { estado }: EntradaVistaPrevia): Promise<Buffer> {
  const clienteId = estado.cliente?.id
  const [cliente, contacto, equipo, firmante, empresa] = await Promise.all([
    clienteId ? leerCliente(supabase, clienteId) : null,
    clienteId && estado.contactoId ? leerContacto(supabase, clienteId, estado.contactoId) : null,
    estado.equipoId ? leerEquipo(supabase, estado.equipoId) : null,
    estado.firmanteId ? leerFirmante(supabase, estado.firmanteId) : null,
    leerEmpresa(supabase),
  ])
  const catalogos: CatalogosEditor = {
    plantillas: [],
    equipos: equipo ? [equipo] : [],
    firmantes: firmante ? [firmante] : [],
    empresa,
  }
  // fuenteDesdeEditor toma equipo y firmante de los catálogos por id, y usa hoy si la fecha está a medio escribir.
  const releido: EstadoEditor = { ...estado, cliente }
  const documento = armarDocumento(fuenteDesdeEditor(releido, catalogos, contacto))
  return renderizarCotizacion(documento, { resaltarVariables: true })
}

async function descargar(supabase: Cliente, ruta: string): Promise<Buffer> {
  const { data, error } = await supabase.storage.from(BUCKET).download(ruta)
  if (error) throw error
  return Buffer.from(await data.arrayBuffer())
}

/** La ruta del PDF del último envío de la cotización, o null si nunca se envió. */
async function rutaUltimoEnvio(supabase: Cliente, id: string): Promise<string | null> {
  const { data, error } = await supabase
    .from('cotizacion_envios')
    .select('pdf_path')
    .eq('cotizacion_id', id)
    .order('enviada_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.pdf_path ?? null
}

/** Estados en los que se muestra el último envío: lo que recibió el cliente, no lo editado después. */
const CON_ENVIO = ['enviada', 'rechazada']

/**
 * El PDF que corresponde mostrar: el de un envío puntual, el congelado de una aprobada,
 * el original de una cotización cargada, el último envío de una enviada (o rechazada después de
 * enviarse) o uno generado en el momento (borradores y lo que nunca se envió).
 * Una enviada se puede seguir editando sin cambiar de estado: generarla en el momento mostraría
 * algo que el cliente no recibió. Un presupuesto directo no tiene PDF (null, igual que una inexistente).
 * Con `actual` (la vista previa en el celular), una de la app que no está aprobada se genera en el momento con lo
 * guardado, aunque se haya enviado, y con las variables sin completar en amarillo.
 */
export async function pdfParaMostrar(
  supabase: Cliente,
  id: string,
  envioId?: string,
  opciones: { actual?: boolean } = {},
): Promise<{ pdf: Buffer; nombreArchivo: string } | null> {
  const cargada = await cargarFuente(supabase, id)
  if (!cargada) return null
  const { fila, fuente } = cargada
  const nombreArchivo = nombreArchivoCotizacion(fila.numero, fuente.cliente.razon_social)

  if (envioId) {
    const { data: envio, error } = await supabase
      .from('cotizacion_envios')
      .select('pdf_path')
      .eq('id', envioId)
      .eq('cotizacion_id', id)
      .maybeSingle()
    if (error) throw error
    if (!envio) return null
    return { pdf: await descargar(supabase, envio.pdf_path), nombreArchivo }
  }

  // Un presupuesto directo no tiene PDF: generarlo mostraría una cotización que nunca existió.
  if (fila.origen === 'directa') return null

  const actual = opciones.actual === true && fila.origen === 'app' && fila.estado !== 'aprobada'
  const guardado = actual
    ? null
    : (fila.pdf_aprobado_path ??
      fila.archivo_original_path ??
      (CON_ENVIO.includes(fila.estado) ? await rutaUltimoEnvio(supabase, id) : null))
  if (guardado) return { pdf: await descargar(supabase, guardado), nombreArchivo }

  return { pdf: await renderizarCotizacion(armarDocumento(fuente), { resaltarVariables: actual }), nombreArchivo }
}
```

- [ ] **Step 8: Correr la integración**

```bash
npm run test:int -- tests/integration/cotizaciones-editor.test.ts tests/integration/cotizaciones-servicio.test.ts
npm run test:int
```

Expected: PASS en todo (`cotizaciones-editor.test.ts`: 14 de la Task 1 + 11 del servicio; `cotizaciones-servicio.test.ts` sin cambios).

- [ ] **Step 9: Verificación**

```bash
npm run check
```

Expected: PASS (lint, typecheck y unitarios).

- [ ] **Step 10: Commit**

```bash
git add src/lib/cotizaciones/servicio.ts src/lib/pdf/estilos.ts src/lib/pdf/comunes.tsx src/lib/pdf/render.tsx \
  src/lib/pdf/cotizacion-mensual.tsx src/lib/pdf/cotizacion-jornada.tsx src/lib/pdf/resaltar.test.ts \
  tests/integration/cotizaciones-editor.test.ts
git commit -m "feat: servicio del editor de cotizaciones y variables resaltadas en la vista previa

- guardarCotizacion con versión; enviar y aprobar comparan la versión que vio la pantalla antes de generar el PDF
- enviar devuelve el envío y aprobar la cotización anterior con el presupuesto en curso
- rechazar, reabrir, revertir, borrar, duplicar y finalizar el presupuesto con los errores de la base
- vista previa del estado sin guardar (datos releídos de la base) y PDF actual con ?actual
- el PDF pinta de amarillo las {{variables}} sin completar cuando se pide resaltarVariables

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 5: Server Actions y rutas de PDF del editor

**Depende de:**
- Task 2: `Resultado<T>` y `mensajeParaUsuario` (`src/lib/resultado.ts`).
- Task 3 (`src/lib/cotizaciones/editor.ts`): `EstadoEditor`, `payloadGuardar` (con datos mal formados devuelve errores, no tira) y `esquemaEstadoEditor` (solo la forma del estado: tipos, enums, uuid o `''` en los ids, largos máximos).
- Task 4: todo el servicio (`guardarCotizacion`, `enviarCotizacion`, `aprobarCotizacion`, transiciones, `finalizarPresupuesto`, `vistaPrevia`, `pdfParaMostrar` con `{ actual }`).

**Qué deja:**
- `src/app/(app)/cotizaciones/actions.ts` con las 12 acciones del contrato. Todas llaman a `requireUsuario()`, validan los uuid, devuelven `Resultado<…>` y nunca tiran (salvo el redirect de `requireUsuario`): los errores pasan por `mensajeParaUsuario`, así "Hay ítems sin precio" o "La cotización cambió desde que la abriste; volvé a intentarlo" llegan a la pantalla. Las que escriben revalidan `/cotizaciones` y `/cotizaciones/{id}` (aprobar, revertir y finalizar también `/presupuestos`; el alta rápida, `/clientes`).
- `POST /cotizaciones/vista-previa` (`src/app/(app)/cotizaciones/vista-previa/route.ts`): cuerpo JSON `{ estado }`; 401 con sesión inactiva, 400 si el cuerpo no es JSON o no valida, 200 `application/pdf` con `Cache-Control: private, no-store`. Sin sesión ni siquiera llega: el proxy redirige a `/login` (307), igual que con el PDF de hoy.
- `GET /cotizaciones/{id}/pdf?actual=1`: igual que hoy, pero con `pdfParaMostrar(…, { actual: true })`.

**Cómo se prueba:**
- Las dos rutas, con un E2E de API (`tests/e2e/cotizacion-vista-previa.spec.ts`, como el `cotizacion-pdf.spec.ts` que ya existe): sin sesión, cuerpo roto, PDF del estado sin guardar con los datos releídos de la base, y `?actual=1` de una enviada.
- Las Server Actions no se pueden llamar desde Vitest (usan `cookies()` de Next y `server-only`) ni sueltas desde Playwright (necesitan el id que genera el build). Lo que hacen por dentro ya está probado en integración (servicio, Task 4) y en unitarios (`payloadGuardar` y `esquemaEstadoEditor`, Task 3); acá quedan cubiertas por typecheck y lint, y las ejercitan los E2E de las pantallas: guardar, alta rápida, contactos y búsqueda de clientes (Task 8), transiciones (Task 12) y el flujo completo (Task 13).

**Files:**
- Create: `src/app/(app)/cotizaciones/actions.ts`, `src/app/(app)/cotizaciones/vista-previa/route.ts`, `tests/e2e/cotizacion-vista-previa.spec.ts`
- Modify: `src/app/(app)/cotizaciones/[id]/pdf/route.ts`
- Test: `tests/e2e/cotizacion-vista-previa.spec.ts`, `tests/e2e/cotizacion-pdf.spec.ts` (no cambia: tiene que seguir pasando)

- [ ] **Step 1: E2E de las rutas (falla)**

Crear `tests/e2e/cotizacion-vista-previa.spec.ts`. Prepara por SQL una enviada cuyo envío apunta a un PDF que no está en Storage: sin `?actual=1` la ruta intentaría bajarlo, así que si responde 200 con el asunto corregido es que generó la versión actual. El `import type` del editor se borra al transpilar: el spec no carga código de la app.

```ts
// tests/e2e/cotizacion-vista-previa.spec.ts
// Las rutas de PDF del editor: POST /cotizaciones/vista-previa (estado sin guardar) y GET …/pdf?actual=1.
// Las Server Actions se prueban desde la pantalla (tests/e2e/cotizaciones.spec.ts).
import { expect, test } from '@playwright/test'
import pg from 'pg'
import { extractText, getDocumentProxy } from 'unpdf'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import { iniciarSesion } from './helpers'

const MARCA = 'e2e-vista-previa'
let base: { cliente: string; equipo: string; firmante: string; enviada: string }

async function conBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

test.beforeAll(async () => {
  base = await conBase(async (db) => {
    const { rows: [ids] } = await db.query<{ cliente: string; equipo: string; firmante: string }>(
      `select
         (select id from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.') as cliente,
         (select id from public.equipos where nombre = 'Grúa telescópica XCMG QY70K-1 40 TN') as equipo,
         (select id from public.firmantes where nombre = 'Thomas Cravero') as firmante`,
    )
    // Una enviada que se corrigió después del envío. El envío apunta a un PDF que no está en Storage: sin ?actual=1
    // la ruta lo intentaría bajar; con ?actual=1 tiene que generar lo guardado ahora.
    const { rows: [enviada] } = await db.query<{ id: string }>(
      `insert into public.cotizaciones (cliente_id, formato, equipo_id, estado, asunto, datos, notas)
       values ($1, 'jornada', $2, 'enviada', 'Asunto corregido después del envío', '{"ubicacion": "Neuquén"}', $3)
       returning id`,
      [ids.cliente, ids.equipo, MARCA],
    )
    await db.query(
      `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, precio_unitario, unidad)
       values ($1, 1, 'Jornada', 1950000, 'JORNADA')`,
      [enviada.id],
    )
    await db.query('insert into public.cotizacion_envios (cotizacion_id, pdf_path) values ($1, $2)', [
      enviada.id,
      `cotizaciones/${enviada.id}/enviada-que-no-esta.pdf`,
    ])
    return { ...ids, enviada: enviada.id }
  })
})

test.afterAll(async () => {
  await conBase((db) => db.query('delete from public.cotizaciones where notas = $1', [MARCA]))
})

async function textoDelPdf(pdf: Buffer): Promise<string> {
  const documento = await getDocumentProxy(new Uint8Array(pdf))
  const { text } = await extractText(documento, { mergePages: true })
  return text.replace(/\s+/g, ' ')
}

/** El estado de una cotización nueva por jornada en el editor, sin guardar. */
function estado(cambios: Partial<EstadoEditor> = {}): EstadoEditor {
  return {
    id: null,
    version: null,
    numero: null,
    estado: 'borrador',
    origen: 'app',
    cliente: { id: base.cliente, razon_social: 'Lo que diga el navegador', cuit: null },
    contactoId: '',
    plantillaId: '',
    formato: 'jornada',
    equipoId: base.equipo,
    firmanteId: base.firmante,
    fecha: '2026-10-22',
    validezDias: '30',
    mostrarTotal: false,
    proximaActualizacion: '',
    asunto: 'Alquiler de Grúa de {{capacidad}} TN',
    intro: 'Servicios de izaje en {{ubicacion}}.',
    datos: {
      ubicacion: '',
      horario: '',
      plazo_entrega: '',
      duracion_estimada: '',
      forma_pago: '',
      disponibilidad: '',
      indice_base: '',
      proxima_actualizacion: '',
    },
    items: [
      {
        clave: 'a',
        seccion: 'Precios Jornada',
        descripcion: 'Jornada de Grúa',
        cantidad: '1',
        precio: '1.950.000',
        unidad: 'JORNADA',
      },
    ],
    bloques: [{ clave: 'b', titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.', oculto: false }],
    reemplazaA: null,
    ...cambios,
  }
}

test('la vista previa dibuja el estado sin guardar y exige sesión y un cuerpo válido', async ({ page, playwright }) => {
  const anonimo = await playwright.request.newContext({ baseURL: 'http://localhost:3000' })
  const sinSesion = await anonimo.post('/cotizaciones/vista-previa', { data: { estado: estado() }, maxRedirects: 0 })
  expect(sinSesion.status()).toBe(307)
  await anonimo.dispose()

  await iniciarSesion(page)
  const roto = await page.request.post('/cotizaciones/vista-previa', { data: { estado: { ...estado(), items: 'nada' } } })
  expect(roto.status()).toBe(400)
  const sinEnvoltorio = await page.request.post('/cotizaciones/vista-previa', { data: estado() })
  expect(sinEnvoltorio.status()).toBe(400)
  const noJson = await page.request.post('/cotizaciones/vista-previa', {
    headers: { 'Content-Type': 'text/plain' },
    data: 'hola',
  })
  expect(noJson.status()).toBe(400)

  const respuesta = await page.request.post('/cotizaciones/vista-previa', { data: { estado: estado() } })
  expect(respuesta.status()).toBe(200)
  expect(respuesta.headers()['content-type']).toBe('application/pdf')
  const texto = await textoDelPdf(await respuesta.body())
  // El cliente y el equipo se releen de la base; las variables sin completar quedan a la vista.
  expect(texto).toContain('VERTICE SERVICIOS INTEGRALES S.R.L.')
  expect(texto).not.toContain('Lo que diga el navegador')
  expect(texto).toContain('Alquiler de Grúa de 40 TN')
  expect(texto).toContain('Servicios de izaje en {{ubicacion}}.')

  // No guardó nada.
  const guardadas = await conBase((db) =>
    db.query(`select 1 from public.cotizaciones where asunto = 'Alquiler de Grúa de {{capacidad}} TN'`),
  )
  expect(guardadas.rowCount).toBe(0)
})

test('?actual=1 muestra lo guardado ahora en una enviada, no su último envío', async ({ page }) => {
  await iniciarSesion(page)
  const respuesta = await page.request.get(`/cotizaciones/${base.enviada}/pdf?actual=1`)
  expect(respuesta.status()).toBe(200)
  expect(respuesta.headers()['content-type']).toBe('application/pdf')
  expect(await textoDelPdf(await respuesta.body())).toContain('Asunto corregido después del envío')
})
```

```bash
npm run test:e2e -- tests/e2e/cotizacion-vista-previa.spec.ts
```

Expected: FAIL. El primero, en `expect(roto.status()).toBe(400)` (llega 404: la ruta no existe); el segundo, con 500 (la ruta de hoy ignora `actual` e intenta bajar el último envío). El 307 sin sesión ya pasa: lo da el proxy.

- [ ] **Step 2: Ruta de la vista previa**

Crear `src/app/(app)/cotizaciones/vista-previa/route.ts`. El cuerpo se valida con `esquemaEstadoEditor` de la Task 3 envuelto en `{ estado }` (no hace falta otro esquema). El segmento fijo `vista-previa` le gana al dinámico `[id]` (el editor de la Task 8), así que no chocan. No guarda nada: un POST de otro sitio no tiene efecto y no puede leer la respuesta; igual se exige `Content-Type: application/json`.

```ts
// src/app/(app)/cotizaciones/vista-previa/route.ts
import { z } from 'zod'
import { getEstadoSesion } from '@/lib/auth'
import { esquemaEstadoEditor } from '@/lib/cotizaciones/editor'
import { vistaPrevia, type EntradaVistaPrevia } from '@/lib/cotizaciones/servicio'
import { createClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** El cuerpo: { estado } con la forma del estado del editor (las reglas de negocio no importan para mirar). */
const esquemaEntrada = z.object({ estado: esquemaEstadoEditor }) satisfies z.ZodType<EntradaVistaPrevia>

/**
 * POST /cotizaciones/vista-previa con { estado } (el estado del editor, sin guardar): el PDF tal como saldría, con
 * las variables sin completar en amarillo. No guarda nada. 401 sin sesión activa; 400 si el cuerpo no es válido.
 */
export async function POST(request: Request) {
  const sesion = await getEstadoSesion()
  if (sesion.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    return new Response('Pedido inválido', { status: 400 })
  }
  let cuerpo: unknown
  try {
    cuerpo = await request.json()
  } catch {
    return new Response('Pedido inválido', { status: 400 })
  }
  const entrada = esquemaEntrada.safeParse(cuerpo)
  if (!entrada.success) return new Response('Pedido inválido', { status: 400 })

  const supabase = await createClient()
  const pdf = await vistaPrevia(supabase, entrada.data)
  return new Response(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': 'inline; filename="vista-previa.pdf"',
      'Cache-Control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 3: `?actual=1` en la ruta del PDF**

En `src/app/(app)/cotizaciones/[id]/pdf/route.ts`, el comentario y la llamada al servicio:

```ts
/** GET /cotizaciones/:id/pdf[?envio=:envioId][&descargar=1] */
```

→

```ts
/**
 * GET /cotizaciones/:id/pdf[?envio=:envioId][&descargar=1][&actual=1]
 * Con actual=1 (vista previa en el celular), una de la app no aprobada se genera con lo guardado ahora, aunque se
 * haya enviado antes.
 */
```

```ts
  const resultado = await pdfParaMostrar(supabase, id, envio)
```

→

```ts
  const resultado = await pdfParaMostrar(supabase, id, envio, { actual: parametros.get('actual') === '1' })
```

El archivo completo queda así:

```ts
// src/app/(app)/cotizaciones/[id]/pdf/route.ts
import { getEstadoSesion } from '@/lib/auth'
import { pdfParaMostrar } from '@/lib/cotizaciones/servicio'
import { contentDisposition } from '@/lib/pdf/nombre-archivo'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const dynamic = 'force-dynamic'

/**
 * GET /cotizaciones/:id/pdf[?envio=:envioId][&descargar=1][&actual=1]
 * Con actual=1 (vista previa en el celular), una de la app no aprobada se genera con lo guardado ahora, aunque se
 * haya enviado antes.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sesion = await getEstadoSesion()
  if (sesion.estado !== 'activo') return new Response('No autorizado', { status: 401 })

  const { id } = await params
  const parametros = new URL(request.url).searchParams
  const envio = parametros.get('envio') ?? undefined
  if (!esUuid(id) || (envio !== undefined && !esUuid(envio))) return new Response('No encontrada', { status: 404 })

  const supabase = await createClient()
  const resultado = await pdfParaMostrar(supabase, id, envio, { actual: parametros.get('actual') === '1' })
  if (!resultado) return new Response('No encontrada', { status: 404 })

  return new Response(new Uint8Array(resultado.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': contentDisposition(resultado.nombreArchivo, parametros.has('descargar') ? 'attachment' : 'inline'),
      'Cache-Control': 'private, no-store',
    },
  })
}
```

- [ ] **Step 4: Correr el E2E de las rutas**

```bash
npm run test:e2e -- tests/e2e/cotizacion-vista-previa.spec.ts tests/e2e/cotizacion-pdf.spec.ts
```

Expected: PASS (3 tests: los 2 nuevos y el del PDF que ya existía).

- [ ] **Step 5: Server Actions**

Crear `src/app/(app)/cotizaciones/actions.ts`. Detalles:
- `'use server'` va primero; solo se exportan funciones `async` (los helpers `fallo`, `ejecutar` y `revalidar` no se exportan y no quedan como acciones).
- `ejecutar` es el `try { … } catch (e) { unstable_rethrow(e); return { ok: false, mensaje: mensajeParaUsuario(e) } }` del contrato, una sola vez.
- `guardarCotizacion` valida primero la forma con `esquemaEstadoEditor` (así `id` y `version` son de confiar antes de mandarlos a la base) y después con `payloadGuardar` (reglas, con errores por campo en `errores`: `'cliente'`, `'items.2.precio'`…). Con id, manda la versión del estado: si falta, la base contesta "Falta la versión de la cotización".
- `enviarCotizacion` y `aprobarCotizacion` exigen la versión (la pantalla siempre la tiene: si hay cambios, guarda primero y usa la versión nueva). La fecha de aprobación la valida el servicio (`'La fecha de aprobación no es válida'`, `'…no puede ser anterior a la cotización'`).
- `contactosDeCliente` devuelve `ultimoContactoId` = el contacto de la cotización más reciente de ese cliente que tenga uno (o `null`); si es `null`, la pantalla elige el primero por nombre (decisión 19).
- `buscarClientes` usa `buscar_clientes` (sin acentos, por razón social, CUIT o contacto; activos primero) con límite 20.

```ts
'use server'
// src/app/(app)/cotizaciones/actions.ts
// Acciones de la lista y del editor de cotizaciones. No reciben FormData: el editor manda su estado completo y
// los botones, ids. Nunca tiran (salvo el redirect de requireUsuario): devuelven un Resultado con el mensaje para
// mostrar, así "Hay ítems sin precio" o "La cotización cambió…" llegan a la pantalla y no al boundary de error.

import { revalidatePath } from 'next/cache'
import { unstable_rethrow } from 'next/navigation'
import { requireUsuario } from '@/lib/auth'
import { esquemaEstadoEditor, payloadGuardar, type EstadoEditor } from '@/lib/cotizaciones/editor'
import * as servicio from '@/lib/cotizaciones/servicio'
import { mensajeParaUsuario, type Resultado } from '@/lib/resultado'
import { createClient } from '@/lib/supabase/server'
import { esUuid, textoRequerido } from '@/lib/validacion'

type Supabase = Awaited<ReturnType<typeof createClient>>
type Fallo = { ok: false; mensaje: string; errores?: Record<string, string> }

const IDENTIFICADOR_INVALIDO = 'Identificador inválido'

function fallo(mensaje: string, errores?: Record<string, string>): Fallo {
  return errores ? { ok: false, mensaje, errores } : { ok: false, mensaje }
}

/** Corre la operación con la sesión del usuario y convierte cualquier error en un mensaje para mostrar. */
async function ejecutar<T>(operacion: (supabase: Supabase) => Promise<T>, mensaje?: string): Promise<Resultado<T>> {
  try {
    const datos = await operacion(await createClient())
    return mensaje ? { ok: true, datos, mensaje } : { ok: true, datos }
  } catch (error) {
    unstable_rethrow(error)
    return fallo(mensajeParaUsuario(error))
  }
}

function revalidar(...ids: string[]) {
  revalidatePath('/cotizaciones')
  for (const id of ids) revalidatePath(`/cotizaciones/${id}`)
}

/**
 * Guarda el estado del editor: crea la cotización (sin id) o la actualiza con la versión que se editó.
 * Los errores de cada campo vuelven en `errores` con la clave de payloadGuardar ('cliente', 'items.2.precio'…).
 */
export async function guardarCotizacion(
  estado: EstadoEditor,
): Promise<Resultado<{ id: string; numero: number; version: string }>> {
  await requireUsuario()
  const leido = esquemaEstadoEditor.safeParse(estado)
  if (!leido.success) return fallo('Los datos de la cotización no son válidos. Recargá la página y probá de nuevo.')
  const armado = payloadGuardar(leido.data)
  if (!armado.ok) return fallo('Revisá los datos marcados', armado.errores)

  const { id, version } = leido.data
  const resultado = await ejecutar(
    (supabase) => servicio.guardarCotizacion(supabase, armado.payload, id ?? undefined, version ?? undefined),
    'Cotización guardada',
  )
  if (resultado.ok) revalidar(resultado.datos.id)
  return resultado
}

/** Genera el PDF, lo registra como enviado y devuelve el envío para descargarlo. */
export async function enviarCotizacion(id: string, version: string): Promise<Resultado<{ envioId: string }>> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  if (typeof version !== 'string' || !version) return fallo('Falta la versión de la cotización')
  const resultado = await ejecutar(
    (supabase) => servicio.enviarCotizacion(supabase, id, version),
    'Cotización marcada como enviada',
  )
  if (resultado.ok) revalidar(id)
  return resultado
}

/** Aprueba con la fecha elegida. Si reemplaza a un presupuesto en curso, lo devuelve para ofrecer finalizarlo. */
export async function aprobarCotizacion(
  id: string,
  version: string,
  fecha: string,
): Promise<Resultado<{ anterior: { id: string; numero: number } | null }>> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  if (typeof version !== 'string' || !version) return fallo('Falta la versión de la cotización')
  if (typeof fecha !== 'string') return fallo('La fecha de aprobación no es válida')
  const resultado = await ejecutar(
    (supabase) => servicio.aprobarCotizacion(supabase, id, fecha, version),
    'Cotización aprobada',
  )
  if (resultado.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return resultado
}

/** Finaliza el presupuesto de la cotización anterior de una renegociación. */
export async function finalizarPresupuesto(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.finalizarPresupuesto(supabase, id)
    return null
  }, 'Presupuesto finalizado')
  if (resultado.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return resultado
}

export async function rechazarCotizacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.rechazarCotizacion(supabase, id)
    return null
  }, 'Cotización rechazada')
  if (resultado.ok) revalidar(id)
  return resultado
}

export async function reabrirCotizacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.reabrirCotizacion(supabase, id)
    return null
  }, 'Cotización reabierta')
  if (resultado.ok) revalidar(id)
  return resultado
}

export async function revertirAprobacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.revertirAprobacion(supabase, id)
    return null
  }, 'Aprobación revertida')
  if (resultado.ok) {
    revalidar(id)
    revalidatePath('/presupuestos')
  }
  return resultado
}

export async function borrarCotizacion(id: string): Promise<Resultado> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar(async (supabase) => {
    await servicio.borrarCotizacion(supabase, id)
    return null
  }, 'Cotización borrada')
  if (resultado.ok) revalidar(id)
  return resultado
}

/** Copia como borrador nuevo (renegociación del mismo cliente) y devuelve su id para abrirla. */
export async function duplicarCotizacion(id: string): Promise<Resultado<{ id: string }>> {
  await requireUsuario()
  if (!esUuid(id)) return fallo(IDENTIFICADOR_INVALIDO)
  const resultado = await ejecutar((supabase) => servicio.duplicarCotizacion(supabase, id), 'Cotización duplicada')
  if (resultado.ok) revalidar(id, resultado.datos.id)
  return resultado
}

/** Para el combobox de cliente: sin acentos, por razón social, CUIT o contacto; los inactivos al final. */
export async function buscarClientes(
  texto: string,
): Promise<Resultado<{ id: string; razon_social: string; cuit: string | null; activo: boolean }[]>> {
  await requireUsuario()
  if (typeof texto !== 'string') return fallo('Búsqueda inválida')
  return ejecutar(async (supabase) => {
    const { data, error } = await supabase
      .rpc('buscar_clientes', { texto: texto.slice(0, 200), limite: 20 })
      .select('id, razon_social, cuit, activo')
    if (error) throw error
    return data
  })
}

const esquemaRazonSocial = textoRequerido('Ingresá la razón social')

/** Alta rápida desde el combobox: solo la razón social (el resto se completa después en Clientes). */
export async function crearClienteRapido(
  razonSocial: string,
): Promise<Resultado<{ id: string; razon_social: string; cuit: string | null }>> {
  await requireUsuario()
  const leido = esquemaRazonSocial.safeParse(razonSocial)
  if (!leido.success) return fallo(leido.error.issues[0].message)
  const resultado = await ejecutar(async (supabase) => {
    const { data, error } = await supabase
      .from('clientes')
      .insert({ razon_social: leido.data })
      .select('id, razon_social, cuit')
      .single()
    if (error) throw error
    return data
  }, 'Cliente creado')
  if (resultado.ok) revalidatePath('/clientes')
  return resultado
}

/** Contactos del cliente (por nombre) y el último que se usó en sus cotizaciones, para preseleccionarlo. */
export async function contactosDeCliente(
  clienteId: string,
): Promise<Resultado<{ contactos: { id: string; nombre: string; email: string }[]; ultimoContactoId: string | null }>> {
  await requireUsuario()
  if (!esUuid(clienteId)) return fallo(IDENTIFICADOR_INVALIDO)
  return ejecutar(async (supabase) => {
    const [contactos, ultima] = await Promise.all([
      supabase.from('contactos').select('id, nombre, email').eq('cliente_id', clienteId).order('nombre'),
      supabase
        .from('cotizaciones')
        .select('contacto_id')
        .eq('cliente_id', clienteId)
        .not('contacto_id', 'is', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ])
    if (contactos.error) throw contactos.error
    if (ultima.error) throw ultima.error
    return { contactos: contactos.data, ultimoContactoId: ultima.data?.contacto_id ?? null }
  })
}
```

- [ ] **Step 6: Verificación**

```bash
npm run check
npm run test:int
npm run test:e2e
```

Expected: PASS en los tres. `check` compila las acciones contra los tipos reales (`EstadoEditor`, `esquemaEstadoEditor`, `Resultado`, el servicio de la Task 4 y los tipos generados de la base); la integración no cambia; en E2E pasan los specs que ya había y el nuevo.

- [ ] **Step 7: Commit**

```bash
git add "src/app/(app)/cotizaciones/actions.ts" "src/app/(app)/cotizaciones/vista-previa/route.ts" \
  "src/app/(app)/cotizaciones/[id]/pdf/route.ts" tests/e2e/cotizacion-vista-previa.spec.ts
git commit -m "feat: acciones de cotizaciones y vista previa del PDF sin guardar

- Server Actions del editor y de la lista que devuelven Resultado (nunca tiran): guardar con versión, enviar,
  aprobar, transiciones, finalizar el presupuesto anterior, duplicar, alta rápida de cliente y contactos
- POST /cotizaciones/vista-previa y ?actual=1 en el PDF de una cotización

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 6: Piezas de UI compartidas y dependencias

**Depende de:** Task 2 (`estadoVisible` y `EstadoVisible` en `src/lib/cotizaciones/lista.ts`). No usa nada de las Tasks 3 a 5.

**Qué deja:** los componentes de shadcn y `@dnd-kit` que usan las pantallas del 3B, y las piezas compartidas que piden la lista (Task 7) y el editor (Tasks 8 a 12). No hay pantallas nuevas: todo tiene que seguir viéndose igual (los E2E existentes son la red).

**Files:**
- Create: `src/components/plantillas/texto-formateado.tsx`, `src/components/ui/conteo.tsx`, `src/components/cotizaciones/estado-cotizacion.tsx`
- Create (generados por shadcn): `src/components/ui/popover.tsx`, `command.tsx`, `switch.tsx`, `toggle-group.tsx`, `toggle.tsx`, `tooltip.tsx` (y `input-group.tsx` si `command` lo pide)
- Modify: `package.json`, `package-lock.json`, `src/components/configuracion/plantilla-form.tsx`, `src/components/formulario/tarjeta.tsx`, `src/components/app-shell/encabezado.tsx`, `src/components/app-shell/app-shell.tsx` (provider de los tooltips), `src/app/(app)/clientes/page.tsx`; `src/app/globals.css` solo si el CLI agrega variables que usan los componentes nuevos (Step 1)
- Test: `npm run check` y los E2E existentes (`tests/e2e/*.spec.ts`; `configuracion.spec.ts` cubre el texto de las plantillas y `clientes.spec.ts` la lista de clientes)

- [ ] **Step 1: Instalar los componentes de shadcn y dnd-kit**

Se usa el CLI instalado en el proyecto (`shadcn` 4.22.1 de `package.json`; `npx shadcn` toma el de `node_modules/.bin`), no `@latest`: así el resultado no depende del día. `--overwrite` evita las preguntas interactivas por los componentes que ya existen (`button`, `dialog`, `input`, `textarea`…).

```bash
npx shadcn add popover command switch toggle-group tooltip --yes --overwrite
git status --short
git diff -- src/app/globals.css components.json src/lib/utils.ts
```

Antes de restaurar nada, mirá ese diff:
- Los componentes que ya existían (`src/components/ui/*` con seguimiento) se restauran siempre, para no cambiarles el estilo: `git restore -- src/components/ui`. Los nuevos no tienen seguimiento y quedan.
- `components.json` y `src/lib/utils.ts` se restauran siempre: `git restore -- components.json src/lib/utils.ts`.
- `src/app/globals.css`: si el diff solo reescribe lo que ya estaba (orden, formato, otro valor de una variable existente), `git restore -- src/app/globals.css`. Si **agrega** variables o utilidades, buscá cada nombre en los archivos nuevos (`grep -n "<nombre>" src/components/ui/{popover,command,switch,toggle-group,toggle,tooltip}.tsx`, más `input-group.tsx` si apareció). Conservá solo las líneas agregadas que usan, sin tocar las que ya estaban, y restaurá el resto. Si las borrás sin mirar, no falla el build: falla el estilo de los componentes nuevos.

```bash
npm i @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
git status --short
```

Expected (`git status`): ` M package.json`, ` M package-lock.json`, `src/app/globals.css` solo si conservaste algo que usan los nuevos y, sin seguimiento, `src/components/ui/command.tsx`, `popover.tsx`, `switch.tsx`, `toggle-group.tsx`, `toggle.tsx`, `tooltip.tsx` (y `input-group.tsx` si `command` lo usa). Si aparece modificado otro archivo que ya existía (por ejemplo `tsconfig.json`), restauralo también con `git restore -- <archivo>`.

```bash
npm ls cmdk @dnd-kit/core @dnd-kit/sortable @dnd-kit/utilities
npm run typecheck
```

Expected: las cuatro dependencias listadas sin `missing` ni `invalid`, y typecheck sin errores. Los archivos generados mantienen su estilo (comillas dobles, `cn` importado de `"cn"` o de `"@/lib/utils"`, que lo reexporta): no se reformatean. Si `npm run lint` marca algo en un archivo generado, se corrige lo mínimo en ese archivo. Si `command.tsx` no compila contra el `dialog.tsx` restaurado (por ejemplo, una prop de `DialogContent` que no existe), se borra la función `CommandDialog` de `command.tsx` y su export: no se usa (el combobox de cliente usa `Popover` + `Command`).

- [ ] **Step 2: Provider de los tooltips**

En el estilo `radix-nova` (el de `components.json`), `Tooltip` **no** envuelve el `Root` en `<TooltipProvider>` (verificado en el registro: `https://ui.shadcn.com/r/styles/radix-nova/tooltip.json`), y un tooltip sin provider arriba falla al montarse. Se agrega una sola vez en el shell. En `src/components/app-shell/app-shell.tsx`, sumar el import (antes de `import type { UsuarioActual } from '@/lib/auth'`) y envolver lo que devuelve `AppShell`:

```tsx
import { TooltipProvider } from '@/components/ui/tooltip'
```

```tsx
export function AppShell({ usuario, children }: { usuario: UsuarioActual; children: React.ReactNode }) {
  return (
    <TooltipProvider delayDuration={300}>
      <div className="flex min-h-svh">
        {/* … el aside y la columna principal, sin cambios … */}
      </div>
    </TooltipProvider>
  )
}
```

`AppShell` sigue siendo un Server Component: `TooltipProvider` es de cliente y se puede renderizar con children. Si el `tooltip.tsx` generado sí envolviera el `Root` en su propio provider, el de afuera no molesta (gana el de adentro).

- [ ] **Step 3: Extraer el texto formateado de las plantillas**

`ConVariables`, `Segmentos` y `TextoBloque` pasan tal cual a un módulo compartido. Los usa la plantilla; el editor usa `ConVariables` en la tarjeta Asunto (Task 8). `TextoBloque` queda compartido para el 3C: los textos del editor (Task 10) se editan siempre en el textarea, sin la vista en reposo que relev-visual §3.6 marca como opcional. No llevan `'use client'`: no tienen estado y sirven desde el servidor y desde el cliente.

```tsx
// src/components/plantillas/texto-formateado.tsx
import { parsearFormato, type Segmento } from '@/lib/plantillas/formato'
import { esVariable, partirVariables, VARIABLES } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

/** Texto con las variables ({{capacidad}}) marcadas en amarillo: se completan en cada cotización. */
export function ConVariables({ texto }: { texto: string }) {
  return partirVariables(texto).map((parte, indice) =>
    indice % 2 === 0 ? (
      parte
    ) : (
      <mark
        key={indice}
        title={esVariable(parte) ? VARIABLES[parte] : 'Variable desconocida'}
        className="rounded-sm bg-brand-yellow/40 px-0.5 text-inherit"
      >
        {`{{${parte}}}`}
      </mark>
    ),
  )
}

/** Tramos de una línea con su negrita (**…**), cada uno con sus variables marcadas. */
export function Segmentos({ segmentos }: { segmentos: Segmento[] }) {
  return segmentos.map((segmento, indice) =>
    segmento.negrita ? (
      <strong key={indice} className="font-semibold text-foreground">
        <ConVariables texto={segmento.texto} />
      </strong>
    ) : (
      <ConVariables key={indice} texto={segmento.texto} />
    ),
  )
}

/** El contenido de un bloque con el formato mínimo (viñetas y negritas), como en el PDF. */
export function TextoBloque({ contenido }: { contenido: string }) {
  return (
    <div className="space-y-1.5 text-[15px] text-foreground/80">
      {parsearFormato(contenido).map((nodo, indice) =>
        nodo.tipo === 'parrafo' ? (
          <p key={indice}>
            <Segmentos segmentos={nodo.segmentos} />
          </p>
        ) : (
          <p key={indice} className={cn('flex gap-2', nodo.nivel === 2 && 'pl-5')}>
            <span aria-hidden className="shrink-0 text-muted-foreground">
              {nodo.nivel === 1 ? '-' : '•'}
            </span>
            <span className="min-w-0">
              <Segmentos segmentos={nodo.segmentos} />
            </span>
          </p>
        ),
      )}
    </div>
  )
}
```

En `src/components/configuracion/plantilla-form.tsx`:
- Borrar las funciones locales `ConVariables` (líneas 66-81), `Segmentos` (83-93) y `TextoBloque` (95-117), con sus comentarios. `TextoLibre` se queda: usa `ConVariables`.
- Reemplazar estos imports:

```tsx
import { parsearFormato, type Segmento } from '@/lib/plantillas/formato'
import { esVariable, partirVariables, VARIABLES } from '@/lib/plantillas/variables'
```

  por uno solo, ubicado entre `@/components/formulario/tarjeta` y `@/components/ui/button`:

```tsx
import { ConVariables, TextoBloque } from '@/components/plantillas/texto-formateado'
```

  `cn`, `Bloque` e `ItemPlantilla` siguen importados (los usan `Chip`, `BotonGuardar`, `TextoLibre`, la tabla y el tipo `Plantilla`).

```bash
npm run lint && npm run typecheck
```

Expected: sin errores ni imports sin usar.

- [ ] **Step 4: `Tarjeta` con ícono y bajada opcionales y acciones**

En `src/components/formulario/tarjeta.tsx`, sumar `import { cn } from '@/lib/utils'` (después de `@/lib/plantillas/variables`) y reemplazar la función `Tarjeta` entera (líneas 25-56) por:

```tsx
/**
 * Tarjeta de un grupo de campos: título y, opcionales, ícono, bajada, acciones a la derecha del título y una franja
 * abajo ("Así sale…"). Sin ícono ni bajada es la tarjeta compacta del editor de cotización.
 */
export function Tarjeta({
  icono: Icono,
  titulo,
  descripcion,
  acciones,
  franja,
  children,
}: {
  icono?: LucideIcon | ((props: { className?: string }) => React.ReactNode)
  titulo: string
  descripcion?: string
  /** Botones chicos a la derecha del título (por ejemplo "Restaurar desde la plantilla"). */
  acciones?: React.ReactNode
  franja?: React.ReactNode
  children: React.ReactNode
}) {
  return (
    <section className="@container overflow-hidden rounded-xl border bg-card shadow-tarjeta">
      <div className="space-y-4 p-5 sm:p-6">
        <div className={cn('flex gap-3', descripcion ? 'items-start' : 'items-center')}>
          {Icono ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-accent text-primary">
              <Icono className="size-5" aria-hidden />
            </span>
          ) : null}
          <div className="min-w-0 flex-1 space-y-0.5">
            <h2 className="text-lg leading-tight font-medium">{titulo}</h2>
            {descripcion ? <p className="text-sm text-muted-foreground">{descripcion}</p> : null}
          </div>
          {acciones ? <div className="-my-1 flex shrink-0 items-center gap-1">{acciones}</div> : null}
        </div>
        {children}
      </div>
      {franja ? <div className="space-y-1 border-t bg-muted/60 px-5 py-4 text-sm sm:px-6">{franja}</div> : null}
    </section>
  )
}
```

Todos los usos actuales pasan ícono y bajada, así que se ven igual (el bloque del título suma `flex-1`, que no cambia nada sin acciones). **No** agregar `aria-labelledby` a la `section`: `getByLabel('Cliente')` en los E2E del editor encontraría también la tarjeta "Cliente" y fallaría por modo estricto.

- [ ] **Step 5: `EncabezadoPagina` compacto**

En `src/components/app-shell/encabezado.tsx`, reemplazar `EncabezadoPagina` (líneas 100-124) por:

```tsx
/**
 * Encabezado de una página sin banda (listas, subpáginas de configuración). `compacto` es el del editor de cotización:
 * título más chico y en semibold para que entren el número, la pastilla y tres botones en una fila a 1200 px.
 */
export function EncabezadoPagina({
  titulo,
  descripcion,
  extra,
  acciones,
  compacto = false,
}: {
  titulo: string
  descripcion?: React.ReactNode
  extra?: React.ReactNode
  acciones?: React.ReactNode
  compacto?: boolean
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
      <div className="min-w-0 space-y-1.5">
        <div className="flex flex-wrap items-center gap-3">
          <h1
            className={cn(
              'leading-tight tracking-tight',
              compacto ? 'text-[1.75rem] font-semibold' : 'text-[2.1875rem] font-normal',
            )}
          >
            {titulo}
          </h1>
          {extra}
        </div>
        {descripcion ? <p className="text-[15px] text-muted-foreground">{descripcion}</p> : null}
      </div>
      {acciones ? <div className="flex flex-wrap items-center gap-2">{acciones}</div> : null}
    </div>
  )
}
```

`cn` ya está importado en ese archivo. Sin `compacto` las clases del h1 son las mismas de antes.

- [ ] **Step 6: `Conteo`**

```tsx
// src/components/ui/conteo.tsx
/** Chip gris con el total, al lado del título de una lista (Clientes, Cotizaciones). */
export function Conteo({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-base font-medium text-muted-foreground tabular-nums">
      {children}
    </span>
  )
}
```

En `src/app/(app)/clientes/page.tsx`, sumar `import { Conteo } from '@/components/ui/conteo'` (después de `@/components/ui/button`) y reemplazar el `extra` (líneas 24-28) por:

```tsx
          extra={<Conteo>{clientes.length}</Conteo>}
```

- [ ] **Step 7: `EstadoCotizacion`**

"Vencida" no es un estado guardado: es una enviada fuera de validez (`v_cotizaciones.vencida`). `estadoVisible` (Task 2) hace esa traducción; acá solo se le pone etiqueta y tono (decisión 3, sin tonos nuevos). El mapa se exporta porque el filtro de estado de la lista (Task 7) usa las mismas etiquetas.

```tsx
// src/components/cotizaciones/estado-cotizacion.tsx
import { Pastilla, type TonoPastilla } from '@/components/ui/pastilla'
import { estadoVisible, type EstadoVisible } from '@/lib/cotizaciones/lista'

/** Etiqueta y tono de cada estado que ve el usuario (la pastilla y el filtro de la lista usan las mismas). */
export const ESTADOS_COTIZACION: Record<EstadoVisible, { etiqueta: string; tono: TonoPastilla }> = {
  borrador: { etiqueta: 'Borrador', tono: 'neutro' },
  enviada: { etiqueta: 'Enviada', tono: 'info' },
  vencida: { etiqueta: 'Vencida', tono: 'aviso' },
  aprobada: { etiqueta: 'Aprobada', tono: 'exito' },
  rechazada: { etiqueta: 'Rechazada', tono: 'peligro' },
}

/**
 * Pastilla de estado de una cotización: lista, encabezado del editor y, más adelante, la ficha de cliente.
 * `vencida` es la columna de v_cotizaciones; sin ella (una cotización nueva) nunca se muestra "Vencida".
 */
export function EstadoCotizacion({ estado, vencida = null }: { estado: string; vencida?: boolean | null }) {
  const { etiqueta, tono } = ESTADOS_COTIZACION[estadoVisible(estado, vencida)]
  return <Pastilla tono={tono}>{etiqueta}</Pastilla>
}
```

No lleva `'use client'`: se usa desde Server Components (tabla de la lista) y desde el editor.

- [ ] **Step 8: Verificación y commit**

```bash
npm run check
```

Expected: lint, typecheck y unitarios en verde.

Con Supabase local levantado (`npm run db:start` si hace falta) y sin otro `next dev` en el puerto 3000 (si quedó uno tuyo: `lsof -ti tcp:3000 | xargs kill`):

```bash
npm run test:e2e
```

Expected: todos los E2E existentes en verde (`auth`, `clientes`, `configuracion`, `cotizacion-pdf`). En particular "plantillas iniciales: mensual y por jornada con sus textos" sigue encontrando `Alquiler mensual Grúa {{capacidad}} TN` (ahora lo dibuja `ConVariables` desde el módulo compartido).

```bash
git add package.json package-lock.json src/components/ui src/components/plantillas src/components/cotizaciones \
  src/components/configuracion/plantilla-form.tsx src/components/formulario/tarjeta.tsx \
  src/components/app-shell "src/app/(app)/clientes/page.tsx"
git add src/app/globals.css   # solo si en el Step 1 conservaste variables que usan los componentes nuevos
git status --short
git commit -m "feat: piezas de UI compartidas para las pantallas de cotizaciones

- shadcn: popover, command (cmdk), switch, toggle-group y tooltip; @dnd-kit para arrastrar ítems
- ConVariables, Segmentos y TextoBloque en un módulo compartido (plantilla-form los importa)
- Tarjeta con ícono y bajada opcionales y acciones junto al título
- EncabezadoPagina compacto, Conteo (también en Clientes) y EstadoCotizacion

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected (`git status` antes del commit): nada sin agregar salvo lo que no es de esta tarea.

---

### Task 7: Lista de cotizaciones

**Depende de:**
- Task 1: `buscar_cotizaciones` en la base y en `src/lib/supabase/database.types.ts`.
- Task 2: `src/lib/cotizaciones/lista.ts` (`POR_PAGINA`, `ESTADOS_FILTRO`, `FiltrosLista`, `leerFiltros`, `hrefConFiltros`, `estadoVisible`, `resumenCotizacion`, `rangoPaginas`).
- Task 5: `duplicarCotizacion(id)` en `src/app/(app)/cotizaciones/actions.ts`.
- Task 6: `Popover`, `Tooltip` (con su provider en el shell), `Conteo` y `EstadoCotizacion` / `ESTADOS_COTIZACION`.

**Qué supone del contrato de la Task 2** (si algo no se cumple, se corrige en `lista.ts` con su test, no acá):
- `hrefConFiltros` usa como parámetros de la URL los mismos nombres de `FiltrosLista` (`q`, `estado`, `cliente`, `desde`, `hasta`, `pagina`), y `hrefConFiltros(filtros, { pagina: n })` conserva los filtros y va a la página `n`.
- `leerFiltros` devuelve `''` para un `cliente` que no es UUID y para fechas que no son `YYYY-MM-DD` válidas, y una `pagina` entera ≥ 1. El E2E "parámetros inválidos" lo comprueba: la RPC rompería con un UUID o una fecha mal formados.
- `rangoPaginas(actual, total)` recibe la **cantidad de páginas** (el ejemplo del contrato termina en 12).

**Alcance:**
- Va en el 3B: la lista según `relev-visual.md` §1 y las decisiones 1 a 4, 22 y 23.
- No va en el 3B: los botones "Cargar existente" y "Presupuesto directo" (sus pantallas son del 3C, que los agrega al encabezado).
- El menú ⋯ lleva al editor ("Abrir") y a la descarga del PDF. Las transiciones del ⋯ (relev-visual §1.6: Eliminar borrador, Aprobar…, Rechazar…, Reabrir) las suma la Task 12, que es la que trae `?accion=` para abrir el editor con la confirmación abierta.
- `/cotizaciones/nueva` y `/cotizaciones/{id}` los crea la Task 8. Hasta entonces, "Nueva cotización", el N° y "Duplicar" llevan a un 404, y el E2E solo mira la URL.

**Embebido del equipo (verificado al planificar):**
- La columna Trabajo necesita el equipo para resolver `{{capacidad}}`. Se embebe sobre el resultado de la RPC: `equipo:equipos(nombre, capacidad_tn, descripcion)`.
- Contra el PostgREST 16.5 local funcionan el embebido sobre `v_cotizaciones` y sobre una RPC que devuelve `setof` de una tabla (`buscar_clientes`). Con `count=exact`, `offset`/`limit` y `order` sobre una RPC, un offset mayor al total responde 416 `PGRST103`, y un offset igual al total responde una página vacía.
- Con los tipos que genera `supabase gen types` para una función `setof v_cotizaciones` (`SetofOptions.to = 'v_cotizaciones'`), postgrest-js 2.118 tipa `equipo` como `{ nombre; capacidad_tn; descripcion } | null`.
- El embebido para una función que devuelve una **vista** no se pudo probar sin crear la función. Si la página responde `PGRST200`, el Step 9 trae el reemplazo por una segunda consulta.

**Files:**
- Create: `src/lib/cotizaciones/lista-vista.ts`, `src/lib/cotizaciones/lista-vista.test.ts`
- Create: `src/components/cotizaciones/lista/acciones-fila.tsx`, `tabla-cotizaciones.tsx`, `lista-cotizaciones-movil.tsx`, `paginacion.tsx`, `filtros-cotizaciones.tsx`
- Modify: `src/app/(app)/cotizaciones/page.tsx` (reemplaza el placeholder)
- Test: `src/lib/cotizaciones/lista-vista.test.ts`, `tests/e2e/cotizaciones.spec.ts` (nuevo) y `tests/e2e/auth.spec.ts` (existente: busca el heading "Cotizaciones" por substring)

- [ ] **Step 1: Tests de la presentación de la lista**

`lista-vista.ts` arma lo que dibujan la tabla y la lista del celular a partir de una fila de `buscar_cotizaciones`, más la paginación y el texto del filtro de fechas. Es lógica pura, así que se prueba con Vitest. El trabajo se compara contra `resumenCotizacion` (Task 2) para no duplicar su test.

```ts
// src/lib/cotizaciones/lista-vista.test.ts
import { describe, expect, it } from 'vitest'
import { resumenCotizacion } from './lista'
import {
  atajosFechas,
  filaCotizacion,
  filasMostradas,
  textoRangoFechas,
  totalPaginas,
  type FilaVistaLista,
} from './lista-vista'

function fila(cambios: Partial<FilaVistaLista> = {}): FilaVistaLista {
  return {
    id: '7f8e2c1a-0b4d-4e6f-9a1b-2c3d4e5f6a7b',
    numero: 112711,
    origen: 'app',
    fecha: '2026-10-20',
    cliente_razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
    formato: 'jornada',
    estado: 'enviada',
    vencida: false,
    vence_el: '2026-11-19',
    asunto: 'Grúa de {{capacidad}} TN en {{ubicacion}}',
    datos: { ubicacion: 'Añelo' },
    equipo: {
      nombre: 'Grúa telescópica XCMG QY70K-1 40 TN',
      capacidad_tn: 40,
      descripcion: 'Grúa Telescópica XCMG',
    },
    ...cambios,
  }
}

describe('filaCotizacion', () => {
  it('arma la fila: fechas cortas, formato en castellano y el trabajo resumido', () => {
    const entrada = fila()
    expect(filaCotizacion(entrada)).toEqual({
      id: entrada.id,
      numero: 112711,
      origen: null,
      fecha: '20/10/2026',
      cliente: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
      trabajo: resumenCotizacion(entrada),
      formato: 'Por jornada',
      estado: 'enviada',
      vencida: false,
      venceEl: '19/11/2026',
      tienePdf: true,
    })
  })

  it('"Vence el" solo en las enviadas, al día o vencidas', () => {
    expect(filaCotizacion(fila({ vencida: true }))).toMatchObject({ vencida: true, venceEl: '19/11/2026' })
    for (const estado of ['borrador', 'aprobada', 'rechazada']) {
      expect(filaCotizacion(fila({ estado, vencida: false })).venceEl).toBeNull()
    }
    expect(filaCotizacion(fila({ vencida: null, vence_el: null })).venceEl).toBeNull()
  })

  it('marca las cargadas y las directas; una directa no tiene PDF y ninguna de las dos tiene formato', () => {
    // Su formato es el valor por defecto de importar.sql y no dice nada: se muestra el origen (relev-pendientes A).
    expect(filaCotizacion(fila({ origen: 'importada' }))).toMatchObject({ origen: 'Cargada', tienePdf: true, formato: '—' })
    expect(filaCotizacion(fila({ origen: 'directa', estado: 'aprobada' }))).toMatchObject({
      origen: 'Directa',
      tienePdf: false,
      venceEl: null,
      formato: '—',
    })
  })

  it('un formato desconocido se muestra tal cual', () => {
    expect(filaCotizacion(fila({ formato: 'otro' })).formato).toBe('otro')
  })
})

describe('totalPaginas y filasMostradas', () => {
  it('de a 25, con al menos una página', () => {
    expect([0, 1, 25, 26, 50, 51].map(totalPaginas)).toEqual([1, 1, 1, 2, 2, 3])
  })

  it('las posiciones que muestra cada página', () => {
    expect(filasMostradas(1, 48)).toEqual({ desde: 1, hasta: 25 })
    expect(filasMostradas(2, 48)).toEqual({ desde: 26, hasta: 48 })
    expect(filasMostradas(2, 29)).toEqual({ desde: 26, hasta: 29 })
    expect(filasMostradas(1, 0)).toEqual({ desde: 0, hasta: 0 })
  })
})

describe('atajosFechas', () => {
  it('este mes, el anterior y los últimos 90 días (contando hoy)', () => {
    expect(atajosFechas('2026-10-25')).toEqual([
      { etiqueta: 'Este mes', desde: '2026-10-01', hasta: '2026-10-31' },
      { etiqueta: 'Mes anterior', desde: '2026-09-01', hasta: '2026-09-30' },
      { etiqueta: 'Últimos 90 días', desde: '2026-07-28', hasta: '2026-10-25' },
    ])
  })

  it('cruza el año y respeta febrero (también el bisiesto)', () => {
    expect(atajosFechas('2027-01-15').slice(0, 2)).toEqual([
      { etiqueta: 'Este mes', desde: '2027-01-01', hasta: '2027-01-31' },
      { etiqueta: 'Mes anterior', desde: '2026-12-01', hasta: '2026-12-31' },
    ])
    expect(atajosFechas('2026-02-14')[0]).toMatchObject({ desde: '2026-02-01', hasta: '2026-02-28' })
    expect(atajosFechas('2028-03-10')[1]).toMatchObject({ desde: '2028-02-01', hasta: '2028-02-29' })
  })
})

describe('textoRangoFechas', () => {
  it('describe el rango como se ve en el botón', () => {
    expect(textoRangoFechas('', '')).toBe('Cualquier fecha')
    expect(textoRangoFechas('2026-10-01', '2026-10-31')).toBe('01/10/2026 – 31/10/2026')
    expect(textoRangoFechas('2026-10-01', '')).toBe('Desde 01/10/2026')
    expect(textoRangoFechas('', '2026-10-31')).toBe('Hasta 31/10/2026')
  })
})
```

```bash
npx vitest run --project unit src/lib/cotizaciones/lista-vista.test.ts
```

Expected: FAIL (`Cannot find module './lista-vista'`).

- [ ] **Step 2: Implementar `lista-vista.ts`**

```ts
// src/lib/cotizaciones/lista-vista.ts
import { formatFechaCorta, sumarDias } from '@/lib/format/fechas'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { estadoVisible, POR_PAGINA, resumenCotizacion } from './lista'

/** Una fila de buscar_cotizaciones con las columnas que pide la lista (src/app/(app)/cotizaciones/page.tsx). */
export type FilaVistaLista = {
  id: string
  numero: number
  origen: string
  fecha: string
  cliente_razon_social: string
  formato: string
  estado: string
  vencida: boolean | null
  vence_el: string | null
  asunto: string
  datos: unknown
  equipo: { nombre: string; capacidad_tn: number | null; descripcion: string } | null
}

/** Lo que dibujan la tabla y la lista del celular: textos ya armados y ningún monto (diseño §5). */
export type FilaCotizacion = {
  id: string
  numero: number
  /** Solo en las que no se hicieron en la app. */
  origen: 'Cargada' | 'Directa' | null
  /** "20/10/2026" */
  fecha: string
  cliente: string
  /** El asunto con las variables resueltas (decisión 4). */
  trabajo: string
  /** "Mensual" o "Por jornada"; "—" en una cargada o una directa (su formato no significa nada). */
  formato: string
  /** El guardado; con `vencida` arma la pastilla (EstadoCotizacion). */
  estado: string
  vencida: boolean
  /** "19/11/2026" solo en las enviadas, al día o vencidas; null en el resto (decisión 2). */
  venceEl: string | null
  /** Un presupuesto directo no tiene PDF (la ruta responde 404). */
  tienePdf: boolean
}

export function filaCotizacion(fila: FilaVistaLista): FilaCotizacion {
  const visible = estadoVisible(fila.estado, fila.vencida)
  const conVencimiento = visible === 'enviada' || visible === 'vencida'
  return {
    id: fila.id,
    numero: fila.numero,
    origen: fila.origen === 'importada' ? 'Cargada' : fila.origen === 'directa' ? 'Directa' : null,
    fecha: formatFechaCorta(fila.fecha),
    cliente: fila.cliente_razon_social,
    trabajo: resumenCotizacion(fila),
    formato: fila.origen === 'app' ? (FORMATOS[fila.formato as Formato] ?? fila.formato) : '—',
    estado: fila.estado,
    vencida: fila.vencida === true,
    venceEl: conVencimiento && fila.vence_el ? formatFechaCorta(fila.vence_el) : null,
    tienePdf: fila.origen !== 'directa',
  }
}

/** Cantidad de páginas de la lista (al menos una). */
export function totalPaginas(total: number): number {
  return Math.max(1, Math.ceil(total / POR_PAGINA))
}

/** Primera y última posición de una página, para "Mostrando 26–29 de 29". */
export function filasMostradas(pagina: number, total: number): { desde: number; hasta: number } {
  if (total === 0) return { desde: 0, hasta: 0 }
  return { desde: (pagina - 1) * POR_PAGINA + 1, hasta: Math.min(pagina * POR_PAGINA, total) }
}

export type AtajoFechas = { etiqueta: string; desde: string; hasta: string }

function primerDia(iso: string): string {
  return `${iso.slice(0, 7)}-01`
}

function ultimoDia(iso: string): string {
  // 31 días después del día 1 siempre cae en el mes siguiente; el día anterior a su día 1 es el último de este.
  return sumarDias(primerDia(sumarDias(primerDia(iso), 31)), -1)
}

/** Rangos de un clic del filtro de fechas. `hoy` es la fecha argentina (hoyArgentina). */
export function atajosFechas(hoy: string): AtajoFechas[] {
  const finMesAnterior = sumarDias(primerDia(hoy), -1)
  return [
    { etiqueta: 'Este mes', desde: primerDia(hoy), hasta: ultimoDia(hoy) },
    { etiqueta: 'Mes anterior', desde: primerDia(finMesAnterior), hasta: finMesAnterior },
    { etiqueta: 'Últimos 90 días', desde: sumarDias(hoy, -89), hasta: hoy },
  ]
}

/** Texto del botón de fechas: "01/10/2026 – 31/10/2026", "Desde 01/10/2026", "Hasta …" o "Cualquier fecha". */
export function textoRangoFechas(desde: string, hasta: string): string {
  if (desde && hasta) return `${formatFechaCorta(desde)} – ${formatFechaCorta(hasta)}`
  if (desde) return `Desde ${formatFechaCorta(desde)}`
  if (hasta) return `Hasta ${formatFechaCorta(hasta)}`
  return 'Cualquier fecha'
}
```

```bash
npx vitest run --project unit src/lib/cotizaciones/lista-vista.test.ts
```

Expected: PASS (9 tests).

- [ ] **Step 3: E2E de la lista (falla)**

Los datos se cargan por SQL con `pg`, como en `cotizacion-pdf.spec.ts`:
- un cliente propio con tilde (`Montajes Ñandú <clave>`). La clave sale de `sufijoUnico()` con los dígitos pasados a letras: `buscar_cotizaciones` también busca por el comienzo del número, y un "1" en la búsqueda traería todas las cotizaciones;
- 25 borradores con variables en el asunto;
- una enviada vencida y una al día, las dos con un ítem de $ 1.950.000;
- una aprobada y una directa.

Son 29 en total: con 25 por página hay dos páginas. La marca `e2e-lista` va en las notas del cliente y de las cotizaciones. La limpieza borra por cliente, así también se van las copias de "Duplicar", que no copian las notas. Todo va en un `describe` propio para que las tareas siguientes sumen sus pruebas al mismo archivo sin heredar estos datos.

```ts
// tests/e2e/cotizaciones.spec.ts
import { expect, test, type Page } from '@playwright/test'
import pg from 'pg'
import { iniciarSesion, sufijoUnico } from './helpers'

async function conBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** Hoy en Argentina, como lo calcula v_cotizaciones para "vencida". */
const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date"

test.describe('lista de cotizaciones', () => {
  // Marca de los datos de esta prueba (notas del cliente y de las cotizaciones): se borran al empezar y al terminar.
  const MARCA = 'e2e-lista'
  // Solo letras: con dígitos (sufijoUnico es base 36), buscar_cotizaciones también compararía el comienzo del número
  // y "…1…" traería todas las cotizaciones.
  const clave = sufijoUnico().replace(/\d/g, (digito) => 'abcdefghij'[Number(digito)])
  const razonSocial = `Montajes Ñandú ${clave}`
  // Sin tildes: la búsqueda tiene que encontrar "Ñandú". La clave deja afuera los datos de otras pruebas.
  const busqueda = `nandu ${clave}`
  const LISTA = `/cotizaciones?q=${encodeURIComponent(busqueda)}`

  type Cotizacion = { id: string; numero: number }
  let vencida: Cotizacion & { fecha: string; fecha_corta: string; vence_el: string }
  let aprobada: Cotizacion

  async function limpiar(db: pg.Client) {
    // Por cliente: también se lleva las copias de "Duplicar", que no copian las notas.
    await db.query(
      `delete from public.cotizaciones where cliente_id in (select id from public.clientes where notas = $1)`,
      [MARCA],
    )
    await db.query(`delete from public.clientes where notas = $1`, [MARCA])
  }

  test.beforeAll(async () => {
    await conBase(async (db) => {
      await limpiar(db)
      const {
        rows: [cliente],
      } = await db.query<{ id: string }>(
        `insert into public.clientes (razon_social, notas) values ($1, $2) returning id`,
        [razonSocial, MARCA],
      )
      // 25 borradores con variables en el asunto: la lista los muestra resueltos con el equipo y los datos.
      await db.query(
        `insert into public.cotizaciones (cliente_id, formato, equipo_id, asunto, datos, notas, fecha)
         select $1, 'jornada', e.id, 'Cotización N° {{numero}} - Grúa de {{capacidad}} TN en {{ubicacion}}',
                '{"ubicacion": "Añelo"}', $2, ${HOY} - g
         from public.equipos e, generate_series(1, 25) g
         where e.nombre = 'Grúa telescópica XCMG QY70K-1 40 TN'`,
        [cliente.id, MARCA],
      )
      // Enviada hace 60 días con 30 de validez: vencida.
      const resultadoVencida = await db.query<Cotizacion & { fecha: string; fecha_corta: string; vence_el: string }>(
        `insert into public.cotizaciones
           (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, mostrar_total)
         values ($1, 'mensual', 'Izaje de tanques en Neuquén', $2, ${HOY} - 60, 30, 'enviada', true)
         returning id, numero::int as numero, to_char(fecha, 'YYYY-MM-DD') as fecha,
                   to_char(fecha, 'DD/MM/YYYY') as fecha_corta,
                   to_char(fecha + validez_dias, 'DD/MM/YYYY') as vence_el`,
        [cliente.id, MARCA],
      )
      vencida = resultadoVencida.rows[0]
      const {
        rows: [enviada],
      } = await db.query<Cotizacion>(
        `insert into public.cotizaciones
           (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, mostrar_total)
         values ($1, 'jornada', 'Traslado de equipo a Plottier', $2, ${HOY} - 2, 30, 'enviada', true)
         returning id, numero::int as numero`,
        [cliente.id, MARCA],
      )
      // Precios cotizados que la lista nunca tiene que mostrar.
      await db.query(
        `insert into public.cotizacion_items (cotizacion_id, orden, descripcion, precio_unitario, unidad)
         values ($1, 1, 'Jornada de grúa', 1950000, 'JORNADA'), ($2, 1, 'Jornada de grúa', 1950000, 'JORNADA')`,
        [vencida.id, enviada.id],
      )
      const resultadoAprobada = await db.query<Cotizacion>(
        `insert into public.cotizaciones
           (cliente_id, formato, asunto, notas, fecha, estado, fecha_aprobacion, presupuesto_estado)
         values ($1, 'jornada', 'Montaje de estructura en Centenario', $2, ${HOY} - 10, 'aprobada', ${HOY} - 5,
                 'en_curso')
         returning id, numero::int as numero`,
        [cliente.id, MARCA],
      )
      aprobada = resultadoAprobada.rows[0]
      await db.query(
        `insert into public.cotizaciones
           (cliente_id, origen, formato, asunto, notas, fecha, estado, fecha_aprobacion, presupuesto_estado)
         values ($1, 'directa', 'jornada', 'Movimiento de contenedores en Plaza Huincul', $2, ${HOY}, 'aprobada',
                 ${HOY}, 'en_curso')`,
        [cliente.id, MARCA],
      )
    })
  })

  test.afterAll(async () => {
    await conBase(limpiar)
  })

  async function abrirLista(page: Page) {
    await iniciarSesion(page)
    await page.goto(LISTA)
    await expect(page.getByRole('heading', { name: 'Cotizaciones', level: 1 })).toBeVisible()
  }

  test('busca sin acentos, resume el trabajo y pagina de a 25', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones')
    // Un solo heading con "cotizaciones": auth.spec.ts lo busca por substring.
    await expect(page.getByRole('heading', { name: /cotizaciones/i })).toHaveCount(1)

    const buscador = page.getByRole('searchbox', { name: 'Buscar cotizaciones' })
    await buscador.fill(busqueda)
    await buscador.press('Enter')
    await expect(page).toHaveURL(/q=nandu/)

    const tabla = page.getByRole('table')
    const filas = tabla.getByRole('row')
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()
    await expect(filas).toHaveCount(26) // encabezado + 25
    // El asunto con variables sale resuelto con el equipo (capacidad) y los datos (ubicación).
    await expect(filas.filter({ hasText: 'Grúa de 40 TN en Añelo' }).first()).toBeVisible()
    await expect(tabla).not.toContainText('{{')

    await page.getByRole('link', { name: 'Siguiente' }).click()
    await expect(page).toHaveURL(/pagina=2/)
    await expect(page.getByText('Mostrando 26–29 de 29')).toBeVisible()
    await expect(filas).toHaveCount(5)
    await expect(page.getByRole('link', { name: 'Siguiente' })).toHaveCount(0)

    await page.getByRole('link', { name: 'Anterior' }).click()
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()

    // Por número (buscar_cotizaciones compara el comienzo del número).
    await page.goto(`/cotizaciones?q=${vencida.numero}`)
    await expect(page.getByRole('link', { name: String(vencida.numero), exact: true })).toBeVisible()
  })

  test('filtra por estado: "Vencida" y "Enviada" coinciden con la pastilla', async ({ page }) => {
    await abrirLista(page)
    const filas = page.getByRole('table').getByRole('row')

    await page.getByRole('combobox', { name: 'Estado' }).selectOption('vencida')
    await expect(page).toHaveURL(/estado=vencida/)
    await expect(filas).toHaveCount(2)
    const filaVencida = filas.filter({ hasText: 'Izaje de tanques en Neuquén' })
    await expect(filaVencida.getByText('Vencida')).toBeVisible()
    // "Vence el" en ámbar cuando ya venció.
    await expect(filaVencida.getByText(vencida.vence_el)).toHaveClass(/text-amber-700/)

    await page.getByRole('combobox', { name: 'Estado' }).selectOption('enviada')
    await expect(page).toHaveURL(/estado=enviada/)
    await expect(filas).toHaveCount(2)
    await expect(filas.filter({ hasText: 'Traslado de equipo a Plottier' }).getByText('Enviada')).toBeVisible()
    await expect(page.getByRole('table')).not.toContainText('Izaje de tanques')
  })

  test('no muestra ningún monto', async ({ page }) => {
    await abrirLista(page)
    await expect(page.getByRole('table')).toBeVisible()
    const principal = page.getByRole('main')
    await expect(principal).not.toContainText('$')
    await expect(principal).not.toContainText('1.950.000')
    await expect(page.getByRole('columnheader', { name: /importe|monto|total/i })).toHaveCount(0)
  })

  test('filtra por cliente y por fechas, y sin resultados ofrece limpiar', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones')
    await page.getByRole('combobox', { name: 'Cliente' }).selectOption({ label: razonSocial })
    await expect(page).toHaveURL(/cliente=[0-9a-f-]{36}/)
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()

    // Un solo día: el de la vencida (los borradores son de los últimos 25 días).
    await page.getByRole('button', { name: 'Fechas: Cualquier fecha' }).click()
    const rango = page.getByRole('dialog', { name: 'Rango de fechas' })
    await rango.getByLabel('Desde').fill(vencida.fecha)
    await rango.getByLabel('Hasta').fill(vencida.fecha)
    await rango.getByRole('button', { name: 'Aplicar' }).click()
    await expect(page).toHaveURL(new RegExp(`desde=${vencida.fecha}`))
    await expect(page.getByRole('table').getByRole('row')).toHaveCount(2)
    await expect(
      page.getByRole('button', { name: `Fechas: ${vencida.fecha_corta} – ${vencida.fecha_corta}` }),
    ).toBeVisible()

    const buscador = page.getByRole('searchbox', { name: 'Buscar cotizaciones' })
    await buscador.fill(`sin resultados ${clave}`)
    await buscador.press('Enter')
    await expect(page.getByText(`No hay cotizaciones que coincidan con "sin resultados ${clave}".`)).toBeVisible()
    await page.getByRole('link', { name: 'Limpiar filtros' }).click()
    await expect(page).toHaveURL(/\/cotizaciones$/)
  })

  test('acciones de fila: PDF salvo en una directa, menú y duplicar', async ({ page }) => {
    await abrirLista(page)
    const tabla = page.getByRole('table')

    await expect(tabla.getByRole('link', { name: `Ver PDF de la ${vencida.numero}` })).toHaveAttribute(
      'href',
      `/cotizaciones/${vencida.id}/pdf`,
    )
    const filaDirecta = tabla.getByRole('row').filter({ hasText: 'Movimiento de contenedores en Plaza Huincul' })
    await expect(filaDirecta.getByText('Directa')).toBeVisible()
    await expect(filaDirecta.getByRole('link', { name: /Ver PDF/ })).toHaveCount(0)

    await tabla.getByRole('button', { name: `Más acciones de la ${vencida.numero}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Abrir' })).toHaveAttribute('href', `/cotizaciones/${vencida.id}`)
    await expect(page.getByRole('menuitem', { name: 'Descargar PDF' })).toHaveAttribute(
      'href',
      `/cotizaciones/${vencida.id}/pdf?descargar=1`,
    )
    await page.keyboard.press('Escape')

    await tabla.getByRole('button', { name: `Duplicar la ${aprobada.numero}` }).click()
    await expect(page.getByText(`Se creó un borrador a partir de la ${aprobada.numero}`)).toBeVisible()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    const copia = new URL(page.url()).pathname.split('/').pop()
    expect(copia).not.toBe(aprobada.id)
    const { rows } = await conBase((db) =>
      db.query<{ estado: string; reemplaza_a: string | null }>(
        `select estado, reemplaza_a from public.cotizaciones where id = $1`,
        [copia],
      ),
    )
    // Mismo cliente: la copia queda como renegociación de la aprobada.
    expect(rows).toEqual([{ estado: 'borrador', reemplaza_a: aprobada.id }])
    // Las demás pruebas cuentan 29: la copia se borra acá.
    await conBase((db) => db.query(`delete from public.cotizaciones where id = $1`, [copia]))
  })

  test('parámetros inválidos o una página que no existe no rompen la lista', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones?estado=cualquiera&pagina=-3&cliente=abc&desde=ayer&hasta=2026-13-45')
    await expect(page.getByRole('heading', { name: 'Cotizaciones', level: 1 })).toBeVisible()
    await expect(page.getByRole('combobox', { name: 'Estado' })).toHaveValue('')

    await page.goto(`${LISTA}&pagina=99`)
    await expect(page.getByText('Mostrando 1–25 de 29')).toBeVisible()
  })

  test.describe('en el celular', () => {
    test.use({ viewport: { width: 390, height: 844 } })

    test('lista en tarjetas y filtros en una hoja', async ({ page }) => {
      await abrirLista(page)
      await expect(page.getByRole('table')).toHaveCount(0)
      await expect(page.getByRole('link', { name: `N° ${vencida.numero}`, exact: true })).toBeVisible()
      await expect(page.getByText(`Venció el ${vencida.vence_el}`)).toBeVisible()

      await page.getByRole('button', { name: /^Filtros/ }).click()
      const hoja = page.getByRole('dialog', { name: 'Filtros' })
      await hoja.getByRole('combobox', { name: 'Estado' }).selectOption('vencida')
      await hoja.getByRole('button', { name: 'Ver resultados' }).click()
      await expect(page).toHaveURL(/estado=vencida/)
      await expect(page.getByRole('link', { name: /^N° \d+$/ })).toHaveCount(1)

      await page.getByRole('button', { name: 'Quitar filtro Vencida' }).click()
      await expect(page).not.toHaveURL(/estado=/)
      await expect(page.getByRole('link', { name: /^N° \d+$/ })).toHaveCount(25)
    })
  })
})
```

Con Supabase local levantado (Playwright levanta `npm run dev` si no está corriendo):

```bash
npx playwright test tests/e2e/cotizaciones.spec.ts
```

Expected: FAIL. Los 7 tests fallan porque la página todavía es el placeholder: no tiene buscador, ni tabla, ni el select "Estado".

- [ ] **Step 4: Acciones de fila**

Es un componente de cliente porque Duplicar llama a la Server Action y navega. En la tabla muestra tres íconos `ghost` con tooltip:
- PDF, salvo en una directa, que deja el hueco para no desalinear la columna;
- Duplicar;
- ⋯, con "Abrir" y "Descargar PDF".

En el celular todo va dentro del ⋯. Los `aria-label` llevan el número ("Duplicar la 112711") porque hay una fila por cotización. Los errores de la acción llegan como `Resultado` y se muestran con `toast.error`. `unstable_rethrow` deja pasar los errores internos de Next, como en `BorrarContacto`.

`src/components/cotizaciones/lista/acciones-fila.tsx`:

```tsx
'use client'

import { Copy, Ellipsis, FileDown, FileText, LoaderCircle, SquarePen } from 'lucide-react'
import Link from 'next/link'
import { unstable_rethrow, useRouter } from 'next/navigation'
import { useTransition } from 'react'
import { toast } from 'sonner'
import { duplicarCotizacion } from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'

/**
 * Acciones de una fila de la lista. En la tabla: PDF (salvo un presupuesto directo), Duplicar y ⋯; en el celular,
 * todo dentro del ⋯. Las transiciones (aprobar, rechazar…) las suma la Task 12: llevan al editor con su confirmación.
 */
export function AccionesFila({
  id,
  numero,
  tienePdf,
  variante = 'tabla',
}: {
  id: string
  numero: number
  tienePdf: boolean
  variante?: 'tabla' | 'movil'
}) {
  const router = useRouter()
  const [duplicando, iniciarDuplicado] = useTransition()
  const pdf = `/cotizaciones/${id}/pdf`

  // Un clic crea el borrador y abre el editor: el cliente se cambia ahí (decisión del diseño, §6).
  function duplicar() {
    iniciarDuplicado(async () => {
      try {
        const resultado = await duplicarCotizacion(id)
        if (!resultado.ok) {
          toast.error(resultado.mensaje)
          return
        }
        toast.success(`Se creó un borrador a partir de la ${numero}`)
        router.push(`/cotizaciones/${resultado.datos.id}`)
      } catch (error) {
        unstable_rethrow(error)
        toast.error('No se pudo duplicar la cotización. Probá de nuevo.')
      }
    })
  }

  const menu = (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className="text-muted-foreground"
          aria-label={`Más acciones de la ${numero}`}
        >
          <Ellipsis />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem asChild>
          <Link href={`/cotizaciones/${id}`}>
            <SquarePen aria-hidden />
            Abrir
          </Link>
        </DropdownMenuItem>
        {tienePdf && variante === 'movil' ? (
          <DropdownMenuItem asChild>
            <a href={pdf} target="_blank" rel="noopener noreferrer">
              <FileText aria-hidden />
              Ver PDF
            </a>
          </DropdownMenuItem>
        ) : null}
        {tienePdf ? (
          <DropdownMenuItem asChild>
            <a href={`${pdf}?descargar=1`}>
              <FileDown aria-hidden />
              Descargar PDF
            </a>
          </DropdownMenuItem>
        ) : null}
        {variante === 'movil' ? (
          <DropdownMenuItem disabled={duplicando} onSelect={duplicar}>
            <Copy aria-hidden />
            Duplicar
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )

  if (variante === 'movil') return menu

  return (
    <div className="flex items-center justify-end gap-1">
      {tienePdf ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
              <a href={pdf} target="_blank" rel="noopener noreferrer" aria-label={`Ver PDF de la ${numero}`}>
                <FileText />
              </a>
            </Button>
          </TooltipTrigger>
          <TooltipContent>Ver PDF</TooltipContent>
        </Tooltip>
      ) : (
        // Un presupuesto directo no tiene PDF: el hueco mantiene alineados los otros dos íconos.
        <span aria-hidden className="size-7" />
      )}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="text-muted-foreground"
            aria-label={`Duplicar la ${numero}`}
            disabled={duplicando}
            onClick={duplicar}
          >
            {duplicando ? <LoaderCircle className="animate-spin" /> : <Copy />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>Duplicar</TooltipContent>
      </Tooltip>
      {menu}
    </div>
  )
}
```

- [ ] **Step 5: Tabla de escritorio y lista del celular**

Son Server Components que reciben las filas ya armadas.
- La tabla copia el contenedor y el encabezado de `TablaClientes`.
- Las columnas se esconden con container queries: la tarjeta de la página lleva `@container`.
- La lista del celular sigue `relev-visual.md` §1.9: el link del N° se estira a toda la fila con `after:absolute after:inset-0` y el ⋯ queda por encima.

`src/components/cotizaciones/lista/tabla-cotizaciones.tsx`:

```tsx
import Link from 'next/link'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { AccionesFila } from '@/components/cotizaciones/lista/acciones-fila'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import type { FilaCotizacion } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

const ENCABEZADO = 'h-11 text-muted-foreground'

/**
 * Tabla de escritorio (docs/diseno/referencias/02-cotizaciones.png, sin la columna Importe). Va dentro de una tarjeta
 * con @container: Fecha, Formato y Vence el se esconden según el ancho de la tarjeta, no de la ventana.
 */
export function TablaCotizaciones({ filas }: { filas: FilaCotizacion[] }) {
  return (
    <Table>
      <TableHeader className="bg-muted/50">
        <TableRow className="hover:bg-transparent">
          <TableHead className={cn(ENCABEZADO, 'pl-5')}>N°</TableHead>
          <TableHead className={cn(ENCABEZADO, 'hidden @min-[50rem]:table-cell')}>Fecha</TableHead>
          <TableHead className={ENCABEZADO}>Cliente</TableHead>
          <TableHead className={ENCABEZADO}>Trabajo</TableHead>
          <TableHead className={cn(ENCABEZADO, 'hidden @min-[54rem]:table-cell')}>Formato</TableHead>
          <TableHead className={ENCABEZADO}>Estado</TableHead>
          <TableHead className={cn(ENCABEZADO, 'hidden @min-[44rem]:table-cell')}>Vence el</TableHead>
          <TableHead className={cn(ENCABEZADO, 'pr-3')}>
            <span className="sr-only">Acciones</span>
          </TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {filas.map((fila) => (
          <TableRow key={fila.id}>
            <TableCell className="py-2 pl-5">
              <Link
                href={`/cotizaciones/${fila.id}`}
                className="font-medium tabular-nums hover:text-primary hover:underline"
              >
                {fila.numero}
              </Link>
              {fila.origen ? <p className="text-xs text-muted-foreground">{fila.origen}</p> : null}
            </TableCell>
            <TableCell className="hidden py-2 tabular-nums @min-[50rem]:table-cell">{fila.fecha}</TableCell>
            <TableCell className="min-w-36 py-2 whitespace-normal">
              <span className="line-clamp-2">{fila.cliente}</span>
            </TableCell>
            <TableCell className="min-w-44 py-2 whitespace-normal">
              <span className="line-clamp-2 text-foreground/80">{fila.trabajo}</span>
            </TableCell>
            <TableCell className="hidden py-2 text-foreground/80 @min-[54rem]:table-cell">{fila.formato}</TableCell>
            <TableCell className="py-2">
              <EstadoCotizacion estado={fila.estado} vencida={fila.vencida} />
            </TableCell>
            <TableCell className="hidden py-2 tabular-nums @min-[44rem]:table-cell">
              {fila.venceEl ? <span className={cn(fila.vencida && 'text-amber-700')}>{fila.venceEl}</span> : '—'}
            </TableCell>
            <TableCell className="py-2 pr-3">
              <AccionesFila id={fila.id} numero={fila.numero} tienePdf={fila.tienePdf} />
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
```

`src/components/cotizaciones/lista/lista-cotizaciones-movil.tsx`:

```tsx
import Link from 'next/link'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { AccionesFila } from '@/components/cotizaciones/lista/acciones-fila'
import type { FilaCotizacion } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

/** La lista en tarjetas angostas (celular o tablet chica): toda la fila abre la cotización y el ⋯ lleva el resto. */
export function ListaCotizacionesMovil({ filas }: { filas: FilaCotizacion[] }) {
  return (
    <ul className="divide-y">
      {filas.map((fila) => (
        <li key={fila.id} className="relative px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <p className="text-sm">
              {/* El after: estira el link a toda la fila; el ⋯ queda por encima con z-10. */}
              <Link href={`/cotizaciones/${fila.id}`} className="font-medium tabular-nums after:absolute after:inset-0">
                N° {fila.numero}
              </Link>
              <span className="text-muted-foreground">
                {' '}
                · {fila.fecha}
                {fila.origen ? ` · ${fila.origen}` : null}
              </span>
            </p>
            <EstadoCotizacion estado={fila.estado} vencida={fila.vencida} />
          </div>
          <p className="mt-1 line-clamp-1 text-[15px] font-medium">{fila.cliente}</p>
          <p className="line-clamp-2 text-sm text-muted-foreground">{fila.trabajo}</p>
          <div className="mt-1.5 flex min-h-7 items-center justify-between gap-3">
            <p className={cn('text-[13px] tabular-nums', fila.vencida ? 'text-amber-700' : 'text-muted-foreground')}>
              {fila.venceEl ? `${fila.vencida ? 'Venció' : 'Vence'} el ${fila.venceEl}` : null}
            </p>
            <div className="relative z-10">
              <AccionesFila id={fila.id} numero={fila.numero} tienePdf={fila.tienePdf} variante="movil" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  )
}
```

- [ ] **Step 6: Paginación**

El pie va dentro de la tarjeta y solo aparece con más de una página (decisión 22). Usa links con `buttonVariants`. La página actual va en `bg-accent text-primary` con `aria-current="page"`, y los extremos que no aplican se deshabilitan. En el celular queda solo "Anterior · 1–25 de 48 · Siguiente".

`src/components/cotizaciones/lista/paginacion.tsx`:

```tsx
import { ChevronLeft, ChevronRight } from 'lucide-react'
import Link from 'next/link'
import { buttonVariants } from '@/components/ui/button'
import { hrefConFiltros, rangoPaginas, type FiltrosLista } from '@/lib/cotizaciones/lista'
import { filasMostradas, totalPaginas } from '@/lib/cotizaciones/lista-vista'
import { cn } from '@/lib/utils'

const BOTON = buttonVariants({ variant: 'ghost', size: 'sm' })

function Extremo({ href, etiqueta }: { href: string | null; etiqueta: 'Anterior' | 'Siguiente' }) {
  const contenido =
    etiqueta === 'Anterior' ? (
      <>
        <ChevronLeft aria-hidden />
        Anterior
      </>
    ) : (
      <>
        Siguiente
        <ChevronRight aria-hidden />
      </>
    )
  if (!href) {
    return (
      <span aria-disabled="true" className={cn(BOTON, 'pointer-events-none text-muted-foreground opacity-60')}>
        {contenido}
      </span>
    )
  }
  return (
    <Link href={href} className={BOTON}>
      {contenido}
    </Link>
  )
}

/** Pie de la tarjeta de la lista: "Mostrando 1–25 de 48" y las páginas. Sin pie cuando hay una sola página. */
export function Paginacion({ filtros, total }: { filtros: FiltrosLista; total: number }) {
  const paginas = totalPaginas(total)
  if (paginas <= 1) return null
  const actual = Math.min(filtros.pagina, paginas)
  const { desde, hasta } = filasMostradas(actual, total)
  const rango = (
    <>
      <span className="font-medium text-foreground tabular-nums">
        {desde}–{hasta}
      </span>{' '}
      de <span className="font-medium text-foreground tabular-nums">{total}</span>
    </>
  )

  return (
    <div className="flex items-center justify-between gap-3 border-t px-3 py-3 text-sm text-muted-foreground @min-[40rem]:px-5">
      <p className="hidden @min-[40rem]:block">Mostrando {rango}</p>
      <nav aria-label="Paginación" className="flex w-full items-center justify-between gap-1 @min-[40rem]:w-auto">
        <Extremo etiqueta="Anterior" href={actual > 1 ? hrefConFiltros(filtros, { pagina: actual - 1 }) : null} />
        <ol className="hidden items-center gap-1 @min-[40rem]:flex">
          {rangoPaginas(actual, paginas).map((pagina, indice) => (
            <li key={pagina === '…' ? `hueco-${indice}` : pagina}>
              {pagina === '…' ? (
                <span aria-hidden className="px-1.5">
                  …
                </span>
              ) : pagina === actual ? (
                <span aria-current="page" className={cn(BOTON, 'bg-accent text-primary tabular-nums hover:bg-accent')}>
                  {pagina}
                </span>
              ) : (
                <Link
                  href={hrefConFiltros(filtros, { pagina })}
                  aria-label={`Página ${pagina}`}
                  className={cn(BOTON, 'tabular-nums')}
                >
                  {pagina}
                </Link>
              )}
            </li>
          ))}
        </ol>
        <p className="@min-[40rem]:hidden">{rango}</p>
        <Extremo
          etiqueta="Siguiente"
          href={actual < paginas ? hrefConFiltros(filtros, { pagina: actual + 1 }) : null}
        />
      </nav>
    </div>
  )
}
```

- [ ] **Step 7: Filtros**

Es un componente de cliente. Toda la URL se arma con `hrefConFiltros`, así que cambiar un filtro vuelve a la página 1.
- El buscador se envía con Enter. Tiene un submit `sr-only` porque la referencia no muestra el botón "Buscar".
- Estado y Cliente son `NativeSelect` que navegan al cambiar. El `key` los remonta cuando la URL cambia desde otro lado (los chips o "Limpiar filtros").
- Las fechas van en un `Popover` con dos date nativos y atajos. No hay rango por defecto (decisión 23).
- Debajo de 40rem de contenedor se ven el buscador y un botón "Filtros" que abre un `Sheet` desde abajo. Los filtros activos aparecen como chips que se quitan de a uno.
- Mientras navega, la raíz lleva `data-pendiente`, y la tarjeta de la página se atenúa con `group-has-[[data-pendiente]]/lista:opacity-60`.

Para los E2E, los selects de escritorio llevan `aria-label` y los de la hoja llevan un `Label`. Los dos casos se encuentran con `getByRole('combobox', { name: 'Estado' })`, que ignora el que está oculto. Los ids salen de `useId`.

`src/components/cotizaciones/lista/filtros-cotizaciones.tsx`:

```tsx
'use client'

import { CalendarDays, Search, SlidersHorizontal, X } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useId, useState, useTransition } from 'react'
import { ESTADOS_COTIZACION } from '@/components/cotizaciones/estado-cotizacion'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@/components/ui/sheet'
import { ESTADOS_FILTRO, hrefConFiltros, type FiltrosLista } from '@/lib/cotizaciones/lista'
import { atajosFechas, textoRangoFechas, type AtajoFechas } from '@/lib/cotizaciones/lista-vista'
import { hoyArgentina } from '@/lib/format/fechas'
import { cn } from '@/lib/utils'

type ClienteFiltro = { id: string; razon_social: string }
type Rango = { desde: string; hasta: string }
type FiltrosHoja = Pick<FiltrosLista, 'estado' | 'cliente' | 'desde' | 'hasta'>

const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'

function aEstado(valor: string): FiltrosLista['estado'] {
  return ESTADOS_FILTRO.find((estado) => estado === valor) ?? ''
}

function rangoInvalido({ desde, hasta }: Rango) {
  return desde !== '' && hasta !== '' && desde > hasta
}

function AvisoRango() {
  return <p className="text-sm text-destructive">“Hasta” es anterior a “Desde”.</p>
}

function OpcionesEstado() {
  return (
    <>
      <NativeSelectOption value="">Todos los estados</NativeSelectOption>
      {ESTADOS_FILTRO.map((estado) => (
        <NativeSelectOption key={estado} value={estado}>
          {ESTADOS_COTIZACION[estado].etiqueta}
        </NativeSelectOption>
      ))}
    </>
  )
}

function OpcionesCliente({ clientes }: { clientes: ClienteFiltro[] }) {
  return (
    <>
      <NativeSelectOption value="">Todos los clientes</NativeSelectOption>
      {clientes.map((cliente) => (
        <NativeSelectOption key={cliente.id} value={cliente.id}>
          {cliente.razon_social}
        </NativeSelectOption>
      ))}
    </>
  )
}

/** Desde y Hasta como date nativos (sin calendario: no suma dependencias). */
function CamposRango({ rango, alCambiar, alto }: { rango: Rango; alCambiar: (rango: Rango) => void; alto: string }) {
  const idDesde = useId()
  const idHasta = useId()
  return (
    <div className="grid grid-cols-2 gap-2">
      <div className="space-y-1">
        <Label htmlFor={idDesde} className={ETIQUETA}>
          Desde
        </Label>
        <Input
          id={idDesde}
          type="date"
          value={rango.desde}
          max={rango.hasta || undefined}
          onChange={(evento) => alCambiar({ ...rango, desde: evento.target.value })}
          className={alto}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor={idHasta} className={ETIQUETA}>
          Hasta
        </Label>
        <Input
          id={idHasta}
          type="date"
          value={rango.hasta}
          min={rango.desde || undefined}
          onChange={(evento) => alCambiar({ ...rango, hasta: evento.target.value })}
          className={alto}
        />
      </div>
    </div>
  )
}

/** Botón con el rango que abre un popover con Desde, Hasta y atajos. Sin rango por defecto (decisión 23). */
function SelectorFechas({
  desde,
  hasta,
  alAplicar,
  className,
}: {
  desde: string
  hasta: string
  alAplicar: (rango: Rango) => void
  className?: string
}) {
  const [abierto, setAbierto] = useState(false)
  const [rango, setRango] = useState<Rango>({ desde, hasta })
  const [atajos, setAtajos] = useState<AtajoFechas[]>([])
  const texto = textoRangoFechas(desde, hasta)

  function alAbrir(abrir: boolean) {
    if (abrir) {
      setRango({ desde, hasta })
      // Se calculan al abrir y no al dibujar: "hoy" no puede cambiar entre el servidor y el navegador.
      setAtajos(atajosFechas(hoyArgentina()))
    }
    setAbierto(abrir)
  }

  function aplicar(nuevo: Rango) {
    setAbierto(false)
    alAplicar(nuevo)
  }

  return (
    <Popover open={abierto} onOpenChange={alAbrir}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={`Fechas: ${texto}`}
          className={cn('h-9 w-full justify-between bg-background px-3 font-normal', className)}
        >
          <span className={cn('truncate tabular-nums', !desde && !hasta && 'text-muted-foreground')}>{texto}</span>
          <CalendarDays className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" aria-label="Rango de fechas" className="w-80 gap-3 p-3">
        <CamposRango rango={rango} alCambiar={setRango} alto="h-9" />
        <div className="flex flex-wrap gap-1.5">
          {atajos.map((atajo) => (
            <Button
              key={atajo.etiqueta}
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => aplicar({ desde: atajo.desde, hasta: atajo.hasta })}
            >
              {atajo.etiqueta}
            </Button>
          ))}
        </div>
        {rangoInvalido(rango) ? <AvisoRango /> : null}
        <div className="flex justify-end gap-2 border-t pt-3">
          <Button type="button" variant="ghost" size="sm" onClick={() => aplicar({ desde: '', hasta: '' })}>
            Limpiar
          </Button>
          <Button type="button" size="sm" disabled={rangoInvalido(rango)} onClick={() => aplicar(rango)}>
            Aplicar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** En pantallas angostas: un botón "Filtros" que abre una hoja desde abajo con estado, cliente y fechas. */
function FiltrosMovil({
  filtros,
  clientes,
  activos,
  alAplicar,
}: {
  filtros: FiltrosLista
  clientes: ClienteFiltro[]
  activos: number
  alAplicar: (cambios: FiltrosHoja) => void
}) {
  const idEstado = useId()
  const idCliente = useId()
  const [abierto, setAbierto] = useState(false)
  const [hoja, setHoja] = useState<FiltrosHoja>({
    estado: filtros.estado,
    cliente: filtros.cliente,
    desde: filtros.desde,
    hasta: filtros.hasta,
  })

  function alAbrir(abrir: boolean) {
    if (abrir) setHoja({ estado: filtros.estado, cliente: filtros.cliente, desde: filtros.desde, hasta: filtros.hasta })
    setAbierto(abrir)
  }

  function aplicar(cambios: FiltrosHoja) {
    setAbierto(false)
    alAplicar(cambios)
  }

  return (
    <Sheet open={abierto} onOpenChange={alAbrir}>
      <SheetTrigger asChild>
        <Button type="button" variant="outline" className="h-10 gap-1.5 px-3 text-[15px] @min-[40rem]:hidden">
          <SlidersHorizontal aria-hidden />
          Filtros
          {activos > 0 ? (
            <span className="grid h-5 min-w-5 place-items-center rounded-full bg-primary px-1 text-xs text-primary-foreground">
              {activos}
            </span>
          ) : null}
        </Button>
      </SheetTrigger>
      <SheetContent side="bottom" className="max-h-[85svh] overflow-y-auto rounded-t-xl">
        <SheetHeader>
          <SheetTitle>Filtros</SheetTitle>
          <SheetDescription>Estado, cliente y fechas de la cotización.</SheetDescription>
        </SheetHeader>
        <div className="space-y-3 px-4">
          <div className="space-y-1">
            <Label htmlFor={idEstado} className={ETIQUETA}>
              Estado
            </Label>
            <NativeSelect
              id={idEstado}
              value={hoja.estado}
              onChange={(evento) => setHoja({ ...hoja, estado: aEstado(evento.target.value) })}
              className="w-full [&>select]:h-10"
            >
              <OpcionesEstado />
            </NativeSelect>
          </div>
          <div className="space-y-1">
            <Label htmlFor={idCliente} className={ETIQUETA}>
              Cliente
            </Label>
            <NativeSelect
              id={idCliente}
              value={hoja.cliente}
              onChange={(evento) => setHoja({ ...hoja, cliente: evento.target.value })}
              className="w-full [&>select]:h-10"
            >
              <OpcionesCliente clientes={clientes} />
            </NativeSelect>
          </div>
          <CamposRango rango={hoja} alCambiar={(rango) => setHoja({ ...hoja, ...rango })} alto="h-10" />
          {rangoInvalido(hoja) ? <AvisoRango /> : null}
        </div>
        <SheetFooter className="flex-row border-t">
          <Button
            type="button"
            variant="outline"
            className="h-10 flex-1"
            onClick={() => aplicar({ estado: '', cliente: '', desde: '', hasta: '' })}
          >
            Limpiar
          </Button>
          <Button type="button" className="h-10 flex-1" disabled={rangoInvalido(hoja)} onClick={() => aplicar(hoja)}>
            Ver resultados
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}

/**
 * Buscador y filtros de la lista. Todo vive en la URL (hrefConFiltros): los selects y las fechas navegan solos y el
 * buscador con Enter. Mientras navega marca data-pendiente, que la tarjeta de resultados usa para atenuarse.
 */
export function FiltrosCotizaciones({ filtros, clientes }: { filtros: FiltrosLista; clientes: ClienteFiltro[] }) {
  const router = useRouter()
  const [pendiente, iniciarNavegacion] = useTransition()

  function aplicar(cambios: Partial<FiltrosLista>) {
    iniciarNavegacion(() => router.push(hrefConFiltros(filtros, cambios), { scroll: false }))
  }

  // Los filtros aplicados (menos el texto) como chips para quitarlos de a uno en el celular.
  const chips: { clave: string; texto: string; quitar: Partial<FiltrosLista> }[] = []
  if (filtros.estado) {
    chips.push({ clave: 'estado', texto: ESTADOS_COTIZACION[filtros.estado].etiqueta, quitar: { estado: '' } })
  }
  if (filtros.cliente) {
    const cliente = clientes.find((c) => c.id === filtros.cliente)
    chips.push({ clave: 'cliente', texto: cliente?.razon_social ?? 'Cliente', quitar: { cliente: '' } })
  }
  if (filtros.desde || filtros.hasta) {
    const texto = textoRangoFechas(filtros.desde, filtros.hasta)
    chips.push({ clave: 'fechas', texto, quitar: { desde: '', hasta: '' } })
  }

  return (
    <div data-pendiente={pendiente ? '' : undefined} className="@container space-y-2">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] gap-2 @min-[40rem]:grid-cols-3 @min-[48rem]:grid-cols-[minmax(0,1fr)_10rem_11.5rem_13.5rem]">
        <form
          role="search"
          className="relative @min-[40rem]:col-span-3 @min-[48rem]:col-span-1"
          onSubmit={(evento) => {
            evento.preventDefault()
            const q = new FormData(evento.currentTarget).get('q')
            aplicar({ q: typeof q === 'string' ? q.trim() : '' })
          }}
        >
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          {/* key: si la búsqueda cambia desde afuera ("Limpiar filtros"), el campo vuelve a leer la URL. */}
          <Input
            key={filtros.q}
            name="q"
            type="search"
            defaultValue={filtros.q}
            placeholder="Buscar por N°, cliente o asunto"
            aria-label="Buscar cotizaciones"
            className="h-10 bg-background pl-9 @min-[40rem]:h-9"
          />
          <button type="submit" className="sr-only">
            Buscar
          </button>
        </form>

        <FiltrosMovil filtros={filtros} clientes={clientes} activos={chips.length} alAplicar={aplicar} />

        <NativeSelect
          key={`estado-${filtros.estado}`}
          aria-label="Estado"
          defaultValue={filtros.estado}
          onChange={(evento) => aplicar({ estado: aEstado(evento.target.value) })}
          className="hidden w-full @min-[40rem]:block [&>select]:h-9 [&>select]:bg-background"
        >
          <OpcionesEstado />
        </NativeSelect>
        <NativeSelect
          key={`cliente-${filtros.cliente}`}
          aria-label="Cliente"
          defaultValue={filtros.cliente}
          onChange={(evento) => aplicar({ cliente: evento.target.value })}
          className="hidden w-full @min-[40rem]:block [&>select]:h-9 [&>select]:bg-background"
        >
          <OpcionesCliente clientes={clientes} />
        </NativeSelect>
        <SelectorFechas
          desde={filtros.desde}
          hasta={filtros.hasta}
          alAplicar={aplicar}
          className="hidden @min-[40rem]:flex"
        />
      </div>

      {chips.length > 0 ? (
        <div className="flex flex-wrap gap-1.5 @min-[40rem]:hidden">
          {chips.map((chip) => (
            <button
              key={chip.clave}
              type="button"
              aria-label={`Quitar filtro ${chip.texto}`}
              onClick={() => aplicar(chip.quitar)}
              className="inline-flex h-7 max-w-full items-center gap-1 rounded-md bg-accent px-2 text-[13px] text-primary"
            >
              <span className="truncate">{chip.texto}</span>
              <X className="size-3.5 shrink-0" aria-hidden />
            </button>
          ))}
        </div>
      ) : null}
    </div>
  )
}
```

- [ ] **Step 8: La página**

Reemplazar `src/app/(app)/cotizaciones/page.tsx` entero.
- La búsqueda usa `buscar_cotizaciones` con `count: 'exact'`, solo las columnas de la lista, el equipo embebido y `.range()`.
- En paralelo se cargan los clientes que tienen cotizaciones, para el filtro. El embebido vacío `cotizaciones!inner()` filtra sin traer filas. Está probado contra el PostgREST local y postgrest-js lo tipa como `{ id; razon_social }[]`.
- Una página fuera de rango redirige.
- El h1 "Cotizaciones" es el único heading que contiene esa palabra.
- Los vacíos usan la caja punteada de Clientes. En el vacío de "todavía no hay" no se repite el link "Nueva cotización": dos links con el mismo nombre romperían `getByRole('link', { name: 'Nueva cotización' })` en los E2E del editor.

`src/app/(app)/cotizaciones/page.tsx`:

```tsx
import { FileText, Plus } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarraMigas, Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { FiltrosCotizaciones } from '@/components/cotizaciones/lista/filtros-cotizaciones'
import { ListaCotizacionesMovil } from '@/components/cotizaciones/lista/lista-cotizaciones-movil'
import { Paginacion } from '@/components/cotizaciones/lista/paginacion'
import { TablaCotizaciones } from '@/components/cotizaciones/lista/tabla-cotizaciones'
import { Button } from '@/components/ui/button'
import { Conteo } from '@/components/ui/conteo'
import { hrefConFiltros, leerFiltros, POR_PAGINA } from '@/lib/cotizaciones/lista'
import { filaCotizacion, totalPaginas } from '@/lib/cotizaciones/lista-vista'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Cotizaciones' }

/**
 * Solo lo que muestra la lista: sin intro, bloques ni ítems (nunca montos, diseño §5). El equipo embebido completa
 * {{capacidad}} y {{equipo_descripcion}} del asunto para la columna Trabajo.
 */
const COLUMNAS =
  'id, numero, origen, fecha, cliente_razon_social, formato, estado, vencida, vence_el, asunto, datos, equipo:equipos(nombre, capacidad_tn, descripcion)'

function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-dashed px-6 py-12 text-center">
      <FileText className="size-6 text-muted-foreground" aria-hidden />
      {children}
    </div>
  )
}

export default async function CotizacionesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const filtros = leerFiltros(await searchParams)
  const inicio = (filtros.pagina - 1) * POR_PAGINA
  const supabase = await createClient()

  const [busqueda, conCotizaciones] = await Promise.all([
    supabase
      .rpc(
        'buscar_cotizaciones',
        {
          texto: filtros.q,
          estado: filtros.estado,
          cliente: filtros.cliente || undefined,
          desde: filtros.desde || undefined,
          hasta: filtros.hasta || undefined,
        },
        { count: 'exact' },
      )
      .select(COLUMNAS)
      .order('numero', { ascending: false })
      .range(inicio, inicio + POR_PAGINA - 1),
    // Para el filtro: los clientes que tienen alguna cotización (el embebido vacío con !inner solo filtra).
    supabase.from('clientes').select('id, razon_social, cotizaciones!inner()').order('razon_social'),
  ])
  // Una página más allá del total (URL vieja, cotizaciones borradas) responde 416: se vuelve a la primera.
  if (busqueda.error?.code === 'PGRST103') redirect(hrefConFiltros(filtros, { pagina: 1 }))
  if (busqueda.error) throw busqueda.error
  if (conCotizaciones.error) throw conCotizaciones.error

  const total = busqueda.count ?? 0
  const paginas = totalPaginas(total)
  // Justo al final (offset = total) PostgREST no da 416 sino una página vacía: se va a la última.
  if (total > 0 && filtros.pagina > paginas) redirect(hrefConFiltros(filtros, { pagina: paginas }))

  const filas = busqueda.data.map(filaCotizacion)
  const hayFiltros = Boolean(filtros.q || filtros.estado || filtros.cliente || filtros.desde || filtros.hasta)

  return (
    <>
      <BarraMigas migas={[{ texto: 'Cotizaciones' }]} />
      <Contenido>
        {/* El único heading con "Cotizaciones": tests/e2e/auth.spec.ts lo busca por substring. */}
        <EncabezadoPagina
          titulo="Cotizaciones"
          extra={<Conteo>{total}</Conteo>}
          acciones={
            <Button asChild size="lg" className="h-10 px-3.5 text-[15px] shadow-md shadow-primary/20">
              <Link href="/cotizaciones/nueva">
                <Plus aria-hidden />
                Nueva cotización
              </Link>
            </Button>
          }
        />

        {total === 0 && !hayFiltros ? (
          <Vacio>
            <p className="text-muted-foreground">Todavía no hay cotizaciones.</p>
            <p className="text-sm text-muted-foreground">Creá la primera con “Nueva cotización”.</p>
          </Vacio>
        ) : (
          // group/lista: mientras los filtros navegan (data-pendiente) la tarjeta se atenúa.
          <div className="group/lista space-y-6">
            <FiltrosCotizaciones filtros={filtros} clientes={conCotizaciones.data} />
            {total === 0 ? (
              <Vacio>
                <p className="text-muted-foreground">
                  {filtros.q
                    ? `No hay cotizaciones que coincidan con "${filtros.q}".`
                    : 'No hay cotizaciones con estos filtros.'}
                </p>
                <Button asChild variant="link">
                  <Link href="/cotizaciones">Limpiar filtros</Link>
                </Button>
              </Vacio>
            ) : (
              <div className="@container overflow-hidden rounded-xl border bg-card shadow-tarjeta transition-opacity group-has-[[data-pendiente]]/lista:opacity-60">
                <div className="hidden @min-[40rem]:block">
                  <TablaCotizaciones filas={filas} />
                </div>
                <div className="@min-[40rem]:hidden">
                  <ListaCotizacionesMovil filas={filas} />
                </div>
                <Paginacion filtros={filtros} total={total} />
              </div>
            )}
          </div>
        )}
      </Contenido>
    </>
  )
}
```

```bash
npm run lint && npm run typecheck
```

Expected: sin errores.

- [ ] **Step 9: E2E en verde**

```bash
npx playwright test tests/e2e/cotizaciones.spec.ts tests/e2e/auth.spec.ts
```

Expected: PASS, 7 tests de `cotizaciones.spec.ts` y 3 de `auth.spec.ts`.

Si la lista falla con `PGRST200` ("Could not find a relationship between … and 'equipos'"), PostgREST no está embebiendo sobre el resultado de la función. Se reemplaza el embebido por una segunda consulta por ids:
- En `COLUMNAS`, cambiar `equipo:equipos(nombre, capacidad_tn, descripcion)` por `equipo_id`.
- Reemplazar `const filas = busqueda.data.map(filaCotizacion)` por el bloque de abajo. Esta variante también compila y pasa lint.

```tsx
  const idsEquipos = [...new Set(busqueda.data.flatMap((fila) => (fila.equipo_id ? [fila.equipo_id] : [])))]
  const equipos = new Map<string, { nombre: string; capacidad_tn: number | null; descripcion: string }>()
  if (idsEquipos.length > 0) {
    const { data, error } = await supabase
      .from('equipos')
      .select('id, nombre, capacidad_tn, descripcion')
      .in('id', idsEquipos)
    if (error) throw error
    for (const { id, ...equipo } of data) equipos.set(id, equipo)
  }
  const filas = busqueda.data.map((fila) =>
    filaCotizacion({ ...fila, equipo: (fila.equipo_id && equipos.get(fila.equipo_id)) || null }),
  )
```

Si falla "parámetros inválidos…" con un error de la base (22P02 o 22007), el problema está en `leerFiltros` (Task 2). Ver "Qué supone del contrato", arriba.

- [ ] **Step 10: Verificación visual contra la 02**

Este script carga 30 cotizaciones de muestra con la marca `captura-3b`:
- tres veces las diez filas de la referencia, con sus clientes;
- los clientes que no existen se crean con la misma marca.

Después captura a 1200×805 (la ventana y la página completa), con el popover de fechas abierto, a 1024 y a 390, y al final borra todo lo que cargó. Guardalo en tu scratchpad, no en el repo:

```js
// <scratchpad>/captura-lista.cjs — capturas de /cotizaciones para comparar con docs/diseno/referencias/02-cotizaciones.png
// Uso: node <scratchpad>/captura-lista.cjs <scratchpad>   (con `npm run dev` corriendo y Supabase local)
// Carga 30 cotizaciones de muestra (marca "captura-3b" en las notas), captura y las borra al terminar.
const REPO = '/Users/guidoolguin/Desktop/equipos-patagonicos'
const { chromium } = require(`${REPO}/node_modules/@playwright/test`)
const { Client } = require(`${REPO}/node_modules/pg`)

process.loadEnvFile(`${REPO}/.env.local`)
const salida = process.argv[2]
if (!salida) throw new Error('Falta la carpeta de salida')

const MARCA = 'captura-3b'
const HOY = "(now() at time zone 'America/Argentina/Buenos_Aires')::date"
const CLIENTES = [
  'VERTICE SERVICIOS INTEGRALES S.R.L.',
  'Milicic S.A.',
  'Hidrovía Neuquina S.A.',
  'Tenaris Siderca',
  'Pecom Servicios Energía S.A.',
]
// [cliente, formato, estado, días atrás, asunto]; se insertan de abajo hacia arriba para que la primera quede arriba.
const MUESTRA = [
  [0, 'mensual', 'borrador', 1, 'Alquiler de grúa 70 tn - Loma Campana'],
  [1, 'jornada', 'enviada', 2, 'Movimiento de suelo y montaje - Parque Industrial'],
  [2, 'jornada', 'aprobada', 10, 'Servicio de izaje para compuertas - Embalse'],
  [3, 'mensual', 'vencida', 40, 'Carga y descarga de tuberías - Base Neuquén'],
  [4, 'jornada', 'rechazada', 8, 'Montaje de transformador - Subestación Este'],
  [0, 'jornada', 'aprobada', 7, 'Izaje de estructura metálica - Galpón Parque'],
  [1, 'mensual', 'enviada', 5, 'Provisión de grúa para obra civil - Añelo'],
  [2, 'jornada', 'vencida', 45, 'Desmontaje de pasarela peatonal'],
  [4, 'mensual', 'aprobada', 3, 'Alquiler de grúa de 120 toneladas'],
  [3, 'jornada', 'borrador', 1, 'Maniobras de izaje en almacén de caños'],
]

async function conBase(fn) {
  const db = new Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

async function limpiar(db) {
  await db.query('delete from public.cotizaciones where notas = $1', [MARCA])
  await db.query('delete from public.clientes where notas = $1', [MARCA])
}

async function cargar(db) {
  await limpiar(db)
  const ids = []
  for (const razonSocial of CLIENTES) {
    await db.query(
      `insert into public.clientes (razon_social, notas)
       select $1, $2 where not exists (select 1 from public.clientes where razon_social = $1)`,
      [razonSocial, MARCA],
    )
    const { rows } = await db.query('select id from public.clientes where razon_social = $1', [razonSocial])
    ids.push(rows[0].id)
  }
  const filas = [...MUESTRA, ...MUESTRA, ...MUESTRA].reverse()
  for (const [cliente, formato, estado, dias, asunto] of filas) {
    const guardado = estado === 'vencida' ? 'enviada' : estado
    const aprobada = estado === 'aprobada'
    await db.query(
      `insert into public.cotizaciones
         (cliente_id, formato, asunto, notas, fecha, validez_dias, estado, fecha_aprobacion, presupuesto_estado)
       values ($1, $2, $3, $4, ${HOY} - $5::int, 30, $6, case when $7 then ${HOY} - $5::int end,
               case when $7 then 'en_curso' end)`,
      [ids[cliente], formato, asunto, MARCA, dias, guardado, aprobada],
    )
  }
}

async function capturar() {
  const navegador = await chromium.launch()
  try {
    const contexto = await navegador.newContext({
      viewport: { width: 1200, height: 805 },
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
    })
    const page = await contexto.newPage()
    await page.goto('http://localhost:3000/login')
    await page.getByLabel('Email').fill('e2e@equipos.test')
    await page.getByLabel('Contraseña').fill('E2e-1234-segura')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.getByRole('heading', { name: 'Inicio' }).waitFor()

    await page.goto('http://localhost:3000/cotizaciones')
    await page.getByRole('heading', { name: 'Cotizaciones', level: 1 }).waitFor()
    await page.screenshot({ path: `${salida}/02-app-1200.png` })
    await page.screenshot({ path: `${salida}/02-app-1200-completa.png`, fullPage: true })

    await page.getByRole('button', { name: /^Fechas:/ }).click()
    await page.getByRole('dialog', { name: 'Rango de fechas' }).waitFor()
    await page.screenshot({ path: `${salida}/02-app-1200-fechas.png` })
    await page.keyboard.press('Escape')

    await page.setViewportSize({ width: 1024, height: 805 })
    await page.screenshot({ path: `${salida}/02-app-1024.png` })

    await page.setViewportSize({ width: 390, height: 844 })
    await page.screenshot({ path: `${salida}/02-app-390.png`, fullPage: true })
    const ancho = await page.evaluate(() => document.documentElement.scrollWidth)
    console.log(`Ancho del documento a 390: ${ancho} px ${ancho > 390 ? '(¡hay scroll horizontal!)' : '(ok)'}`)
  } finally {
    await navegador.close()
  }
}

conBase(cargar)
  .then(capturar)
  .finally(() => conBase(limpiar))
  .then(() => console.log(`Capturas en ${salida}`))
  .catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
```

```bash
npm run dev   # en segundo plano; esperar a que http://localhost:3000/api/health responda
node <scratchpad>/captura-lista.cjs <scratchpad>
magick docs/diseno/referencias/02-cotizaciones.png -resize 1200x <scratchpad>/ref-02.png
lsof -ti tcp:3000 | xargs kill   # solo el dev server que levantaste
```

Mirá `ref-02.png` al lado de `02-app-1200.png`, y después las demás capturas.

**Lo que tiene que coincidir:**
1. **Encabezado:** "Cotizaciones" en 35 px de peso normal con el chip del total al lado. "Nueva cotización" en primario, alineado con el título a la derecha.
2. **Filtros:** una fila de 36 px, unos 24 px debajo del título. Anchos a 1200: buscador ≈ 304, Estado 160, Cliente 184 y Fechas 216 (en la referencia, 310, 159, 186 y 215).
3. **Tarjeta:** borde fino, radio de 12 px y sombra suave. Encabezado gris claro de unos 44 px con N°, Fecha, Cliente, Trabajo, Formato, Estado y Vence el.
4. **Filas:** de unos 48 a 56 px. Cliente y Trabajo en hasta dos líneas. N° en peso medio. Los íconos de acción alineados a la derecha.
   - Si las filas quedan bastante más altas que en la referencia, sumá `leading-snug` a los `span` de Cliente y Trabajo.
   - Si Trabajo queda muy angosto, ajustá los `min-w` de esas dos celdas.
5. **Pie** (en `02-app-1200-completa.png`): "Mostrando 1–25 de N" (30, más las que ya hubiera) a la izquierda y "‹ Anterior 1 2 Siguiente ›" a la derecha, con la página actual teñida.
6. **A 1024** se esconden Fecha y Formato y no hay scroll horizontal. **A 390** se ve la lista en tarjetas, el buscador con "Filtros", y el script informa `(ok)` para el ancho del documento.

**Diferencias buscadas** (no corregir):
- Sin columna Importe (decisión 1).
- "Trabajo" en vez de "Asunto" (decisión 4).
- Pastillas `rounded-md` con texto teñido, en lugar de las redondas con texto negro.
- "Vence el" solo en enviadas, en ámbar si venció, y "—" en el resto (decisión 2).
- Íconos de fila `ghost`, sin recuadro gris.
- Fondo blanco (decisión 21).
- Sin "Cargar existente" ni "Presupuesto directo" (llegan en el 3C).
- Sin rango de fechas por defecto (decisión 23).
- Sin el tilde junto al ítem activo del sidebar.

Ajustá solo los componentes de esta tarea hasta que layout, jerarquía, espaciado y colores coincidan, y dejá las capturas en el scratchpad. No cambies `Contenido` ni `EncabezadoPagina`, que son la medida de todas las listas. Si cambiás algo, volvé a correr el E2E del Step 9.

- [ ] **Step 11: Verificación y commit**

```bash
npm run check
npm run test:e2e
```

Expected: lint, typecheck y unitarios en verde, y todos los E2E en verde (`auth`, `clientes`, `configuracion`, `cotizacion-pdf` y `cotizaciones`).

```bash
git add src/lib/cotizaciones/lista-vista.ts src/lib/cotizaciones/lista-vista.test.ts src/components/cotizaciones/lista \
  "src/app/(app)/cotizaciones/page.tsx" tests/e2e/cotizaciones.spec.ts
git commit -m "feat: lista de cotizaciones con búsqueda, filtros y paginación

- buscar_cotizaciones con conteo y páginas de 25; el equipo embebido resuelve la columna Trabajo
- filtros por estado (Vencida aparte), cliente y rango de fechas en la URL; hoja de filtros en el celular
- acciones de fila: PDF (salvo directas), duplicar y abrir; sin montos en la lista
- E2E: búsqueda sin acentos, Vencida, paginación, sin montos, fechas, duplicar y celular

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 8: Editor — estructura, encabezado, Cliente, Datos y Asunto; guardar

Las páginas `/cotizaciones/nueva` y `/cotizaciones/[id]` y el esqueleto del editor: el estado vive en `useReducer(reducirEditor)` (Task 3), se compara contra lo último guardado para saber si hay cambios, se guarda con la acción `guardarCotizacion` (Task 5) y, al crear, se navega a `/cotizaciones/{id}` con `router.replace`. Esta tarea arma el encabezado compacto, las tarjetas Cliente (combobox con alta rápida y Atte.), Datos de esta cotización (formato/plantilla, equipo, variables con la marca amarilla, próxima actualización, fecha, validez y firma) y Asunto e introducción, la barra fija de abajo (< 72rem) y deja los huecos que llenan las tareas 9 (ítems), 10 (textos), 11 (vista previa) y 12 (acciones de estado y franjas). Las cotizaciones cargadas y directas muestran una vista de solo lectura mínima (decisión 24).

**Files:**
- Create: `src/lib/cotizaciones/editor-pantalla.ts`, `src/lib/cotizaciones/editor-pantalla.test.ts`
- Create: `src/lib/cotizaciones/lecturas-editor.ts`, `tests/integration/cotizaciones-lecturas.test.ts`
- Create: `src/components/formulario/confirmacion-en-lugar.tsx`
- Create: `src/components/cotizaciones/editor/selector-cliente.tsx`, `src/components/cotizaciones/editor/tarjeta-cliente.tsx`, `src/components/cotizaciones/editor/tarjeta-datos.tsx`, `src/components/cotizaciones/editor/tarjeta-asunto.tsx`, `src/components/cotizaciones/editor/encabezado-editor.tsx`, `src/components/cotizaciones/editor/barra-inferior.tsx`, `src/components/cotizaciones/editor/editor-cotizacion.tsx`
- Create: `src/components/cotizaciones/cotizacion-solo-lectura.tsx`
- Create: `src/app/(app)/cotizaciones/nueva/page.tsx`, `src/app/(app)/cotizaciones/[id]/page.tsx`
- Modify: `tests/e2e/cotizaciones.spec.ts` (lo crea la Task 7; acá se agrega un `describe`)
- Test: `src/lib/cotizaciones/editor-pantalla.test.ts`, `tests/integration/cotizaciones-lecturas.test.ts`, `tests/e2e/cotizaciones.spec.ts`

**Usa de tareas anteriores (no se redefine nada de esto):**
- Task 2: `esquemaBloque` con `oculto`, `mesEnLetras` (`src/lib/format/fechas.ts`), `Resultado` (`src/lib/resultado.ts`).
- Task 3 (`src/lib/cotizaciones/editor.ts`): `EstadoEditor`, `PlantillaEditor`, `CatalogosEditor`, `AccionEditor`, `Pendientes`, `SELECT_EDITOR` y `FilaEditor`, `estadoNuevo` (fecha = hoy; sin plantilla, mensual), `estadoDesdeFila` (ordena los ítems), `aplicarPlantilla` (conserva cliente, datos, equipo, firmante y fecha), `reducirEditor`, `hayCambios` (funciona también sin cliente), `payloadGuardar` (claves de error = las de `EstadoEditor`: `cliente`, `formato`, `datos.<campo>`, `items.N.campo`, `bloques.N.campo`…), `pendientesEditor` (no rompe con una fecha a medio escribir).
- Task 5 (`src/app/(app)/cotizaciones/actions.ts`): `guardarCotizacion`, `buscarClientes`, `crearClienteRapido`, `contactosDeCliente`.
- Task 6: componentes `popover`, `command`, `toggle-group` de shadcn; `ConVariables` (`src/components/plantillas/texto-formateado.tsx`); `Tarjeta` con `icono`/`descripcion` opcionales y `acciones`; `EncabezadoPagina` con `compacto`; `EstadoCotizacion({ estado, vencida })`.

**Contrato que esta tarea deja para las tareas 9 a 12** (no cambiarlo sin ajustar esas tareas):
- `EditorCotizacion({ inicial, catalogos, contactos, hoy })`. Adentro: `estado`/`despachar` (reducer), `guardado` (última versión guardada), `cambios = hayCambios(guardado, estado)`, `pendientes = pendientesEditor(estado, catalogos)`, `editable`, `accion`/`setAccion` (qué acción corre: `'guardar'` acá; la Task 12 suma las suyas), `ocupado = accion !== null`, `errores`, `mostrarErrores(mensaje, errores)` y `guardar({ navegar = true } = {}): Promise<{ id; version; numero } | null>` (devuelve la versión nueva o la actual si no hay cambios; `null` si no se pudo). Al crear navega a `/cotizaciones/{id}`; con `navegar: false` no navega: lo usan "Descargar y marcar enviada" y "Aprobar" de la Task 12, que en una nueva guardan, hacen la transición y recién ahí navegan (decisión 12).
- Huecos marcados con comentarios en `editor-cotizacion.tsx`: `{/* Ítems (Task 9) */}`, `{/* Textos (Task 10) */}`, el marco vacío del `<aside>` (Task 11: `PanelVistaPrevia`) y `{/* Task 12: FranjasEditor */}`; la prop `acciones` de `EncabezadoEditor` (botones de transición y ⋯, a la derecha de Guardar) y la prop `vistaPrevia` de `BarraInferior`. La barra no lleva transiciones: en el celular quedan en el encabezado (el primario y el ⋯), una diferencia buscada con relev-visual §3.11 (ver la decisión 16).
- `ID_CAMPO`, `idCampoDato` e `idCampoVariable` (`editor-pantalla.ts`): ids de los campos para llevar el foco desde la franja de pendientes. Los ítems usan `item-{clave}-descripcion|cantidad|precio|unidad` (Task 9).
- `ConfirmacionEnLugar` (`src/components/formulario/confirmacion-en-lugar.tsx`): la confirmación sin modal que reusan las tareas 10 y 12.

---

- [ ] **Step 1: Lógica pura de la pantalla — tests que fallan**

```ts
// src/lib/cotizaciones/editor-pantalla.test.ts
import { describe, expect, it } from 'vitest'
import { estadoNuevo, reducirEditor, type EstadoEditor, type PlantillaEditor } from './editor'
import {
  cambiosDeContenido,
  camposDatosVisibles,
  contactoInicial,
  erroresSinCampo,
  esFechaIso,
  firmantePorDefecto,
  idCampoVariable,
  mismoNombre,
  resumenEncabezado,
  textoProximaActualizacion,
} from './editor-pantalla'

const PLANTILLA: PlantillaEditor = {
  id: '6f1c1d2e-0000-4000-8000-000000000001',
  nombre: 'Por jornada - Grúa con operador',
  formato: 'jornada',
  asunto: 'Cotización N° {{numero}} grúa de {{capacidad}} TN',
  intro: 'Servicios de izaje en {{ubicacion}}.',
  validez_dias: 30,
  bloques: [
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.', oculto: false },
    { titulo: 'Renegociación', contenido: 'Con base en {{indice_base}}.', oculto: false },
  ],
  items: [{ seccion: 'Precios Jornada', descripcion: 'Jornada de grúa', unidad: 'JORNADA', cantidad: 1 }],
}

const CLIENTE = {
  id: '6f1c1d2e-0000-4000-8000-000000000002',
  razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.',
  cuit: '30719529670',
}

/** Una cotización nueva con la plantilla aplicada y un cliente elegido. */
function nueva(): EstadoEditor {
  const estado = estadoNuevo({ plantilla: PLANTILLA, firmanteId: '', hoy: '2026-10-25' })
  return reducirEditor(estado, { tipo: 'cliente', cliente: CLIENTE, contactoId: '' })
}

const FIRMANTES = [
  { id: 'a', nombre: 'Thomas Cravero', cargo: '', telefono: '', activo: true },
  { id: 'b', nombre: 'Julio Rojas', cargo: '', telefono: '', activo: true },
  { id: 'c', nombre: 'Ana Inactiva', cargo: '', telefono: '', activo: false },
]

describe('firmantePorDefecto', () => {
  it('es el de la última cotización si sigue activo', () => {
    expect(firmantePorDefecto(FIRMANTES, 'a')).toBe('a')
  })

  it('si no, el primero activo por nombre; sin firmantes activos, ninguno', () => {
    expect(firmantePorDefecto(FIRMANTES, 'c')).toBe('b')
    expect(firmantePorDefecto(FIRMANTES, null)).toBe('b')
    expect(firmantePorDefecto([], null)).toBe('')
  })
})

describe('contactoInicial', () => {
  const contactos = [
    { id: 'x', nombre: 'Yanina Colman', email: '' },
    { id: 'y', nombre: 'Carlos Díaz', email: '' },
  ]

  it('el último usado si sigue siendo del cliente; si no, el primero por nombre', () => {
    expect(contactoInicial(contactos, 'x')).toBe('x')
    expect(contactoInicial(contactos, 'otro')).toBe('y')
    expect(contactoInicial(contactos, null)).toBe('y')
  })

  it('sin contactos queda "Sin Atte."', () => {
    expect(contactoInicial([], null)).toBe('')
  })
})

describe('camposDatosVisibles', () => {
  it('muestra los campos que usa el texto visible, en el orden de CAMPOS_DATOS', () => {
    expect(camposDatosVisibles(nueva())).toEqual(['ubicacion', 'horario', 'indice_base'])
  })

  it('un bloque oculto no cuenta', () => {
    const estado = nueva()
    const oculto = reducirEditor(estado, { tipo: 'bloque', clave: estado.bloques[1].clave, cambios: { oculto: true } })
    expect(camposDatosVisibles(oculto)).toEqual(['ubicacion', 'horario'])
  })

  it('un campo con valor se sigue mostrando aunque el texto no lo use', () => {
    const conValor = reducirEditor(nueva(), { tipo: 'dato', campo: 'forma_pago', valor: '30 días F.F.' })
    expect(camposDatosVisibles(conValor)).toEqual(['ubicacion', 'horario', 'forma_pago', 'indice_base'])
  })
})

describe('idCampoVariable', () => {
  it('lleva cada variable al campo donde se completa', () => {
    expect(idCampoVariable('ubicacion')).toBe('cotizacion-dato-ubicacion')
    expect(idCampoVariable('capacidad')).toBe('cotizacion-equipo')
    expect(idCampoVariable('equipo_descripcion')).toBe('cotizacion-equipo')
    expect(idCampoVariable('validez_dias')).toBe('cotizacion-validez')
    expect(idCampoVariable('proxima_actualizacion')).toBe('cotizacion-proxima-actualizacion')
    expect(idCampoVariable('numero')).toBeNull()
  })
})

describe('textoProximaActualizacion', () => {
  it('el mes elegido, el texto que ya tenía o el de la empresa', () => {
    expect(textoProximaActualizacion('2026-11', 'marzo de 2027', 'junio de 2027')).toBe('noviembre de 2026')
    expect(textoProximaActualizacion('', 'marzo de 2027', 'junio de 2027')).toBe('marzo de 2027')
    expect(textoProximaActualizacion('', '', 'junio de 2027')).toBe('junio de 2027')
  })
})

describe('esFechaIso', () => {
  it('solo fechas que existen', () => {
    expect(esFechaIso('2026-10-25')).toBe(true)
    expect(esFechaIso('2026-02-30')).toBe(false)
    expect(esFechaIso('')).toBe(false)
  })
})

describe('resumenEncabezado', () => {
  it('una nueva todavía no tiene número', () => {
    expect(resumenEncabezado(nueva(), '2026-10-25')).toEqual({
      titulo: 'Nueva cotización',
      detalle: 'Por jornada · 25/10/2026',
      vence: null,
    })
  })

  it('"Vence el" solo en enviadas; el día del vencimiento todavía no está vencida', () => {
    const enviada = { ...nueva(), numero: 112712, estado: 'enviada' as const, fecha: '2026-10-01', validezDias: '30' }
    expect(resumenEncabezado(enviada, '2026-10-31').vence).toEqual({ texto: 'Vence el 31/10/2026', vencida: false })
    expect(resumenEncabezado(enviada, '2026-11-01').vence).toEqual({ texto: 'Venció el 31/10/2026', vencida: true })
    expect(resumenEncabezado({ ...enviada, estado: 'borrador' }, '2026-11-01')).toMatchObject({
      titulo: 'Cotización N° 112712',
      vence: null,
    })
  })

  it('una fecha o una validez inválidas no rompen el encabezado', () => {
    const rota = { ...nueva(), estado: 'enviada' as const, fecha: '', validezDias: 'abc' }
    expect(resumenEncabezado(rota, '2026-10-25')).toEqual({ titulo: 'Nueva cotización', detalle: 'Por jornada', vence: null })
  })
})

describe('cambiosDeContenido', () => {
  it('recién aplicada la plantilla no hay nada que pisar', () => {
    expect(cambiosDeContenido(nueva(), PLANTILLA)).toBe(false)
  })

  it('los datos y el cliente no cuentan: la plantilla no los toca', () => {
    expect(cambiosDeContenido(reducirEditor(nueva(), { tipo: 'dato', campo: 'ubicacion', valor: 'Añelo' }), PLANTILLA)).toBe(
      false,
    )
  })

  it('el asunto o un precio escritos a mano sí', () => {
    const estado = nueva()
    expect(cambiosDeContenido(reducirEditor(estado, { tipo: 'campo', campo: 'asunto', valor: 'Otro' }), PLANTILLA)).toBe(true)
    const conPrecio = reducirEditor(estado, { tipo: 'item', clave: estado.items[0].clave, cambios: { precio: '1.950.000' } })
    expect(cambiosDeContenido(conPrecio, PLANTILLA)).toBe(true)
  })

  it('sin plantilla actual, hay cambios si hay algo escrito', () => {
    const vacia = { ...nueva(), asunto: '', intro: '', items: [], bloques: [] }
    expect(cambiosDeContenido(vacia, null)).toBe(false)
    expect(cambiosDeContenido({ ...vacia, intro: 'Hola' }, null)).toBe(true)
  })
})

describe('erroresSinCampo', () => {
  it('devuelve solo los mensajes que no tienen un campo donde mostrarse', () => {
    expect(
      erroresSinCampo({
        cliente: 'Elegí el cliente',
        'items.0.precio': 'Precio inválido',
        'datos.ubicacion': 'Máximo 500 caracteres',
        'bloques.1.contenido': 'Muy largo',
        notas: 'Algo raro',
      }),
    ).toEqual(['Algo raro'])
  })
})

describe('mismoNombre', () => {
  it('ignora tildes, mayúsculas y espacios de más', () => {
    expect(mismoNombre('Grúas  Ñandú S.A.', 'gruas nandu s.a. ')).toBe(true)
    expect(mismoNombre('Grúas Ñandú S.A.', 'Grúas Ñandú S.R.L.')).toBe(false)
  })
})
```

```bash
npx vitest run src/lib/cotizaciones/editor-pantalla.test.ts
```

Expected: FAIL (`Failed to resolve import "./editor-pantalla"`).

- [ ] **Step 2: Implementar `editor-pantalla.ts`**

```ts
// src/lib/cotizaciones/editor-pantalla.ts
// Reglas de la pantalla del editor que no son parte del estado (eso vive en editor.ts): valores por defecto, qué
// campos de "Datos de esta cotización" se muestran, ids de los campos y el resumen del encabezado.
// Puro: lo usan las páginas, los componentes y Vitest.
import { formatFechaCorta, mesEnLetras, sumarDias } from '@/lib/format/fechas'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { variablesUsadas, type NombreVariable } from '@/lib/plantillas/variables'
import { CAMPOS_DATOS, type CampoDatos } from './datos'
import {
  aplicarPlantilla,
  hayCambios,
  type AccionEditor,
  type CatalogosEditor,
  type EstadoEditor,
  type PlantillaEditor,
} from './editor'

/** Un contacto del cliente, para el "Atte.". */
export type ContactoEditor = { id: string; nombre: string; email: string }

/** El dispatch del reducer del editor, tal como lo reciben las tarjetas. */
export type Despachar = (accion: AccionEditor) => void

/**
 * Ids de los campos del editor (únicos en la página). Los usan las etiquetas, el foco del primer error y la franja
 * de pendientes (Task 12) para llevar el foco al campo.
 */
export const ID_CAMPO = {
  cliente: 'cotizacion-cliente',
  contacto: 'cotizacion-contacto',
  plantilla: 'cotizacion-plantilla',
  equipo: 'cotizacion-equipo',
  firmante: 'cotizacion-firmante',
  fecha: 'cotizacion-fecha',
  validez: 'cotizacion-validez',
  proximaActualizacion: 'cotizacion-proxima-actualizacion',
  asunto: 'cotizacion-asunto',
  intro: 'cotizacion-intro',
} as const

export function idCampoDato(campo: CampoDatos): string {
  return `cotizacion-dato-${campo}`
}

/** Dónde se completa cada variable (para llevar el foco desde la franja de pendientes); null si no se carga acá. */
export function idCampoVariable(nombre: NombreVariable): string | null {
  switch (nombre) {
    case 'numero':
      return null
    case 'capacidad':
    case 'equipo_descripcion':
      return ID_CAMPO.equipo
    case 'validez_dias':
      return ID_CAMPO.validez
    case 'proxima_actualizacion':
      return ID_CAMPO.proximaActualizacion
    default:
      return idCampoDato(nombre)
  }
}

const porNombre = (a: { nombre: string }, b: { nombre: string }) => a.nombre.localeCompare(b.nombre, 'es')

/** Firmante de una cotización nueva (decisión 9): el de la última creada si sigue activo; si no, el primero activo. */
export function firmantePorDefecto(firmantes: CatalogosEditor['firmantes'], ultimoId: string | null): string {
  const activos = firmantes.filter((firmante) => firmante.activo)
  if (ultimoId && activos.some((firmante) => firmante.id === ultimoId)) return ultimoId
  return [...activos].sort(porNombre)[0]?.id ?? ''
}

/** "Atte." al elegir un cliente (decisión 19): el último usado si sigue siendo suyo; si no, el primero por nombre. */
export function contactoInicial(contactos: ContactoEditor[], ultimoId: string | null): string {
  if (ultimoId && contactos.some((contacto) => contacto.id === ultimoId)) return ultimoId
  return [...contactos].sort(porNombre)[0]?.id ?? ''
}

type Textos = Pick<EstadoEditor, 'asunto' | 'intro' | 'items' | 'bloques'>

/** Variables que usan los textos que salen en el PDF: asunto, introducción, ítems y bloques visibles. */
export function variablesDelTexto(estado: Textos): Set<string> {
  const textos = [
    estado.asunto,
    estado.intro,
    ...estado.items.map((item) => item.descripcion),
    ...estado.bloques.filter((bloque) => !bloque.oculto).flatMap((bloque) => [bloque.titulo, bloque.contenido]),
  ]
  return new Set(textos.flatMap((texto) => variablesUsadas(texto)))
}

/**
 * Campos de datos que se muestran: los que usa el texto y los que ya tienen valor (para poder verlos y borrarlos).
 * La próxima actualización tiene su propio control (mes, decisión 7) y no sale de acá.
 */
export function camposDatosVisibles(estado: Textos & Pick<EstadoEditor, 'datos'>): CampoDatos[] {
  const usadas = variablesDelTexto(estado)
  return CAMPOS_DATOS.filter(
    (campo) => campo !== 'proxima_actualizacion' && (usadas.has(campo) || estado.datos[campo].trim() !== ''),
  )
}

/** Lo que imprime el PDF como próxima actualización (decisión 7): el mes elegido, el texto que tenía o el de la empresa. */
export function textoProximaActualizacion(mes: string, textoGuardado: string, textoEmpresa: string): string {
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(mes)) return mesEnLetras(mes)
  return textoGuardado.trim() || textoEmpresa.trim()
}

/** 'YYYY-MM-DD' de una fecha que existe (formatFechaCorta tira con fechas imposibles como el 30/02). */
export function esFechaIso(valor: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false
  try {
    formatFechaCorta(valor)
    return true
  } catch {
    return false
  }
}

export type ResumenEncabezado = {
  titulo: string
  detalle: string
  vence: { texto: string; vencida: boolean } | null
}

/**
 * Título y bajada del encabezado: "Cotización N° 112712", "Por jornada · 25/10/2026" y, solo en enviadas
 * (decisión 2), "Vence el …" o "Venció el …". Se calcula con lo que muestra la pantalla, no con lo guardado.
 */
export function resumenEncabezado(
  estado: Pick<EstadoEditor, 'numero' | 'formato' | 'fecha' | 'validezDias' | 'estado'>,
  hoy: string,
): ResumenEncabezado {
  const titulo = estado.numero === null ? 'Nueva cotización' : `Cotización N° ${estado.numero}`
  const fechaValida = esFechaIso(estado.fecha)
  const detalle = [FORMATOS[estado.formato], fechaValida ? formatFechaCorta(estado.fecha) : null]
    .filter(Boolean)
    .join(' · ')
  const dias = Number(estado.validezDias)
  if (estado.estado !== 'enviada' || !fechaValida || !Number.isInteger(dias) || dias < 1 || dias > 365) {
    return { titulo, detalle, vence: null }
  }
  const venceEl = sumarDias(estado.fecha, dias)
  // Como v_cotizaciones: el mismo día del vencimiento todavía no cuenta como vencida.
  const vencida = venceEl < hoy
  return { titulo, detalle, vence: { texto: `${vencida ? 'Venció' : 'Vence'} el ${formatFechaCorta(venceEl)}`, vencida } }
}

export function plantillasDeFormato(plantillas: PlantillaEditor[], formato: Formato): PlantillaEditor[] {
  return plantillas.filter((plantilla) => plantilla.formato === formato)
}

/**
 * Si cambiar de plantilla pisaría algo hecho a mano (decisión 10): el contenido difiere del que deja la plantilla
 * actual (asunto, introducción, textos, ítems o validez). Sin plantilla actual, si hay algo escrito.
 */
export function cambiosDeContenido(estado: EstadoEditor, actual: PlantillaEditor | null): boolean {
  if (actual) return hayCambios(aplicarPlantilla(estado, actual), estado)
  return estado.asunto.trim() !== '' || estado.intro.trim() !== '' || estado.items.length > 0 || estado.bloques.length > 0
}

/** Claves de error (payloadGuardar) que se muestran junto a un campo del editor. */
const CON_CAMPO = [
  /^(cliente|contactoId|plantillaId|formato|equipoId|firmanteId|fecha|validezDias|proximaActualizacion|asunto|intro)$/,
  /^datos\.[a-z_]+$/,
  /^items\.\d+\.(seccion|descripcion|cantidad|precio|unidad)$/,
  /^bloques\.\d+\.(titulo|contenido)$/,
]

/** Mensajes de error que no tienen un campo donde mostrarse: van en el aviso de arriba. */
export function erroresSinCampo(errores: Record<string, string>): string[] {
  return Object.entries(errores)
    .filter(([clave]) => !CON_CAMPO.some((patron) => patron.test(clave)))
    .map(([, mensaje]) => mensaje)
}

const comparable = (texto: string) =>
  texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()

/** Misma razón social sin importar tildes, mayúsculas ni espacios (para no ofrecer crear uno que ya aparece). */
export function mismoNombre(a: string, b: string): boolean {
  return comparable(a) === comparable(b)
}
```

```bash
npx vitest run src/lib/cotizaciones/editor-pantalla.test.ts
```

Expected: PASS (todos).

- [ ] **Step 3: Lecturas de las páginas — test de integración que falla**

```ts
// tests/integration/cotizaciones-lecturas.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerCatalogosEditor, leerContactos, leerUltimoFirmante } from '@/lib/cotizaciones/lecturas-editor'
import { idsDeEjemplo } from './cotizaciones-helpers'
import { borrarUsuario, crearUsuario, sql } from './helpers'

const MARCA = `t${crypto.randomUUID().slice(0, 8)}`
let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
let equipoInactivo: string
let plantillaInactiva: string
let firmanteActivo: string
let firmanteInactivo: string

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
  const [equipo] = await sql<{ id: string }>(
    'insert into public.equipos (nombre, capacidad_tn, activo) values ($1, 25, false) returning id',
    [`Equipo ${MARCA}`],
  )
  const [plantilla] = await sql<{ id: string }>(
    `insert into public.plantillas (nombre, formato, activa, bloques)
     values ($1, 'mensual', false, '[{"titulo": "T", "contenido": "C"}]') returning id`,
    [`Plantilla ${MARCA}`],
  )
  const firmantes = await sql<{ id: string; activo: boolean }>(
    'insert into public.firmantes (nombre, activo) values ($1, true), ($2, false) returning id, activo',
    [`Firmante activo ${MARCA}`, `Firmante inactivo ${MARCA}`],
  )
  equipoInactivo = equipo.id
  plantillaInactiva = plantilla.id
  firmanteActivo = firmantes.find((firmante) => firmante.activo)!.id
  firmanteInactivo = firmantes.find((firmante) => !firmante.activo)!.id
})

afterAll(async () => {
  await sql('delete from public.cotizaciones where notas = $1', [MARCA])
  await sql('delete from public.firmantes where nombre like $1', [`%${MARCA}`])
  await sql('delete from public.equipos where nombre like $1', [`%${MARCA}`])
  await sql('delete from public.plantillas where nombre like $1', [`%${MARCA}`])
  await borrarUsuario(activo.id)
})

describe('leerCatalogosEditor', () => {
  it('trae los activos y, además, lo que la cotización ya tiene elegido aunque esté inactivo', async () => {
    const nueva = await leerCatalogosEditor(activo.client)
    expect(nueva.equipos.map((equipo) => equipo.id)).not.toContain(equipoInactivo)
    expect(nueva.firmantes.map((firmante) => firmante.id)).not.toContain(firmanteInactivo)
    expect(nueva.plantillas.map((plantilla) => plantilla.id)).not.toContain(plantillaInactiva)
    expect(nueva.plantillas.map((plantilla) => plantilla.nombre)).toEqual(
      expect.arrayContaining(['Mensual - Grúa con operador', 'Por jornada - Grúa con operador']),
    )

    const existente = await leerCatalogosEditor(activo.client, {
      plantillaId: plantillaInactiva,
      equipoId: equipoInactivo,
      firmanteId: firmanteInactivo,
    })
    expect(existente.equipos.find((equipo) => equipo.id === equipoInactivo)).toMatchObject({
      activo: false,
      capacidad_tn: 25,
    })
    expect(existente.firmantes.find((firmante) => firmante.id === firmanteInactivo)).toMatchObject({ activo: false })
    expect(existente.plantillas.find((plantilla) => plantilla.id === plantillaInactiva)).toMatchObject({
      formato: 'mensual',
      bloques: [{ titulo: 'T', contenido: 'C', oculto: false }],
      items: [],
    })
    expect(Object.keys(existente.empresa).sort()).toEqual([
      'ciudad',
      'direccion',
      'email',
      'indice_base',
      'proxima_actualizacion',
      'razon_social',
      'telefono',
      'web',
    ])
  })
})

describe('leerUltimoFirmante', () => {
  it('es el de la última cotización de la app que tenga un firmante activo', async () => {
    // Creadas "en el futuro": quedan como las últimas aunque la base tenga otras.
    await sql(
      `insert into public.cotizaciones (cliente_id, formato, firmante_id, notas, created_at) values
         ($1, 'jornada', $2, $4, now() + interval '1 day'),
         ($1, 'jornada', $3, $4, now() + interval '2 days')`,
      [ids.cliente_id, firmanteActivo, firmanteInactivo, MARCA],
    )
    const { firmantes } = await leerCatalogosEditor(activo.client)
    expect(await leerUltimoFirmante(activo.client, firmantes)).toBe(firmanteActivo)
  })

  it('sin firmantes activos devuelve null', async () => {
    expect(await leerUltimoFirmante(activo.client, [])).toBeNull()
  })
})

describe('leerContactos', () => {
  it('devuelve los contactos del cliente', async () => {
    expect(await leerContactos(activo.client, ids.cliente_con_contacto_id)).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: ids.contacto_id, nombre: 'Yanina Colman' })]),
    )
  })
})
```

```bash
npm run test:int -- tests/integration/cotizaciones-lecturas.test.ts
```

Expected: FAIL (`Failed to resolve import "@/lib/cotizaciones/lecturas-editor"`).

- [ ] **Step 4: Implementar `lecturas-editor.ts`**

```ts
// src/lib/cotizaciones/lecturas-editor.ts
// Lo que leen las páginas del editor (/cotizaciones/nueva y /cotizaciones/[id]) además de la cotización.
// Recibe el cliente de Supabase por parámetro y no importa 'server-only': lo prueban los tests de integración.
import type { SupabaseClient } from '@supabase/supabase-js'
import { leerBloques, leerItemsPlantilla, type Formato } from '@/lib/plantillas/contenido'
import type { Database } from '@/lib/supabase/database.types'
import type { CatalogosEditor } from './editor'
import type { ContactoEditor } from './editor-pantalla'

type Cliente = SupabaseClient<Database>

/** Lo que la cotización ya tiene elegido: se ofrece en los combos aunque esté inactivo (decisión 20). */
export type ElegidosEditor = { plantillaId: string | null; equipoId: string | null; firmanteId: string | null }

const NADA_ELEGIDO: ElegidosEditor = { plantillaId: null, equipoId: null, firmanteId: null }

/** Plantillas, equipos y firmantes (activos más lo ya elegido) y los datos de la empresa que usa el PDF. */
export async function leerCatalogosEditor(
  supabase: Cliente,
  elegidos: ElegidosEditor = NADA_ELEGIDO,
): Promise<CatalogosEditor> {
  const [plantillas, equipos, firmantes, empresa] = await Promise.all([
    supabase
      .from('plantillas')
      .select('id, nombre, formato, asunto, intro, validez_dias, bloques, items, activa')
      .order('nombre'),
    supabase.from('equipos').select('id, nombre, capacidad_tn, descripcion, activo').order('nombre'),
    supabase.from('firmantes').select('id, nombre, cargo, telefono, activo').order('nombre'),
    supabase
      .from('empresa_config')
      .select('razon_social, direccion, ciudad, telefono, email, web, indice_base, proxima_actualizacion')
      .single(),
  ])
  if (plantillas.error) throw plantillas.error
  if (equipos.error) throw equipos.error
  if (firmantes.error) throw firmantes.error
  if (empresa.error) throw empresa.error

  return {
    plantillas: plantillas.data
      .filter((plantilla) => plantilla.activa || plantilla.id === elegidos.plantillaId)
      .map((plantilla) => ({
        id: plantilla.id,
        nombre: plantilla.nombre,
        formato: plantilla.formato as Formato,
        asunto: plantilla.asunto,
        intro: plantilla.intro,
        validez_dias: plantilla.validez_dias,
        bloques: leerBloques(plantilla.bloques),
        items: leerItemsPlantilla(plantilla.items),
      })),
    equipos: equipos.data.filter((equipo) => equipo.activo || equipo.id === elegidos.equipoId),
    firmantes: firmantes.data.filter((firmante) => firmante.activo || firmante.id === elegidos.firmanteId),
    empresa: empresa.data,
  }
}

/** Firmante de la última cotización creada en la app que tenga un firmante activo (decisión 9). */
export async function leerUltimoFirmante(
  supabase: Cliente,
  firmantes: CatalogosEditor['firmantes'],
): Promise<string | null> {
  const activos = firmantes.filter((firmante) => firmante.activo).map((firmante) => firmante.id)
  if (activos.length === 0) return null
  const { data, error } = await supabase
    .from('cotizaciones')
    .select('firmante_id')
    .eq('origen', 'app')
    .in('firmante_id', activos)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return data?.firmante_id ?? null
}

/** Contactos de un cliente para el "Atte.", por nombre. */
export async function leerContactos(supabase: Cliente, clienteId: string): Promise<ContactoEditor[]> {
  const { data, error } = await supabase
    .from('contactos')
    .select('id, nombre, email')
    .eq('cliente_id', clienteId)
    .order('nombre')
  if (error) throw error
  return data
}
```

```bash
npm run test:int -- tests/integration/cotizaciones-lecturas.test.ts
```

Expected: PASS (4 tests).

- [ ] **Step 5: E2E del editor — tests que fallan**

Agregar al final de `tests/e2e/cotizaciones.spec.ts` (lo crea la Task 7). El archivo tiene que importar `expect` y `test` de `@playwright/test`, `pg` de `pg` (default import) e `iniciarSesion` y `sufijoUnico` de `./helpers`: sumá a los imports existentes lo que falte, sin duplicar. Los nombres de este bloque (`MARCA_EDITOR`, `conBaseEditor`) son propios para no chocar con lo que ya tenga el archivo.

Lo que se crea desde la pantalla no lleva marca (el editor no escribe `notas`): se junta el id de la URL después de guardar y la razón social del alta rápida, y el `afterAll` los borra (primero las cotizaciones: la FK no deja borrar un cliente que las tenga).

```ts
// ── Editor: estructura, cliente, datos y guardado (Task 8) ──

const MARCA_EDITOR = 'e2e-editor'

async function conBaseEditor<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** El id de la cotización abierta en el editor (`/cotizaciones/{id}`). */
function idDeLaUrl(url: string): string {
  return new URL(url).pathname.split('/').at(-1)!
}

test.describe('editor de cotizaciones', () => {
  const creadas: string[] = []
  const clientesCreados: string[] = []

  test.afterAll(async () => {
    await conBaseEditor(async (db) => {
      await db.query('delete from public.cotizaciones where id = any($1::uuid[]) or notas = $2', [creadas, MARCA_EDITOR])
      await db.query('delete from public.clientes where razon_social = any($1::text[])', [clientesCreados])
    })
  })

  test('crea una cotización con alta rápida de cliente y la guarda', async ({ page }) => {
    const razonSocial = `Montajes Ñire ${sufijoUnico()} S.R.L.`
    clientesCreados.push(razonSocial)
    await iniciarSesion(page)
    await page.goto('/cotizaciones/nueva')
    await expect(page.getByRole('heading', { name: 'Nueva cotización' })).toBeVisible()

    // Sin cliente no se guarda: el error queda en el combo y el foco va ahí.
    const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(cliente).toHaveAttribute('aria-invalid', 'true')
    await expect(cliente).toBeFocused()

    // Alta rápida: crea el cliente solo con la razón social y lo deja elegido.
    await cliente.click()
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill(razonSocial)
    await page.getByRole('option', { name: `Crear cliente «${razonSocial}»` }).click()
    await expect(cliente).toContainText(razonSocial)
    await expect(page.getByText('Este cliente no tiene contactos.')).toBeVisible()

    // Cambiar de plantilla con algo escrito a mano pide confirmación en el lugar (Escape cancela).
    const mensual = page.getByRole('radio', { name: 'Mensual' })
    const jornada = page.getByRole('radio', { name: 'Por jornada' })
    await mensual.click()
    await expect(mensual).toBeChecked()
    const asunto = page.getByLabel('Asunto', { exact: true })
    await asunto.fill('Asunto escrito a mano')
    await jornada.click()
    const confirmacion = page.getByRole('group', { name: '¿Cambiar a la plantilla «Por jornada - Grúa con operador»?' })
    await expect(confirmacion.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(confirmacion).toBeHidden()
    await expect(asunto).toHaveValue('Asunto escrito a mano')
    await jornada.click()
    await confirmacion.getByRole('button', { name: 'Cambiar plantilla' }).click()
    await expect(jornada).toBeChecked()
    await expect(asunto).toHaveValue(/^Cotización N° \{\{numero\}\}/)

    // Un dato vacío que usa el texto muestra la marca de la variable (no es su valor).
    await page.getByLabel('Equipo', { exact: true }).selectOption({ label: 'Grúa telescópica XCMG 70 TN' })
    const lugar = page.getByLabel('Lugar del servicio', { exact: true })
    const marca = lugar.locator('..').getByText('{{ubicacion}}')
    await expect(lugar).toHaveValue('')
    await expect(marca).toBeVisible()
    await lugar.fill('Añelo, Neuquén')
    await expect(marca).toBeHidden()

    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    creadas.push(idDeLaUrl(page.url()))
    await expect(page.getByRole('heading', { name: /^Cotización N° \d+$/ })).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()

    // Lo guardado vuelve igual al recargar; el formato ya no se elige.
    await page.reload()
    await expect(cliente).toContainText(razonSocial)
    await expect(jornada).toHaveCount(0)
    await expect(lugar).toHaveValue('Añelo, Neuquén')
    await expect(page.getByLabel('Equipo', { exact: true }).locator('option:checked')).toHaveText(
      'Grúa telescópica XCMG 70 TN',
    )

    // Ctrl/⌘+S guarda.
    await lugar.fill('Añelo, Neuquén (yacimiento)')
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeEnabled()
    await page.keyboard.press('ControlOrMeta+s')
    await expect(page.getByText('Cotización guardada')).toBeVisible()
    await expect(page.getByRole('button', { name: 'Guardar' })).toBeDisabled()
  })

  test('una cotización cargada se muestra en solo lectura', async ({ page }) => {
    const { id, numero } = await conBaseEditor(async (db) => {
      const { rows } = await db.query<{ id: string; numero: string }>(
        `insert into public.cotizaciones (cliente_id, formato, origen, estado, archivo_original_path, asunto, notas)
         select id, 'jornada', 'importada', 'enviada', 'importadas/e2e-editor.pdf', 'Montaje de tanque', $1
         from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.'
         returning id, numero`,
        [MARCA_EDITOR],
      )
      return rows[0]
    })

    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)
    await expect(page.getByRole('heading', { name: `Cotización N° ${numero}` })).toBeVisible()
    await expect(page.getByText('Cargada desde un PDF.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Ver el PDF original' })).toHaveAttribute('href', `/cotizaciones/${id}/pdf`)
    await expect(page.getByRole('button', { name: 'Guardar' })).toHaveCount(0)
  })
})
```

```bash
npm run test:e2e -- tests/e2e/cotizaciones.spec.ts -g "editor de cotizaciones"
```

Expected: FAIL (las rutas `/cotizaciones/nueva` y `/cotizaciones/{id}` todavía no existen: 404).

- [ ] **Step 6: Confirmación en el lugar**

Es el patrón de `BorrarContacto` (`src/components/clientes/contacto-form.tsx`) como pieza reusable: la usan el cambio de plantilla (acá), restaurar textos (Task 10) y las transiciones (Task 12).

```tsx
'use client'
// src/components/formulario/confirmacion-en-lugar.tsx

import { useCallback, useId } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

const TONOS = {
  peligro: 'border-destructive/30 bg-destructive/5',
  aviso: 'border-amber-200 bg-amber-50',
  neutro: 'border-border bg-muted/60',
} as const

/**
 * Confirmación sin modal (decisión 15): aparece en el lugar, el foco va a "Cancelar" y Escape cancela.
 * Adónde vuelve el foco al cerrarse lo decide quien la abre (alCancelar / alConfirmar).
 */
export function ConfirmacionEnLugar({
  pregunta,
  detalle,
  textoConfirmar,
  textoPendiente,
  tono = 'aviso',
  pendiente = false,
  alConfirmar,
  alCancelar,
  children,
  className,
}: {
  pregunta: string
  detalle?: React.ReactNode
  textoConfirmar: string
  /** Texto del botón mientras corre la acción ("Aprobando…"). */
  textoPendiente?: string
  tono?: keyof typeof TONOS
  pendiente?: boolean
  alConfirmar: () => void
  alCancelar: () => void
  /** Controles entre el texto y los botones (p. ej. la fecha de aprobación de la Task 12). */
  children?: React.ReactNode
  className?: string
}) {
  const id = useId()
  const enfocar = useCallback((boton: HTMLButtonElement | null) => boton?.focus(), [])

  return (
    <div
      role="group"
      aria-labelledby={`${id}-pregunta`}
      onKeyDown={(evento) => {
        if (evento.key === 'Escape' && !pendiente) {
          evento.stopPropagation()
          alCancelar()
        }
      }}
      className={cn('flex flex-wrap items-center gap-x-4 gap-y-3 rounded-lg border px-4 py-3 text-sm', TONOS[tono], className)}
    >
      <div className="min-w-0 flex-1 basis-64 space-y-0.5">
        <p id={`${id}-pregunta`} className="font-medium [overflow-wrap:anywhere]">
          {pregunta}
        </p>
        {detalle ? <p className="text-muted-foreground">{detalle}</p> : null}
      </div>
      {children}
      <div className="ml-auto flex gap-2">
        <Button ref={enfocar} type="button" variant="outline" onClick={alCancelar} disabled={pendiente}>
          Cancelar
        </Button>
        <Button
          type="button"
          onClick={alConfirmar}
          disabled={pendiente}
          className={
            tono === 'peligro' ? 'bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/30' : undefined
          }
        >
          {pendiente && textoPendiente ? textoPendiente : textoConfirmar}
        </Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: Combobox de cliente y tarjeta Cliente**

`SelectorCliente` (decisión 18): `Popover` + `Command` (cmdk) con `shouldFilter={false}` porque filtra el servidor. La búsqueda va con un temporizador en el handler (no en un efecto) y descarta respuestas viejas con un contador. El disparador es un `Button` con `role="combobox"`; su nombre accesible sale de la etiqueta `sr-only` "Cliente".

```tsx
'use client'
// src/components/cotizaciones/editor/selector-cliente.tsx

import { ChevronsUpDown, Plus } from 'lucide-react'
import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { buscarClientes, crearClienteRapido } from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Pastilla } from '@/components/ui/pastilla'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { mismoNombre } from '@/lib/cotizaciones/editor-pantalla'
import { formatCuit } from '@/lib/cuit'
import { cn } from '@/lib/utils'

export type ClienteBuscado = { id: string; razon_social: string; cuit: string | null; activo: boolean }

const DEMORA_BUSQUEDA = 250

/**
 * Combobox de cliente (decisión 18): busca con buscar_clientes (sin acentos, por CUIT y por contacto), muestra los
 * inactivos al final con su marca y ofrece "+ Crear cliente «texto»" con solo la razón social.
 */
export function SelectorCliente({
  id,
  cliente,
  error,
  alElegir,
}: {
  id: string
  cliente: { id: string; razon_social: string } | null
  error?: string
  alElegir: (cliente: ClienteBuscado) => void
}) {
  const [abierto, setAbierto] = useState(false)
  const [texto, setTexto] = useState('')
  const [resultados, setResultados] = useState<ClienteBuscado[]>([])
  const [buscando, setBuscando] = useState(false)
  const [creando, setCreando] = useState(false)
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null)
  const ultimoPedido = useRef(0)

  function buscar(valor: string, demora: number) {
    if (temporizador.current) clearTimeout(temporizador.current)
    const pedido = ++ultimoPedido.current
    setBuscando(true)
    temporizador.current = setTimeout(async () => {
      try {
        const resultado = await buscarClientes(valor)
        if (pedido !== ultimoPedido.current) return
        if (resultado.ok) setResultados(resultado.datos)
        else {
          setResultados([])
          toast.error(resultado.mensaje)
        }
      } catch (error) {
        unstable_rethrow(error)
        if (pedido === ultimoPedido.current) toast.error('No se pudo buscar. Probá de nuevo en un momento.')
      } finally {
        if (pedido === ultimoPedido.current) setBuscando(false)
      }
    }, demora)
  }

  function alAbrir(siguiente: boolean) {
    setAbierto(siguiente)
    if (siguiente) {
      setTexto('')
      buscar('', 0)
    }
  }

  function alEscribir(valor: string) {
    setTexto(valor)
    buscar(valor, DEMORA_BUSQUEDA)
  }

  function elegir(elegido: ClienteBuscado) {
    setAbierto(false)
    alElegir(elegido)
  }

  const razonSocial = texto.trim()

  async function crear() {
    if (!razonSocial || creando) return
    setCreando(true)
    try {
      const resultado = await crearClienteRapido(razonSocial)
      if (!resultado.ok) {
        toast.error(resultado.mensaje)
        return
      }
      toast.success('Cliente creado. El CUIT y los demás datos se completan en Clientes.')
      elegir({ ...resultado.datos, activo: true })
    } catch (error) {
      unstable_rethrow(error)
      toast.error('No se pudo crear el cliente. Probá de nuevo en un momento.')
    } finally {
      setCreando(false)
    }
  }

  // Mientras corre la búsqueda, `resultados` es la de antes: ofrecer crear ahí deja crear un duplicado de un cliente
  // que ya existe (solo el CUIT es único en la tabla).
  const ofrecerCrear =
    !buscando && razonSocial !== '' && !resultados.some((otro) => mismoNombre(otro.razon_social, razonSocial))

  return (
    <Popover open={abierto} onOpenChange={alAbrir}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={abierto}
          aria-invalid={Boolean(error)}
          aria-describedby={error ? `${id}-error` : undefined}
          className="h-8 w-full justify-between px-2.5 font-normal"
        >
          <span className={cn('truncate', !cliente && 'text-muted-foreground')}>
            {cliente?.razon_social ?? 'Buscá o creá un cliente'}
          </span>
          <ChevronsUpDown className="text-muted-foreground" aria-hidden />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-(--radix-popover-trigger-width) min-w-72 p-0">
        <Command shouldFilter={false} label="Buscar cliente">
          <CommandInput value={texto} onValueChange={alEscribir} placeholder="Razón social, CUIT o contacto" />
          <CommandList>
            {buscando && resultados.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Buscando…</p>
            ) : null}
            {buscando ? null : (
              <CommandEmpty>{texto ? 'No hay clientes que coincidan.' : 'Todavía no hay clientes cargados.'}</CommandEmpty>
            )}
            {resultados.length > 0 ? (
              <CommandGroup>
                {resultados.map((opcion) => (
                  <CommandItem
                    key={opcion.id}
                    value={opcion.id}
                    onSelect={() => elegir(opcion)}
                    className={cn(!opcion.activo && 'text-muted-foreground')}
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate">{opcion.razon_social}</span>
                      {opcion.cuit ? (
                        <span className="block text-xs text-muted-foreground tabular-nums">{formatCuit(opcion.cuit)}</span>
                      ) : null}
                    </span>
                    {opcion.activo ? null : <Pastilla>Inactivo</Pastilla>}
                  </CommandItem>
                ))}
              </CommandGroup>
            ) : null}
            {ofrecerCrear ? (
              <CommandGroup>
                <CommandItem value="__crear__" onSelect={() => void crear()} disabled={creando} className="text-primary">
                  <Plus aria-hidden />
                  {creando ? 'Creando…' : `Crear cliente «${razonSocial}»`}
                </CommandItem>
              </CommandGroup>
            ) : null}
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}
```

`TarjetaCliente` (decisión 19): al elegir un cliente se despacha enseguida con el contacto vacío (cambiar de cliente limpia el contacto) y, cuando llegan los contactos, se preselecciona el último usado o el primero. Un pedido viejo no pisa uno nuevo.

```tsx
'use client'
// src/components/cotizaciones/editor/tarjeta-cliente.tsx

import { unstable_rethrow } from 'next/navigation'
import { useRef, useState } from 'react'
import { toast } from 'sonner'
import { contactosDeCliente } from '@/app/(app)/cotizaciones/actions'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import { ID_CAMPO, contactoInicial, type ContactoEditor, type Despachar } from '@/lib/cotizaciones/editor-pantalla'
import { SelectorCliente, type ClienteBuscado } from './selector-cliente'

export function TarjetaCliente({
  estado,
  contactos,
  errores,
  despachar,
  alCambiarContactos,
}: {
  estado: EstadoEditor
  contactos: ContactoEditor[]
  errores: Record<string, string>
  despachar: Despachar
  alCambiarContactos: (contactos: ContactoEditor[]) => void
}) {
  const [cargando, setCargando] = useState(false)
  const ultimoPedido = useRef(0)

  async function elegir(cliente: ClienteBuscado) {
    if (!cliente.activo) {
      toast.warning(`${cliente.razon_social} está inactivo. Podés cotizarle igual; reactivalo desde Clientes.`)
    }
    if (cliente.id === estado.cliente?.id) return
    const pedido = ++ultimoPedido.current
    alCambiarContactos([])
    despachar({
      tipo: 'cliente',
      cliente: { id: cliente.id, razon_social: cliente.razon_social, cuit: cliente.cuit },
      contactoId: '',
    })
    setCargando(true)
    let lista: ContactoEditor[] = []
    let contactoId = ''
    try {
      const resultado = await contactosDeCliente(cliente.id)
      if (resultado.ok) {
        lista = resultado.datos.contactos
        contactoId = contactoInicial(lista, resultado.datos.ultimoContactoId)
      } else {
        toast.error(resultado.mensaje)
      }
    } catch (error) {
      unstable_rethrow(error)
      toast.error('No se pudieron leer los contactos del cliente.')
    }
    if (pedido !== ultimoPedido.current) return
    setCargando(false)
    alCambiarContactos(lista)
    if (contactoId) despachar({ tipo: 'campo', campo: 'contactoId', valor: contactoId })
  }

  const errorCliente = errores.cliente
  const errorContacto = errores.contactoId

  return (
    <Tarjeta titulo="Cliente">
      <div className="grid gap-2.5 @md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="space-y-1">
          <Label htmlFor={ID_CAMPO.cliente} className="sr-only">
            Cliente
          </Label>
          <SelectorCliente
            id={ID_CAMPO.cliente}
            cliente={estado.cliente}
            error={errorCliente}
            alElegir={(cliente) => void elegir(cliente)}
          />
          {errorCliente ? (
            <p id={`${ID_CAMPO.cliente}-error`} className="text-sm text-destructive">
              {errorCliente}
            </p>
          ) : null}
        </div>
        <div className="space-y-1">
          {/* "Atte." como prefijo dentro del borde (referencia 03), sin repetirlo en cada opción. */}
          <div className="flex h-8 items-center rounded-lg border border-input transition-colors focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50 has-[select:disabled]:opacity-50 has-[[aria-invalid=true]]:border-destructive">
            <label htmlFor={ID_CAMPO.contacto} className="shrink-0 pl-2.5 text-sm text-muted-foreground">
              Atte.
            </label>
            <NativeSelect
              id={ID_CAMPO.contacto}
              value={estado.contactoId}
              disabled={!estado.cliente || cargando}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'contactoId', valor: evento.target.value })}
              aria-invalid={Boolean(errorContacto)}
              aria-describedby={errorContacto ? `${ID_CAMPO.contacto}-error` : undefined}
              className="min-w-0 flex-1 has-[select:disabled]:opacity-100 [&_select]:border-0 [&_select]:pl-1.5 [&_select]:focus-visible:ring-0"
            >
              {!estado.cliente ? (
                <NativeSelectOption value="">Elegí primero el cliente</NativeSelectOption>
              ) : cargando ? (
                <NativeSelectOption value="">Cargando…</NativeSelectOption>
              ) : (
                <>
                  <NativeSelectOption value="">Sin Atte.</NativeSelectOption>
                  {contactos.map((contacto) => (
                    <NativeSelectOption key={contacto.id} value={contacto.id}>
                      {contacto.nombre}
                    </NativeSelectOption>
                  ))}
                </>
              )}
            </NativeSelect>
          </div>
          {errorContacto ? (
            <p id={`${ID_CAMPO.contacto}-error`} className="text-sm text-destructive">
              {errorContacto}
            </p>
          ) : estado.cliente && !cargando && contactos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Este cliente no tiene contactos.</p>
          ) : null}
        </div>
      </div>
    </Tarjeta>
  )
}
```

- [ ] **Step 8: Tarjetas Datos y Asunto**

`TarjetaDatos`: al crear, el control segmentado de formato con la plantilla (decisión 10) y su confirmación en el lugar; después, la grilla de 2 columnas con Equipo, los datos que usa el texto (con la marca `{{variable}}` superpuesta si están vacíos y faltan, decisión 17), Próxima actualización (`<input type="month">`, decisión 7) y una fila de 3 con Fecha, Validez y Firma. `indice_base` vacío muestra de placeholder el valor de la empresa.

```tsx
'use client'
// src/components/cotizaciones/editor/tarjeta-datos.tsx

import Link from 'next/link'
import { useRef, useState } from 'react'
import { Campo } from '@/components/formulario/campo'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import type { CampoDatos } from '@/lib/cotizaciones/datos'
import type { CatalogosEditor, EstadoEditor, Pendientes, PlantillaEditor } from '@/lib/cotizaciones/editor'
import {
  ID_CAMPO,
  cambiosDeContenido,
  camposDatosVisibles,
  esFechaIso,
  idCampoDato,
  plantillasDeFormato,
  textoProximaActualizacion,
  type Despachar,
} from '@/lib/cotizaciones/editor-pantalla'
import { FORMATOS, type Formato } from '@/lib/plantillas/contenido'
import { VARIABLES } from '@/lib/plantillas/variables'
import { cn } from '@/lib/utils'

/** Las mismas clases que la etiqueta de Campo, para los campos que no pueden usarlo (marca superpuesta, selects). */
const ETIQUETA = 'text-[13px]/none font-normal text-muted-foreground'
const FALTA = '[&_select]:border-brand-yellow [&_select]:bg-brand-yellow/10'

function SelectorPlantilla({
  estado,
  plantillas,
  error,
  despachar,
}: {
  estado: EstadoEditor
  plantillas: PlantillaEditor[]
  error?: string
  despachar: Despachar
}) {
  const [pendiente, setPendiente] = useState<PlantillaEditor | null>(null)
  const grupo = useRef<HTMLDivElement>(null)
  const actual = plantillas.find((plantilla) => plantilla.id === estado.plantillaId) ?? null
  const delFormato = plantillasDeFormato(plantillas, estado.formato)

  function elegir(plantilla: PlantillaEditor | undefined) {
    if (!plantilla || plantilla.id === estado.plantillaId) return
    if (cambiosDeContenido(estado, actual)) setPendiente(plantilla)
    else despachar({ tipo: 'plantilla', plantilla })
  }

  // Al cerrar la confirmación el foco vuelve a la opción elegida (después del render).
  function cerrar() {
    setPendiente(null)
    requestAnimationFrame(() => grupo.current?.querySelector<HTMLElement>('[data-state="on"]')?.focus())
  }

  if (plantillas.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No hay plantillas activas.{' '}
        <Link href="/configuracion/plantillas" className="text-primary underline-offset-4 hover:underline">
          Revisalas en Configuración
        </Link>
        .
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Un valor vacío es "deseleccionar" (Radix): el formato siempre queda elegido. */}
        <ToggleGroup
          ref={grupo}
          type="single"
          aria-label="Formato"
          value={estado.formato}
          onValueChange={(valor) => {
            if (valor) elegir(plantillasDeFormato(plantillas, valor as Formato)[0])
          }}
          className="h-8 gap-0 rounded-lg bg-muted p-0.5"
        >
          {(Object.keys(FORMATOS) as Formato[]).map((formato) => (
            <ToggleGroupItem
              key={formato}
              value={formato}
              disabled={plantillasDeFormato(plantillas, formato).length === 0}
              className="h-7 rounded-md px-3 text-sm text-muted-foreground data-[state=on]:bg-background data-[state=on]:text-foreground data-[state=on]:shadow-sm"
            >
              {FORMATOS[formato]}
            </ToggleGroupItem>
          ))}
        </ToggleGroup>
        {delFormato.length > 1 ? (
          <NativeSelect
            id={ID_CAMPO.plantilla}
            aria-label="Plantilla"
            value={estado.plantillaId}
            onChange={(evento) => elegir(plantillas.find((plantilla) => plantilla.id === evento.target.value))}
            className="min-w-0 flex-1"
          >
            {delFormato.map((plantilla) => (
              <NativeSelectOption key={plantilla.id} value={plantilla.id}>
                {plantilla.nombre}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        ) : null}
      </div>
      {error ? <p className="text-sm text-destructive">{error}</p> : null}
      {pendiente ? (
        <ConfirmacionEnLugar
          tono="aviso"
          pregunta={`¿Cambiar a la plantilla «${pendiente.nombre}»?`}
          detalle="Se reemplazan el asunto, la introducción, los textos y los ítems."
          textoConfirmar="Cambiar plantilla"
          alConfirmar={() => {
            despachar({ tipo: 'plantilla', plantilla: pendiente })
            cerrar()
          }}
          alCancelar={cerrar}
        />
      ) : null}
    </div>
  )
}

/** Un dato que alimenta una variable. Vacío y usado por el texto: la marca {{x}} encima (nunca como valor). */
function CampoDato({
  campo,
  valor,
  faltaCompletar,
  error,
  placeholder,
  ayuda,
  despachar,
}: {
  campo: CampoDatos
  valor: string
  faltaCompletar: boolean
  error?: string
  placeholder?: string
  ayuda?: string
  despachar: Despachar
}) {
  const id = idCampoDato(campo)
  const marcar = faltaCompletar && valor === ''
  const descripciones =
    [error ? `${id}-error` : null, !error && ayuda ? `${id}-ayuda` : null, marcar ? `${id}-falta` : null]
      .filter(Boolean)
      .join(' ') || undefined

  return (
    <div className="space-y-1">
      <Label htmlFor={id} className={ETIQUETA}>
        {VARIABLES[campo]}
      </Label>
      <div className="relative">
        <Input
          id={id}
          value={valor}
          maxLength={500}
          placeholder={marcar ? undefined : placeholder}
          onChange={(evento) => despachar({ tipo: 'dato', campo, valor: evento.target.value })}
          aria-invalid={Boolean(error)}
          aria-describedby={descripciones}
        />
        {marcar ? (
          <>
            <span
              aria-hidden
              className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 rounded-sm bg-brand-yellow/40 px-0.5 text-sm"
            >
              {`{{${campo}}}`}
            </span>
            <span id={`${id}-falta`} className="sr-only">
              Falta completar: lo usa el texto de la cotización.
            </span>
          </>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-error`} className="text-sm text-destructive">
          {error}
        </p>
      ) : ayuda ? (
        <p id={`${id}-ayuda`} className="text-xs text-muted-foreground">
          {ayuda}
        </p>
      ) : null}
    </div>
  )
}

function AyudaEquipo({ catalogos, estado, faltan }: { catalogos: CatalogosEditor; estado: EstadoEditor; faltan: Set<string> }) {
  if (catalogos.equipos.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        No hay equipos activos.{' '}
        <Link href="/configuracion/equipos/nuevo" className="text-primary underline-offset-4 hover:underline">
          Cargar equipos en Configuración
        </Link>
      </p>
    )
  }
  if (!faltan.has('capacidad') && !faltan.has('equipo_descripcion')) return null
  if (estado.equipoId === '') {
    return <p className="text-xs text-muted-foreground">El texto usa la capacidad y la descripción del equipo.</p>
  }
  return (
    <p className="text-xs text-muted-foreground">
      A este equipo le falta {faltan.has('capacidad') ? 'la capacidad' : 'la descripción'} (Configuración › Equipos).
    </p>
  )
}

export function TarjetaDatos({
  estado,
  catalogos,
  pendientes,
  errores,
  despachar,
}: {
  estado: EstadoEditor
  catalogos: CatalogosEditor
  pendientes: Pendientes
  errores: Record<string, string>
  despachar: Despachar
}) {
  const faltan = new Set<string>(pendientes.variables)
  const faltaEquipo = estado.equipoId === '' && (faltan.has('capacidad') || faltan.has('equipo_descripcion'))
  const textoProxima = textoProximaActualizacion(
    estado.proximaActualizacion,
    estado.datos.proxima_actualizacion,
    catalogos.empresa.proxima_actualizacion,
  )
  const faltaProxima = faltan.has('proxima_actualizacion') && estado.proximaActualizacion === ''
  const errorProxima = errores.proximaActualizacion ?? errores['datos.proxima_actualizacion']

  return (
    <Tarjeta titulo="Datos de esta cotización">
      {estado.id === null ? (
        <SelectorPlantilla
          estado={estado}
          plantillas={catalogos.plantillas}
          error={errores.plantillaId ?? errores.formato}
          despachar={despachar}
        />
      ) : null}
      <div className="grid gap-x-4 gap-y-3 @md:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor={ID_CAMPO.equipo} className={ETIQUETA}>
            Equipo
          </Label>
          <NativeSelect
            id={ID_CAMPO.equipo}
            value={estado.equipoId}
            onChange={(evento) => despachar({ tipo: 'campo', campo: 'equipoId', valor: evento.target.value })}
            aria-invalid={Boolean(errores.equipoId)}
            aria-describedby={errores.equipoId ? `${ID_CAMPO.equipo}-error` : undefined}
            className={cn('w-full', faltaEquipo && FALTA)}
          >
            <NativeSelectOption value="">Elegí un equipo</NativeSelectOption>
            {catalogos.equipos.map((equipo) => (
              <NativeSelectOption key={equipo.id} value={equipo.id}>
                {equipo.activo ? equipo.nombre : `${equipo.nombre} (inactivo)`}
              </NativeSelectOption>
            ))}
          </NativeSelect>
          {errores.equipoId ? (
            <p id={`${ID_CAMPO.equipo}-error`} className="text-sm text-destructive">
              {errores.equipoId}
            </p>
          ) : (
            <AyudaEquipo catalogos={catalogos} estado={estado} faltan={faltan} />
          )}
        </div>

        {camposDatosVisibles(estado).map((campo) => (
          <CampoDato
            key={campo}
            campo={campo}
            valor={estado.datos[campo]}
            faltaCompletar={faltan.has(campo)}
            error={errores[`datos.${campo}`]}
            placeholder={campo === 'indice_base' ? catalogos.empresa.indice_base || undefined : undefined}
            ayuda={
              campo === 'indice_base' && catalogos.empresa.indice_base
                ? 'Vacío: se usa el de la empresa.'
                : undefined
            }
            despachar={despachar}
          />
        ))}

        <Campo
          id={ID_CAMPO.proximaActualizacion}
          etiqueta="Próxima actualización"
          error={errorProxima}
          ayuda={textoProxima ? `En el PDF: «${textoProxima}»` : undefined}
        >
          <Input
            id={ID_CAMPO.proximaActualizacion}
            type="month"
            value={estado.proximaActualizacion}
            onChange={(evento) =>
              despachar({ tipo: 'campo', campo: 'proximaActualizacion', valor: evento.target.value })
            }
            aria-invalid={Boolean(errorProxima)}
            className={cn(faltaProxima && 'border-brand-yellow bg-brand-yellow/10')}
          />
        </Campo>

        {/* Fecha, validez y firma en una fila de tres (entran a 548 px y ahorran alto). */}
        <div className="grid gap-x-4 gap-y-3 @md:col-span-2 @md:grid-cols-3">
          <Campo id={ID_CAMPO.fecha} etiqueta="Fecha" error={errores.fecha}>
            <Input
              id={ID_CAMPO.fecha}
              type="date"
              required
              value={estado.fecha}
              // Una fecha vacía o a medio escribir no se despacha: el documento no se puede armar sin fecha.
              onChange={(evento) => {
                if (esFechaIso(evento.target.value)) {
                  despachar({ tipo: 'campo', campo: 'fecha', valor: evento.target.value })
                }
              }}
              aria-invalid={Boolean(errores.fecha)}
            />
          </Campo>
          <Campo id={ID_CAMPO.validez} etiqueta="Validez (días)" error={errores.validezDias}>
            <Input
              id={ID_CAMPO.validez}
              inputMode="numeric"
              value={estado.validezDias}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'validezDias', valor: evento.target.value })}
              aria-invalid={Boolean(errores.validezDias)}
              className="tabular-nums"
            />
          </Campo>
          <div className="space-y-1">
            <Label htmlFor={ID_CAMPO.firmante} className={ETIQUETA}>
              Firma
            </Label>
            <NativeSelect
              id={ID_CAMPO.firmante}
              value={estado.firmanteId}
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'firmanteId', valor: evento.target.value })}
              aria-invalid={Boolean(errores.firmanteId)}
              aria-describedby={errores.firmanteId ? `${ID_CAMPO.firmante}-error` : undefined}
              className="w-full"
            >
              <NativeSelectOption value="">Sin firma</NativeSelectOption>
              {catalogos.firmantes.map((firmante) => (
                <NativeSelectOption key={firmante.id} value={firmante.id}>
                  {firmante.activo ? firmante.nombre : `${firmante.nombre} (inactivo)`}
                </NativeSelectOption>
              ))}
            </NativeSelect>
            {errores.firmanteId ? (
              <p id={`${ID_CAMPO.firmante}-error`} className="text-sm text-destructive">
                {errores.firmanteId}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    </Tarjeta>
  )
}
```

`TarjetaAsunto`: asunto (`Input`) e introducción (`Textarea`), y debajo de cada uno, si usa variables, el mismo texto con las variables marcadas (`ConVariables`). El PDF mensual (`cotizacion-mensual.tsx`) no imprime ni el asunto ni la introducción: en una mensual la tarjeta lo dice en la bajada. Las variables que se escriban ahí igual cuentan como pendientes, porque `armarDocumento` las cuenta en los dos formatos y el servidor las exige al enviar. Las plantillas mensuales traen los dos vacíos.

```tsx
'use client'
// src/components/cotizaciones/editor/tarjeta-asunto.tsx

import { Campo } from '@/components/formulario/campo'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { ConVariables } from '@/components/plantillas/texto-formateado'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import { ID_CAMPO, type Despachar } from '@/lib/cotizaciones/editor-pantalla'
import { variablesUsadas } from '@/lib/plantillas/variables'

/** Debajo del campo: el texto con sus variables marcadas, para ver qué se completa solo. */
function Variables({ texto }: { texto: string }) {
  if (variablesUsadas(texto).length === 0) return null
  return (
    <p className="text-[13px] text-muted-foreground [overflow-wrap:anywhere]">
      <ConVariables texto={texto} />
    </p>
  )
}

export function TarjetaAsunto({
  estado,
  errores,
  despachar,
}: {
  estado: EstadoEditor
  errores: Record<string, string>
  despachar: Despachar
}) {
  return (
    <Tarjeta
      titulo="Asunto e introducción"
      descripcion={
        estado.formato === 'mensual'
          ? 'El PDF mensual no imprime el asunto ni la introducción; el asunto se ve en la lista (Trabajo).'
          : undefined
      }
    >
      <div className="space-y-3">
        <div className="space-y-1.5">
          <Campo id={ID_CAMPO.asunto} etiqueta="Asunto" error={errores.asunto}>
            <Input
              id={ID_CAMPO.asunto}
              value={estado.asunto}
              placeholder="Sin asunto"
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'asunto', valor: evento.target.value })}
              aria-invalid={Boolean(errores.asunto)}
            />
          </Campo>
          <Variables texto={estado.asunto} />
        </div>
        <div className="space-y-1.5">
          <Campo id={ID_CAMPO.intro} etiqueta="Introducción" error={errores.intro}>
            <Textarea
              id={ID_CAMPO.intro}
              value={estado.intro}
              rows={3}
              placeholder="Sin introducción"
              onChange={(evento) => despachar({ tipo: 'campo', campo: 'intro', valor: evento.target.value })}
              aria-invalid={Boolean(errores.intro)}
              className="min-h-20 text-[15px] md:text-[15px]"
            />
          </Campo>
          <Variables texto={estado.intro} />
        </div>
      </div>
    </Tarjeta>
  )
}
```

- [ ] **Step 9: Encabezado, barra inferior y editor**

`EncabezadoEditor`: `EncabezadoPagina compacto` (decisión 21) con el título ("Nueva cotización" o "Cotización N° X"), `EstadoCotizacion`, la bajada (formato, fecha y, en enviadas, "Vence/Venció el …" con ámbar) y Guardar en outline desde 72rem. A la derecha de Guardar va el slot `acciones` (Task 12).

```tsx
'use client'
// src/components/cotizaciones/editor/encabezado-editor.tsx

import { EncabezadoPagina } from '@/components/app-shell/encabezado'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { Button } from '@/components/ui/button'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import { resumenEncabezado } from '@/lib/cotizaciones/editor-pantalla'
import { cn } from '@/lib/utils'

export function EncabezadoEditor({
  estado,
  hoy,
  editable,
  cambios,
  guardando,
  ocupado,
  alGuardar,
  acciones,
}: {
  estado: EstadoEditor
  hoy: string
  editable: boolean
  cambios: boolean
  guardando: boolean
  /** Alguna acción corre: todos los botones de acción quedan deshabilitados (decisión 12). */
  ocupado: boolean
  alGuardar: () => void
  /** Botones de transición y menú ⋯ (Task 12), a la derecha de Guardar. Botones size="lg" (h-9). */
  acciones?: React.ReactNode
}) {
  const resumen = resumenEncabezado(estado, hoy)

  return (
    <EncabezadoPagina
      compacto
      titulo={resumen.titulo}
      extra={<EstadoCotizacion estado={estado.estado} vencida={resumen.vence?.vencida ?? false} />}
      descripcion={
        <>
          {resumen.detalle}
          {resumen.vence ? (
            <>
              {' · '}
              <span className={cn(resumen.vence.vencida && 'text-amber-700')}>{resumen.vence.texto}</span>
            </>
          ) : null}
        </>
      }
      acciones={
        <>
          {editable ? (
            // Debajo de 72rem Guardar está en la barra fija de abajo (BarraInferior).
            <Button
              type="button"
              variant="outline"
              size="lg"
              onClick={alGuardar}
              disabled={ocupado || (estado.id !== null && !cambios)}
              className="hidden min-[72rem]:inline-flex"
            >
              {guardando ? 'Guardando…' : 'Guardar'}
            </Button>
          ) : null}
          {acciones}
        </>
      }
    />
  )
}
```

`BarraInferior` (relev-visual §3.11): fija abajo, se esconde desde 72rem. Lleva el estado de guardado, el hueco `vistaPrevia` (Task 11) y Guardar como primario. Sin hueco para transiciones: en el celular quedan en el encabezado, con el primario y el ⋯ (decisión 16; relev-visual §3.11 las ponía en un ⋯ de la barra).

```tsx
'use client'
// src/components/cotizaciones/editor/barra-inferior.tsx

import { Button } from '@/components/ui/button'

/**
 * Barra fija abajo cuando no hay columna de vista previa (< 72rem): Guardar siempre a mano sin volver sticky el
 * encabezado. `vistaPrevia` (Task 11) es un hueco. Las transiciones no van acá: quedan en el encabezado (decisión 16).
 */
export function BarraInferior({
  editable,
  esNueva,
  cambios,
  guardando,
  ocupado,
  alGuardar,
  vistaPrevia,
}: {
  editable: boolean
  esNueva: boolean
  cambios: boolean
  guardando: boolean
  ocupado: boolean
  alGuardar: () => void
  vistaPrevia?: React.ReactNode
}) {
  if (!editable && !vistaPrevia) return null
  const estadoGuardado = esNueva ? 'Todavía no se guardó' : cambios ? 'Cambios sin guardar' : 'Todo guardado'

  return (
    <div className="fixed inset-x-0 bottom-0 z-20 flex items-center gap-2 border-t bg-background/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-60 min-[72rem]:hidden">
      <p aria-live="polite" className="mr-auto min-w-0 truncate text-sm text-muted-foreground">
        {editable ? estadoGuardado : null}
      </p>
      {vistaPrevia}
      {editable ? (
        <Button
          type="button"
          size="lg"
          onClick={alGuardar}
          disabled={ocupado || (!esNueva && !cambios)}
          className="h-10 px-4 text-[15px] shadow-md shadow-primary/20"
        >
          {guardando ? 'Guardando…' : 'Guardar'}
        </Button>
      ) : null}
    </div>
  )
}
```

`EditorCotizacion`: reducer, versión guardada, guardar (validación local con `payloadGuardar` antes de llamar al servidor, errores por ruta en cada campo, `router.replace` al crear), foco al primer error, Ctrl/⌘+S y aviso `beforeunload` con cambios sin guardar. Aprobada, rechazada (y cualquier estado no editable) quedan en un `fieldset disabled` legible.

```tsx
'use client'
// src/components/cotizaciones/editor/editor-cotizacion.tsx

import { unstable_rethrow, useRouter } from 'next/navigation'
import { useEffect, useEffectEvent, useMemo, useReducer, useRef, useState } from 'react'
import { toast } from 'sonner'
import { guardarCotizacion } from '@/app/(app)/cotizaciones/actions'
import { Contenido } from '@/components/app-shell/encabezado'
import { Alert, AlertDescription } from '@/components/ui/alert'
import {
  hayCambios,
  payloadGuardar,
  pendientesEditor,
  reducirEditor,
  type AccionEditor,
  type CatalogosEditor,
  type EstadoEditor,
} from '@/lib/cotizaciones/editor'
import { erroresSinCampo, type ContactoEditor } from '@/lib/cotizaciones/editor-pantalla'
import { BarraInferior } from './barra-inferior'
import { EncabezadoEditor } from './encabezado-editor'
import { TarjetaAsunto } from './tarjeta-asunto'
import { TarjetaCliente } from './tarjeta-cliente'
import { TarjetaDatos } from './tarjeta-datos'

export type VersionGuardada = { id: string; version: string; numero: number }

export function EditorCotizacion({
  inicial,
  catalogos,
  contactos: contactosIniciales,
  hoy,
}: {
  inicial: EstadoEditor
  catalogos: CatalogosEditor
  /** Contactos del cliente de `inicial` (vacío en una nueva). */
  contactos: ContactoEditor[]
  /** Hoy en Argentina ('YYYY-MM-DD'), calculado en el servidor. */
  hoy: string
}) {
  const router = useRouter()
  const [estado, despachar] = useReducer(reducirEditor, inicial)
  /** Lo último guardado (o lo que vino de la página): contra esto se calculan los cambios. */
  const [guardado, setGuardado] = useState(inicial)
  const [contactos, setContactos] = useState(contactosIniciales)
  const [errores, setErrores] = useState<Record<string, string>>({})
  const [aviso, setAviso] = useState<string | null>(null)
  /** Qué acción corre ('guardar'; la Task 12 suma las suyas). Con una en curso se deshabilitan todas (decisión 12). */
  const [accion, setAccion] = useState<string | null>(null)
  const enCurso = useRef(false)
  const raiz = useRef<HTMLDivElement>(null)

  const cambios = useMemo(() => hayCambios(guardado, estado), [guardado, estado])
  const pendientes = useMemo(() => pendientesEditor(estado, catalogos), [estado, catalogos])
  const editable = estado.origen === 'app' && (estado.estado === 'borrador' || estado.estado === 'enviada')
  const ocupado = accion !== null
  const sueltos = erroresSinCampo(errores)

  function mostrarErrores(mensaje: string, nuevos: Record<string, string>) {
    setAviso(mensaje)
    setErrores(nuevos)
  }

  /**
   * Guarda y devuelve la versión nueva; null si no se pudo (el motivo queda a la vista). En una ya guardada y sin
   * cambios no llama al servidor y devuelve la versión actual (las transiciones de la Task 12 guardan primero).
   * Al crear navega a /cotizaciones/{id}; con `navegar: false` no: enviar y aprobar una nueva (Task 12) guardan,
   * hacen la transición con el id que vuelve y navegan después (decisión 12).
   */
  async function guardar({ navegar = true }: { navegar?: boolean } = {}): Promise<VersionGuardada | null> {
    if (!editable || enCurso.current) return null
    if (estado.id !== null && estado.version !== null && estado.numero !== null && !cambios) {
      return { id: estado.id, version: estado.version, numero: estado.numero }
    }
    const enviado = estado
    const validacion = payloadGuardar(enviado)
    if (!validacion.ok) {
      mostrarErrores('Revisá los datos marcados', validacion.errores)
      return null
    }
    enCurso.current = true
    setAccion('guardar')
    try {
      const resultado = await guardarCotizacion(enviado)
      if (!resultado.ok) {
        mostrarErrores(resultado.mensaje, resultado.errores ?? {})
        return null
      }
      const { id, version, numero } = resultado.datos
      const guardadoAhora: AccionEditor = { tipo: 'guardado', id, version, numero }
      // Lo que se mandó pasa a ser lo guardado; lo tipeado mientras tanto sigue contando como cambio.
      setGuardado(reducirEditor(enviado, guardadoAhora))
      despachar(guardadoAhora)
      setErrores({})
      setAviso(null)
      if (enviado.id === null) {
        toast.success(`Cotización N° ${numero} creada`)
        // replace: "Atrás" no vuelve a una cotización nueva vacía (decisión 8).
        if (navegar) router.replace(`/cotizaciones/${id}`)
      } else {
        toast.success('Cotización guardada')
      }
      return resultado.datos
    } catch (error) {
      unstable_rethrow(error)
      mostrarErrores('No se pudo guardar. Probá de nuevo en un momento.', {})
      return null
    } finally {
      enCurso.current = false
      setAccion(null)
    }
  }

  // Con errores, el foco va al primer campo marcado (como FormularioAccion).
  useEffect(() => {
    if (Object.keys(errores).length === 0) return
    raiz.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [errores])

  // Ctrl/⌘+S guarda (y nunca abre el "Guardar como…" del navegador). Con una acción en curso no hace nada,
  // igual que el botón deshabilitado (decisión 12).
  const alTeclear = useEffectEvent((evento: KeyboardEvent) => {
    if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === 's') {
      evento.preventDefault()
      if (!ocupado) void guardar()
    }
  })
  useEffect(() => {
    const escuchar = (evento: KeyboardEvent) => alTeclear(evento)
    window.addEventListener('keydown', escuchar)
    return () => window.removeEventListener('keydown', escuchar)
  }, [])

  // Cerrar o recargar la pestaña con cambios sin guardar pide confirmación al navegador.
  useEffect(() => {
    if (!cambios) return
    const avisar = (evento: BeforeUnloadEvent) => {
      evento.preventDefault()
      evento.returnValue = ''
    }
    window.addEventListener('beforeunload', avisar)
    return () => window.removeEventListener('beforeunload', avisar)
  }, [cambios])

  return (
    <div ref={raiz}>
      <Contenido className="pb-28 min-[72rem]:pb-8">
        <EncabezadoEditor
          estado={estado}
          hoy={hoy}
          editable={editable}
          cambios={cambios}
          guardando={accion === 'guardar'}
          ocupado={ocupado}
          alGuardar={() => void guardar()}
        />
        {/* Task 12: FranjasEditor (estado, pendientes y confirmaciones) va acá, antes del aviso de errores. */}
        {aviso ? (
          <Alert variant="destructive">
            <AlertDescription>
              <p>{aviso}</p>
              {sueltos.length ? (
                <ul className="list-disc pl-5">
                  {sueltos.map((mensaje) => (
                    <li key={mensaje}>{mensaje}</li>
                  ))}
                </ul>
              ) : null}
            </AlertDescription>
          </Alert>
        ) : null}
        <div className="grid items-start gap-5 min-[72rem]:grid-cols-[minmax(0,1fr)_20rem] 2xl:grid-cols-[minmax(0,1fr)_26rem]">
          {/* Aprobada o rechazada: todo de solo lectura, pero legible (sin la opacidad de :disabled). */}
          <fieldset
            disabled={!editable}
            className="min-w-0 space-y-4 [&_:disabled]:opacity-100! [&_[data-slot=native-select-wrapper]]:opacity-100!"
          >
            <legend className="sr-only">Contenido de la cotización</legend>
            <TarjetaCliente
              estado={estado}
              contactos={contactos}
              errores={errores}
              despachar={despachar}
              alCambiarContactos={setContactos}
            />
            <TarjetaDatos
              estado={estado}
              catalogos={catalogos}
              pendientes={pendientes}
              errores={errores}
              despachar={despachar}
            />
            <TarjetaAsunto estado={estado} errores={errores} despachar={despachar} />
            {/* Ítems (Task 9) */}
            {/* Textos (Task 10) */}
          </fieldset>
          <aside aria-label="Vista previa" className="sticky top-18 hidden self-start min-[72rem]:block">
            {/* Task 11: <PanelVistaPrevia …/> reemplaza este marco vacío (pozo gris con la hoja A4). */}
            <div className="rounded-xl bg-muted p-3">
              <div className="aspect-[210/297] w-full rounded-[2px] bg-white shadow-md ring-1 ring-black/5" />
            </div>
          </aside>
        </div>
      </Contenido>
      <BarraInferior
        editable={editable}
        esNueva={estado.id === null}
        cambios={cambios}
        guardando={accion === 'guardar'}
        ocupado={ocupado}
        alGuardar={() => void guardar()}
      />
    </div>
  )
}
```

Notas para quien implemente:
- `setAccion` y `mostrarErrores` quedan sin usar fuera de `guardar` hasta la Task 12; no generan warnings porque se usan adentro.
- No pasar `key` con la versión al editor: la página se vuelve a renderizar después de guardar (revalidatePath) y el reducer tiene que conservar lo que hay en pantalla.

- [ ] **Step 10: Vista mínima de cargadas y directas, y las páginas**

```tsx
// src/components/cotizaciones/cotizacion-solo-lectura.tsx

import { ArrowLeft, FileText } from 'lucide-react'
import Link from 'next/link'
import { Contenido, EncabezadoPagina } from '@/components/app-shell/encabezado'
import { EstadoCotizacion } from '@/components/cotizaciones/estado-cotizacion'
import { Button } from '@/components/ui/button'
import { formatFechaCorta } from '@/lib/format/fechas'

const ORIGEN = {
  importada: 'Cargada desde un PDF.',
  directa: 'Presupuesto directo: no tiene PDF.',
} as const

/** Cotización cargada o presupuesto directo: no se editan (decisión 24). La vista completa llega en el plan 3C. */
export function CotizacionSoloLectura({
  cotizacion,
}: {
  cotizacion: {
    id: string
    numero: number
    origen: keyof typeof ORIGEN
    estado: string
    vencida: boolean
    fecha: string
    cliente: string
    asunto: string
    tienePdf: boolean
  }
}) {
  return (
    <Contenido>
      <EncabezadoPagina
        compacto
        titulo={`Cotización N° ${cotizacion.numero}`}
        extra={<EstadoCotizacion estado={cotizacion.estado} vencida={cotizacion.vencida} />}
        descripcion={`${cotizacion.cliente} · ${formatFechaCorta(cotizacion.fecha)}`}
        acciones={
          cotizacion.tienePdf ? (
            <Button asChild variant="outline" size="lg">
              <a href={`/cotizaciones/${cotizacion.id}/pdf`} target="_blank" rel="noreferrer">
                <FileText aria-hidden />
                Ver el PDF original
              </a>
            </Button>
          ) : null
        }
      />
      <div className="max-w-3xl space-y-1 rounded-lg border bg-muted px-4 py-3 text-sm">
        <p>{ORIGEN[cotizacion.origen]}</p>
        {cotizacion.asunto ? (
          <p className="text-muted-foreground [overflow-wrap:anywhere]">Trabajo: {cotizacion.asunto}</p>
        ) : null}
      </div>
      <Link
        href="/cotizaciones"
        className="inline-flex items-center gap-1.5 text-[15px] text-primary underline-offset-4 hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Volver a Cotizaciones
      </Link>
    </Contenido>
  )
}
```

Página nueva: plantilla por defecto = la primera activa por nombre (decisión 10; los catálogos vienen ordenados, así que hoy es "Mensual - Grúa con operador"); firmante por defecto según la decisión 9.

```tsx
// src/app/(app)/cotizaciones/nueva/page.tsx
import type { Metadata } from 'next'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { EditorCotizacion } from '@/components/cotizaciones/editor/editor-cotizacion'
import { estadoNuevo } from '@/lib/cotizaciones/editor'
import { firmantePorDefecto } from '@/lib/cotizaciones/editor-pantalla'
import { leerCatalogosEditor, leerUltimoFirmante } from '@/lib/cotizaciones/lecturas-editor'
import { hoyArgentina } from '@/lib/format/fechas'
import { createClient } from '@/lib/supabase/server'

export const metadata: Metadata = { title: 'Nueva cotización' }

export default async function NuevaCotizacionPage() {
  const supabase = await createClient()
  const catalogos = await leerCatalogosEditor(supabase)
  const ultimoFirmante = await leerUltimoFirmante(supabase, catalogos.firmantes)
  const hoy = hoyArgentina()
  const inicial = estadoNuevo({
    plantilla: catalogos.plantillas[0] ?? null,
    firmanteId: firmantePorDefecto(catalogos.firmantes, ultimoFirmante),
    hoy,
  })

  return (
    <>
      <BarraMigas migas={[{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: 'Nueva' }]} />
      <EditorCotizacion inicial={inicial} catalogos={catalogos} contactos={[]} hoy={hoy} />
    </>
  )
}
```

Página de una cotización: lee la fila con `SELECT_EDITOR` (Task 3, cuyo test comprueba que el tipo inferido encaja en `FilaEditor`) más `cliente_id`, sobre la tabla `cotizaciones`. `estadoDesdeFila` ya ordena los ítems. En la vista de solo lectura, "vencida" se calcula como en `v_cotizaciones` (enviada y `fecha + validez_dias < hoy`).

```tsx
// src/app/(app)/cotizaciones/[id]/page.tsx
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BarraMigas } from '@/components/app-shell/encabezado'
import { CotizacionSoloLectura } from '@/components/cotizaciones/cotizacion-solo-lectura'
import { EditorCotizacion } from '@/components/cotizaciones/editor/editor-cotizacion'
import { SELECT_EDITOR, estadoDesdeFila } from '@/lib/cotizaciones/editor'
import { leerCatalogosEditor, leerContactos } from '@/lib/cotizaciones/lecturas-editor'
import { hoyArgentina, sumarDias } from '@/lib/format/fechas'
import { createClient } from '@/lib/supabase/server'
import { esUuid } from '@/lib/validacion'

export const metadata: Metadata = { title: 'Cotización' }

/** FilaEditor (Task 3) más el id del cliente, para leer sus contactos. */
const COLUMNAS = `${SELECT_EDITOR}, cliente_id` as const

export default async function CotizacionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  if (!esUuid(id)) notFound()

  const supabase = await createClient()
  const { data: fila, error } = await supabase.from('cotizaciones').select(COLUMNAS).eq('id', id).maybeSingle()
  if (error) throw error
  if (!fila) notFound()

  const migas = [{ texto: 'Cotizaciones', href: '/cotizaciones' }, { texto: `N° ${fila.numero}` }]

  if (fila.origen !== 'app') {
    const hoy = hoyArgentina()
    return (
      <>
        <BarraMigas migas={migas} />
        <CotizacionSoloLectura
          cotizacion={{
            id: fila.id,
            numero: fila.numero,
            origen: fila.origen === 'directa' ? 'directa' : 'importada',
            estado: fila.estado,
            // Como v_cotizaciones: el día del vencimiento todavía no cuenta.
            vencida: fila.estado === 'enviada' && sumarDias(fila.fecha, fila.validez_dias) < hoy,
            fecha: fila.fecha,
            cliente: fila.cliente.razon_social,
            asunto: fila.asunto,
            tienePdf: fila.archivo_original_path !== null,
          }}
        />
      </>
    )
  }

  const [catalogos, contactos] = await Promise.all([
    leerCatalogosEditor(supabase, {
      plantillaId: fila.plantilla_id,
      equipoId: fila.equipo_id,
      firmanteId: fila.firmante_id,
    }),
    leerContactos(supabase, fila.cliente_id),
  ])
  const inicial = estadoDesdeFila(fila)

  return (
    <>
      <BarraMigas migas={migas} />
      <EditorCotizacion inicial={inicial} catalogos={catalogos} contactos={contactos} hoy={hoyArgentina()} />
    </>
  )
}
```

```bash
npm run typecheck && npm run lint
npm run test:e2e -- tests/e2e/cotizaciones.spec.ts -g "editor de cotizaciones"
```

Expected: typecheck y lint sin errores; los 2 tests E2E en PASS.

- [ ] **Step 11: Verificación visual contra la 03**

Capturar el editor a 1200×805 (y a 390 para el celular) y compararlo con la referencia escalada. Dejar todo en el scratchpad.

```bash
S=/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/plan3b-capturas
mkdir -p "$S"
magick docs/diseno/referencias/03-editor-cotizacion.png -resize 1200x "$S/ref-03.png"
# Solo si no hay un servidor en el puerto 3000 (anotá el PID para matar solo ese):
npm run dev > "$S/dev.log" 2>&1 & echo $! > "$S/dev.pid"
node -e "const t=Date.now();(async function f(){try{if((await fetch('http://localhost:3000/api/health')).ok)return}catch{}if(Date.now()-t>120000)process.exit(1);setTimeout(f,1000)})()"
```

Escribir `$S/editor-08.mjs`:

```js
// Captura del editor (Task 8) a 1200×805 y a 390 de ancho.
import { createRequire } from 'node:module'
const require = createRequire('/Users/guidoolguin/Desktop/equipos-patagonicos/package.json')
const { chromium } = require('@playwright/test')

const S = new URL('.', import.meta.url).pathname
const BASE = 'http://localhost:3000'
const navegador = await chromium.launch()
try {
  const page = await navegador.newPage({
    viewport: { width: 1200, height: 805 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  })
  page.setDefaultTimeout(60_000)
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill('e2e@equipos.test')
  await page.getByLabel('Contraseña').fill('E2e-1234-segura')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('heading', { name: 'Inicio' }).waitFor()

  await page.goto(`${BASE}/cotizaciones/nueva`)
  await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
  await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('milicic')
  await page.getByRole('option', { name: /Milicic S\.A\./ }).click()
  await page.getByText('Yanina Colman').waitFor({ state: 'attached' })
  await page.getByRole('radio', { name: 'Por jornada' }).click()
  await page.getByLabel('Equipo', { exact: true }).selectOption({ label: 'Grúa telescópica XCMG 70 TN' })
  await page.getByLabel('Horario', { exact: true }).fill('lunes a viernes de 8 a 17 h')
  await page.getByLabel('Forma de pago', { exact: true }).fill('30 días F.F.')
  await page.mouse.click(5, 400)
  await page.screenshot({ path: `${S}08-editor-1200.png` })
  await page.mouse.wheel(0, 600)
  await page.screenshot({ path: `${S}08-editor-1200-abajo.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  console.log(desborda ? 'MAL: hay scroll horizontal a 390' : 'OK: sin scroll horizontal a 390')
  await page.screenshot({ path: `${S}08-editor-390.png`, fullPage: true })
} finally {
  await navegador.close()
}
```

```bash
node "$S/editor-08.mjs"
```

Abrir `ref-03.png`, `08-editor-1200.png`, `08-editor-1200-abajo.png` y `08-editor-390.png` con la herramienta de lectura de imágenes y revisar:
- **Encabezado en una sola fila a 1200:** título de 28 px semibold, pastilla "Borrador" al lado y "Guardar" outline (h-9) a la derecha; bajada "Por jornada · dd/mm/aaaa" en gris.
- **Columnas:** izquierda ≈ x 276–824 (548 px), derecha 320 px con el pozo gris y la hoja A4 vacía; 20 px entre columnas; arranque de las tarjetas a la misma altura que en la referencia.
- **Cliente:** combo ≈ 3/5 y "Atte.: Yanina Colman" ≈ 2/5 con el prefijo gris dentro del mismo borde, 10 px entre los dos.
- **Datos:** control segmentado (h-8, fondo gris, opción activa blanca con sombra) arriba; grilla de 2 columnas con etiquetas de 13 px grises e inputs h-8; la marca amarilla `{{ubicacion}}` alineada con el texto del input vacío; Fecha, Validez y Firma en una fila de 3.
- **Tarjetas:** 16 px entre tarjetas, radio 12 px, borde fino, sombra suave, fondo de página blanco.
- **390:** sin scroll horizontal (el script lo informa), Cliente y Atte. apilados, barra fija abajo con "Todavía no se guardó" y "Guardar".

Diferencias buscadas (no corregir): fondo blanco (decisión 21); sin "Descargar y marcar enviada" ni "Aprobar" todavía (Task 12); la vista previa vacía (Task 11); la tarjeta "Asunto e introducción" y los campos extra (fecha, validez, firma, próxima actualización como mes) que la imagen no tiene; título de 28 px en vez de 30 en negrita (relev-visual §3.2). Ajustar clases hasta que lo demás coincida. Después matar solo el servidor propio:

```bash
kill "$(cat "$S/dev.pid")" 2>/dev/null || lsof -ti tcp:3000 | xargs kill
```

- [ ] **Step 12: Verificar todo y commit**

```bash
npm run check && npm run test:int && npm run test:e2e
```

Expected: todo en verde (lint, typecheck, unitarios, integración y E2E, incluidos los de las tareas anteriores).

```bash
git add src/lib/cotizaciones/editor-pantalla.ts src/lib/cotizaciones/editor-pantalla.test.ts \
  src/lib/cotizaciones/lecturas-editor.ts tests/integration/cotizaciones-lecturas.test.ts \
  src/components/formulario/confirmacion-en-lugar.tsx src/components/cotizaciones/cotizacion-solo-lectura.tsx \
  src/components/cotizaciones/editor "src/app/(app)/cotizaciones/nueva/page.tsx" \
  "src/app/(app)/cotizaciones/[id]/page.tsx" tests/e2e/cotizaciones.spec.ts
git commit -m "feat: editor de cotizaciones con cliente, datos, asunto y guardado

- Páginas nueva y [id]; vista mínima de solo lectura para cargadas y directas
- Combobox de cliente con alta rápida y Atte. con el último contacto usado
- Datos que alimentan las variables, con la marca amarilla en los vacíos
- Guardar con errores por campo, Ctrl/⌘+S y aviso de cambios sin guardar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 9: Editor — grilla de ítems

La tarjeta Ítems del editor (relev-visual §3.5): grilla CSS (no `<table>`) que se puede arrastrar con dnd-kit (mouse y teclado), Enter agrega una fila debajo y la enfoca, Tab recorre la fila, los precios pegados se entienden con `parsePrecio` y al salir del campo se muestran con `formatMontoTabla` (sin "$"), las secciones son filas de encabezado editables, el agarre abre un menú (Subir, Bajar, Duplicar fila, Eliminar), cada línea muestra su total y el switch "Total en el PDF" maneja `mostrar_total`. En tarjetas de menos de 33rem cada ítem ocupa dos líneas. Los errores de guardado llegan por ruta (`items.N.campo`) y se muestran en la fila.

**Files:**
- Create: `src/lib/cotizaciones/grilla.ts`, `src/lib/cotizaciones/grilla.test.ts`
- Create: `src/components/cotizaciones/editor/tarjeta-items.tsx`
- Modify: `src/components/cotizaciones/editor/editor-cotizacion.tsx`
- Modify: `tests/e2e/cotizaciones.spec.ts`
- Test: `src/lib/cotizaciones/grilla.test.ts`, `tests/e2e/cotizaciones.spec.ts`

**Usa de tareas anteriores:**
- Task 3 (`src/lib/cotizaciones/editor.ts`): `ItemEditor`, y las acciones `agregarItem` (con `despuesDe` y `seccion`), `item`, `moverItem`, `quitarItem`, `duplicarItem`, `renombrarSeccion`, `agregarSeccion` y `mostrarTotal` de `AccionEditor`, con las reglas que fijan sus tests: `agregarItem` inserta la fila nueva justo después de `despuesDe` (o al final) copiando sección y unidad de la de referencia; `duplicarItem` deja la copia justo después del original; `agregarSeccion` agrega al final una fila vacía con esa sección; `moverItem` mueve como `arrayMove` y, si la fila cae en el medio de otro grupo, toma esa sección (esta tarea no la toca); `renombrarSeccion` renombra la racha de esa fila y la junta con el grupo vecino si queda con el mismo nombre (por eso esta tarea lo despacha al salir del campo o con Enter, no en cada tecla).
- Task 6: `Switch` (`src/components/ui/switch.tsx`), `@dnd-kit/core`, `@dnd-kit/sortable` y `@dnd-kit/utilities` instalados; `Tarjeta` sin ícono.
- Task 8: `EditorCotizacion` con el hueco `{/* Ítems (Task 9) */}`, el tipo `Despachar` (`src/lib/cotizaciones/editor-pantalla.ts`) y el bloque de E2E del editor.

---

- [ ] **Step 1: Lógica de la grilla — tests que fallan**

```ts
// src/lib/cotizaciones/grilla.test.ts
import { describe, expect, it } from 'vitest'
import {
  destinoFoco,
  filasGrilla,
  leerCantidad,
  nombreSeccionNueva,
  normalizarPrecio,
  totalGeneral,
  totalLinea,
  vecinoAlQuitar,
} from './grilla'

const item = (clave: string, seccion = '', cantidad = '1', precio = '') => ({ clave, seccion, cantidad, precio })

describe('filasGrilla', () => {
  it('sin secciones son solo ítems', () => {
    expect(filasGrilla([item('a'), item('b')])).toEqual([
      { tipo: 'item', indice: 0 },
      { tipo: 'item', indice: 1 },
    ])
  })

  it('un encabezado por cada grupo consecutivo, con la clave y el índice de su primer ítem', () => {
    expect(
      filasGrilla([item('a', 'Precios Jornada'), item('b', 'Precios Jornada'), item('c', 'Precios Jornada Adicional')]),
    ).toEqual([
      { tipo: 'seccion', clave: 'a', indice: 0, seccion: 'Precios Jornada', numero: 1 },
      { tipo: 'item', indice: 0 },
      { tipo: 'item', indice: 1 },
      { tipo: 'seccion', clave: 'c', indice: 2, seccion: 'Precios Jornada Adicional', numero: 2 },
      { tipo: 'item', indice: 2 },
    ])
  })

  it('un ítem sin sección entre dos grupos lleva su propio encabezado, como en el PDF', () => {
    expect(filasGrilla([item('a', 'X'), item('b'), item('c', 'X')]).filter((fila) => fila.tipo === 'seccion')).toEqual([
      { tipo: 'seccion', clave: 'a', indice: 0, seccion: 'X', numero: 1 },
      { tipo: 'seccion', clave: 'b', indice: 1, seccion: '', numero: 2 },
      { tipo: 'seccion', clave: 'c', indice: 2, seccion: 'X', numero: 3 },
    ])
  })
})

describe('leerCantidad', () => {
  it('entiende la coma decimal y exige más de 0', () => {
    expect(leerCantidad('1')).toBe(1)
    expect(leerCantidad('2,5')).toBe(2.5)
    expect(leerCantidad('0')).toBeNull()
    expect(leerCantidad('')).toBeNull()
    expect(leerCantidad('-1')).toBeNull()
    expect(leerCantidad('dos')).toBeNull()
  })
})

describe('normalizarPrecio', () => {
  it('muestra con formato lo que se escribió o pegó, sin "$"', () => {
    expect(normalizarPrecio('39000000')).toBe('39.000.000,00')
    expect(normalizarPrecio('39.000.000')).toBe('39.000.000,00')
    expect(normalizarPrecio('39.000.000,00')).toBe('39.000.000,00')
    expect(normalizarPrecio('$ 1.950.000.-')).toBe('1.950.000,00')
    expect(normalizarPrecio('2.5')).toBe('2,50')
  })

  it('lo que no es un monto queda como está (lo marca la validación)', () => {
    expect(normalizarPrecio(' abc ')).toBe('abc')
    expect(normalizarPrecio('39000000\t5000')).toBe('39000000\t5000')
    expect(normalizarPrecio('  ')).toBe('')
  })
})

describe('totalLinea', () => {
  it('cantidad por precio, redondeado a centavos', () => {
    expect(totalLinea({ cantidad: '2', precio: '1.950.000,00' })).toBe(3_900_000)
    expect(totalLinea({ cantidad: '1,5', precio: '100,10' })).toBe(150.15)
  })

  it('sin precio o con una cantidad inválida no hay total', () => {
    expect(totalLinea({ cantidad: '1', precio: '' })).toBeNull()
    expect(totalLinea({ cantidad: '0', precio: '10' })).toBeNull()
  })
})

describe('totalGeneral', () => {
  it('suma solo si todos los ítems tienen total, y cuenta los que no tienen precio', () => {
    expect(totalGeneral([item('a', '', '2', '1.950.000'), item('b', '', '1', '195.000')])).toEqual({
      total: 4_095_000,
      sinPrecio: 0,
    })
    expect(totalGeneral([item('a', '', '2', '1.950.000'), item('b')])).toEqual({ total: null, sinPrecio: 1 })
    expect(totalGeneral([item('a', '', '0', '10')])).toEqual({ total: null, sinPrecio: 0 })
    expect(totalGeneral([])).toEqual({ total: null, sinPrecio: 0 })
  })
})

describe('nombreSeccionNueva', () => {
  it('numera después de los grupos que hay, sin repetir un nombre', () => {
    expect(nombreSeccionNueva([item('a', 'Precios Jornada'), item('b', 'Precios Jornada Adicional')])).toBe('Sección 3')
    expect(nombreSeccionNueva([item('a', 'Sección 2')])).toBe('Sección 3')
    expect(nombreSeccionNueva([item('a'), item('b')])).toBe('Sección 2')
    expect(nombreSeccionNueva([])).toBe('Sección 1')
  })
})

describe('destinoFoco', () => {
  const items = [item('a', 'X'), item('b', 'X'), item('c', 'Y'), item('d', 'Y')]

  it('la fila siguiente (después de agregar con Enter o duplicar)', () => {
    expect(destinoFoco({ tipo: 'siguiente', clave: 'a' }, items)).toEqual({ clave: 'b', campo: 'descripcion' })
    expect(destinoFoco({ tipo: 'siguiente', clave: 'd' }, items)).toBeNull()
    expect(destinoFoco({ tipo: 'siguiente', clave: 'z' }, items)).toBeNull()
  })

  it('una fila puntual, la última o el nombre de la última sección', () => {
    expect(destinoFoco({ tipo: 'item', clave: 'c' }, items)).toEqual({ clave: 'c', campo: 'descripcion' })
    expect(destinoFoco({ tipo: 'item', clave: 'z' }, items)).toBeNull()
    expect(destinoFoco({ tipo: 'ultimo' }, items)).toEqual({ clave: 'd', campo: 'descripcion' })
    expect(destinoFoco({ tipo: 'ultimo' }, [])).toBeNull()
    expect(destinoFoco({ tipo: 'seccionUltima' }, items)).toEqual({ clave: 'c', campo: 'seccion' })
  })
})

describe('vecinoAlQuitar', () => {
  it('el anterior; si era el primero, el siguiente; si era el único, ninguno', () => {
    const items = [item('a'), item('b'), item('c')]
    expect(vecinoAlQuitar(items, 'b')).toBe('a')
    expect(vecinoAlQuitar(items, 'a')).toBe('b')
    expect(vecinoAlQuitar([item('a')], 'a')).toBeNull()
    expect(vecinoAlQuitar(items, 'z')).toBeNull()
  })
})
```

```bash
npx vitest run src/lib/cotizaciones/grilla.test.ts
```

Expected: FAIL (`Failed to resolve import "./grilla"`).

- [ ] **Step 2: Implementar `grilla.ts`**

```ts
// src/lib/cotizaciones/grilla.ts
// Lógica de la grilla de ítems del editor: filas de sección, cantidades y precios escritos o pegados, totales y
// adónde va el foco después de agregar o borrar. Pura (UI y Vitest). Las reglas de las secciones al mover o
// renombrar están en el reducer (editor.ts).
import { formatMontoTabla, parsePrecio } from '@/lib/format/montos'
import type { ItemEditor } from './editor'

type ItemGrilla = Pick<ItemEditor, 'clave' | 'seccion'>

export type FilaSeccion = { tipo: 'seccion'; clave: string; indice: number; seccion: string; numero: number }
export type FilaGrilla = FilaSeccion | { tipo: 'item'; indice: number }

/**
 * Filas a dibujar. Si algún ítem tiene sección (la plantilla por jornada), cada grupo consecutivo de la misma
 * sección lleva un encabezado, igual que en el PDF; `clave` e `indice` son los de su primer ítem.
 */
export function filasGrilla(items: ItemGrilla[]): FilaGrilla[] {
  const conSecciones = items.some((item) => item.seccion.trim() !== '')
  const filas: FilaGrilla[] = []
  let numero = 0
  items.forEach((item, indice) => {
    if (conSecciones && (indice === 0 || items[indice - 1].seccion !== item.seccion)) {
      numero += 1
      filas.push({ tipo: 'seccion', clave: item.clave, indice, seccion: item.seccion, numero })
    }
    filas.push({ tipo: 'item', indice })
  })
  return filas
}

/** Cantidad escrita al estilo argentino ("1", "2,5"): un número mayor a 0, o null. */
export function leerCantidad(texto: string): number | null {
  const cantidad = parsePrecio(texto)
  return cantidad !== null && cantidad > 0 ? cantidad : null
}

/** Cómo queda la celda Precio al salir: "39000000" → "39.000.000,00". Lo que no es un monto queda igual. */
export function normalizarPrecio(texto: string): string {
  const precio = parsePrecio(texto)
  return precio === null ? texto.trim() : formatMontoTabla(precio)
}

const redondear = (valor: number) => Math.round(valor * 100) / 100

/** Cantidad × precio, redondeado a centavos; null si falta alguno o no se entiende. */
export function totalLinea(item: Pick<ItemEditor, 'cantidad' | 'precio'>): number | null {
  const cantidad = leerCantidad(item.cantidad)
  const precio = parsePrecio(item.precio)
  if (cantidad === null || precio === null) return null
  return redondear(cantidad * precio)
}

/** Total de la cotización (solo si todas las líneas tienen total, como el PDF) y cuántos ítems no tienen precio. */
export function totalGeneral(items: Pick<ItemEditor, 'cantidad' | 'precio'>[]): {
  total: number | null
  sinPrecio: number
} {
  const sinPrecio = items.filter((item) => parsePrecio(item.precio) === null).length
  const totales = items.map((item) => totalLinea(item))
  if (items.length === 0 || totales.some((total) => total === null)) return { total: null, sinPrecio }
  return { total: redondear(totales.reduce<number>((suma, total) => suma + (total ?? 0), 0)), sinPrecio }
}

/** Nombre para una sección nueva que no se confunda ni se pegue con las que ya hay. */
export function nombreSeccionNueva(items: ItemGrilla[]): string {
  const grupos = items.filter((item, indice) => indice === 0 || items[indice - 1].seccion !== item.seccion).length
  const nombres = new Set(items.map((item) => item.seccion))
  let numero = grupos + 1
  while (nombres.has(`Sección ${numero}`)) numero += 1
  return `Sección ${numero}`
}

export type PedidoFoco =
  /** La fila que quedó después de esta (Enter, Duplicar fila). */
  | { tipo: 'siguiente'; clave: string }
  /** Esta fila (la vecina de una que se borró). */
  | { tipo: 'item'; clave: string }
  /** La última fila (+ Agregar ítem). */
  | { tipo: 'ultimo' }
  /** El nombre de la última sección (+ Agregar sección). */
  | { tipo: 'seccionUltima' }

export type DestinoFoco = { clave: string; campo: 'descripcion' | 'seccion' }

/**
 * Adónde va el foco después de un cambio en la grilla. Se calcula con la lista ya actualizada porque las claves
 * nuevas las pone el reducer.
 */
export function destinoFoco(pedido: PedidoFoco, items: ItemGrilla[]): DestinoFoco | null {
  switch (pedido.tipo) {
    case 'siguiente': {
      const indice = items.findIndex((item) => item.clave === pedido.clave)
      const siguiente = indice === -1 ? undefined : items[indice + 1]
      return siguiente ? { clave: siguiente.clave, campo: 'descripcion' } : null
    }
    case 'item':
      return items.some((item) => item.clave === pedido.clave) ? { clave: pedido.clave, campo: 'descripcion' } : null
    case 'ultimo': {
      const ultimo = items.at(-1)
      return ultimo ? { clave: ultimo.clave, campo: 'descripcion' } : null
    }
    case 'seccionUltima': {
      let indice = items.length - 1
      if (indice < 0) return null
      while (indice > 0 && items[indice - 1].seccion === items[indice].seccion) indice -= 1
      return { clave: items[indice].clave, campo: 'seccion' }
    }
  }
}

/** El ítem que recibe el foco cuando se borra otro: el anterior; si era el primero, el siguiente. */
export function vecinoAlQuitar(items: ItemGrilla[], clave: string): string | null {
  const indice = items.findIndex((item) => item.clave === clave)
  if (indice === -1) return null
  return (items[indice - 1] ?? items[indice + 1])?.clave ?? null
}
```

```bash
npx vitest run src/lib/cotizaciones/grilla.test.ts
```

Expected: PASS.

- [ ] **Step 3: E2E de la grilla — test que falla**

Agregar al final de `tests/e2e/cotizaciones.spec.ts` (usa `expect`, `test` e `iniciarSesion`, ya importados por las tareas 7 y 8):

```ts
// ── Editor: grilla de ítems (Task 9) ──

test('la grilla de ítems se maneja con el teclado y entiende precios pegados', async ({ page }) => {
  await iniciarSesion(page)
  await page.goto('/cotizaciones/nueva')
  await page.getByRole('radio', { name: 'Por jornada' }).click()
  await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()

  const descripcion = (numero: number) => page.getByLabel(`Descripción del ítem ${numero}`, { exact: true })
  const precio = (numero: number) => page.getByLabel(`Precio del ítem ${numero}`, { exact: true })

  // La plantilla por jornada trae tres ítems sin precio en dos secciones.
  await expect(descripcion(1)).toHaveValue(/^Alquiler jornada de Grúa Telescópica/)
  await expect(page.getByLabel('Nombre de la sección 1', { exact: true })).toHaveValue('Precios Jornada')
  await expect(page.getByLabel('Nombre de la sección 2', { exact: true })).toHaveValue('Precios Jornada Adicional')

  // Un precio pegado sin formato queda con formato al salir del campo y calcula el total de la línea.
  await precio(1).fill('1950000')
  await page.getByLabel('Cantidad del ítem 1', { exact: true }).fill('2')
  await expect(precio(1)).toHaveValue('1.950.000,00')
  await expect(page.getByText('3.900.000,00')).toBeVisible()

  // Enter agrega una fila debajo (en la misma sección) y la enfoca; Tab recorre la fila.
  await descripcion(1).press('Enter')
  await expect(descripcion(2)).toBeFocused()
  await expect(descripcion(2)).toHaveValue('')
  await page.keyboard.type('Hora adicional de grúa')
  await page.keyboard.press('Tab')
  await expect(page.getByLabel('Cantidad del ítem 2', { exact: true })).toBeFocused()
  await page.keyboard.press('Tab')
  await expect(precio(2)).toBeFocused()
  await page.keyboard.type('$ 195.000')
  await page.keyboard.press('Tab')
  await expect(precio(2)).toHaveValue('195.000,00')
  await expect(page.getByLabel('Nombre de la sección 2', { exact: true })).toHaveValue('Precios Jornada Adicional')

  // El menú del agarre: subir y eliminar (el foco queda en la fila vecina).
  await page.getByRole('button', { name: 'Opciones del ítem 2' }).click()
  await page.getByRole('menuitem', { name: 'Subir' }).click()
  await expect(descripcion(1)).toHaveValue('Hora adicional de grúa')
  await page.getByRole('button', { name: 'Opciones del ítem 1' }).click()
  await page.getByRole('menuitem', { name: 'Eliminar' }).click()
  await expect(descripcion(1)).toHaveValue(/^Alquiler jornada de Grúa Telescópica/)
  await expect(descripcion(1)).toBeFocused()

  // Reordenar con el teclado: Espacio toma el ítem, la flecha lo mueve y Espacio lo suelta.
  const agarre = page.getByRole('button', { name: 'Opciones del ítem 2' })
  await agarre.focus()
  await page.keyboard.press('Space')
  await expect(agarre).toHaveAttribute('aria-pressed', 'true')
  await page.keyboard.press('ArrowUp')
  await expect(page.getByText('El ítem 2 pasa a la posición 1.')).toBeAttached()
  await page.keyboard.press('Space')
  await expect(descripcion(1)).toHaveValue('Movilización y desmovilización de Grúa Telescópica')

  // Total en el PDF: mientras falten precios, lo avisa.
  await page.getByRole('switch', { name: 'Total en el PDF' }).click()
  await expect(page.getByText('Falta el precio de 2 ítems')).toBeVisible()
})
```

```bash
npm run test:e2e -- tests/e2e/cotizaciones.spec.ts -g "grilla de ítems"
```

Expected: FAIL (no hay campos "Descripción del ítem 1": la tarjeta todavía no existe).

- [ ] **Step 4: Tarjeta Ítems**

Detalles que importan:
- El agarre (`GripVertical`) es a la vez el activador de dnd-kit y el disparador del menú. Radix abre el menú en `pointerdown`; para que un arrastre no lo abra, el `onPointerDown` del botón llama primero al listener de dnd-kit y después hace `preventDefault()` (Radix no actúa si el evento ya está prevenido), y el menú se abre en `onClick` si no hubo arrastre. Enter y ↓ abren el menú (Radix); Espacio toma y suelta el ítem (el `KeyboardSensor` usa solo Espacio), Escape cancela. Durante un arrastre con teclado el `onKeyDown` previene el evento para que las flechas no abran el menú.
- El foco después de agregar, duplicar o borrar se resuelve con `destinoFoco` en un efecto que corre cuando cambian los ítems (las claves nuevas las genera el reducer). Para Duplicar y Eliminar, `onCloseAutoFocus` del menú no devuelve el foco al agarre.
- El nombre de una sección se aplica al salir del campo o con Enter (borrador local): `renombrarSeccion` junta grupos con el mismo nombre y, aplicado en cada tecla, haría desaparecer el encabezado a mitad de escribir.
- El precio se ve tal cual mientras se escribe y con `formatMontoTabla` fuera del campo (también lo que viene de la base, que la Task 3 escribe como "1.950.000"); al salir, además, se guarda normalizado.
- Una línea por ítem desde `@min-[33rem]` (container query de la tarjeta): `1.25rem | 1fr | 3.25rem | 6.5rem | 6rem | 5.75rem`. Debajo, dos líneas: agarre y descripción, y abajo cantidad, precio y unidad con `display: contents` desde 33rem; el total va en una tercera línea con la palabra "Total".

```tsx
'use client'
// src/components/cotizaciones/editor/tarjeta-items.tsx

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type ScreenReaderInstructions,
  type UniqueIdentifier,
} from '@dnd-kit/core'
import { SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { ArrowDown, ArrowUp, Copy, GripVertical, Plus, Trash2 } from 'lucide-react'
import { useEffect, useId, useRef, useState } from 'react'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'
import type { ItemEditor } from '@/lib/cotizaciones/editor'
import type { Despachar } from '@/lib/cotizaciones/editor-pantalla'
import {
  destinoFoco,
  filasGrilla,
  nombreSeccionNueva,
  normalizarPrecio,
  totalGeneral,
  totalLinea,
  vecinoAlQuitar,
  type FilaSeccion,
  type PedidoFoco,
} from '@/lib/cotizaciones/grilla'
import { formatMontoTabla, parsePrecio } from '@/lib/format/montos'
import { UNIDADES, type Formato, type Unidad } from '@/lib/plantillas/contenido'
import { cn } from '@/lib/utils'

/** Una línea por ítem cuando la tarjeta mide 33rem o más: agarre, descripción, cantidad, precio, unidad, total. */
const COLUMNAS = '@min-[33rem]:grid-cols-[1.25rem_minmax(0,1fr)_3.25rem_6.5rem_6rem_5.75rem]'

/** Campo "fantasma": se ve como texto y muestra el borde al pasar o al enfocar (referencia 03). */
const FANTASMA =
  'border-transparent bg-transparent text-sm shadow-none hover:border-input focus-visible:border-ring md:text-sm dark:bg-transparent'

/** Espacio toma y suelta; Enter queda para abrir el menú del agarre. */
const TECLAS = { start: ['Space'], cancel: ['Escape'], end: ['Space'] }

const INSTRUCCIONES: ScreenReaderInstructions = {
  draggable:
    'Para mover el ítem, presioná Espacio, movelo con las flechas y presioná Espacio para soltarlo; Escape cancela. ' +
    'Enter abre las opciones.',
}

/**
 * Encabezado editable de una sección. El nombre se aplica al salir del campo o con Enter, no en cada tecla:
 * renombrarSeccion junta el grupo con el vecino si quedan con el mismo nombre, y a mitad de escribir
 * ("Precios Jornada Adicional" → "Precios Jornada") el encabezado desaparecería con el foco adentro.
 */
function EncabezadoSeccion({ fila, error, despachar }: { fila: FilaSeccion; error?: string; despachar: Despachar }) {
  const id = `seccion-${fila.clave}`
  const [borrador, setBorrador] = useState<string | null>(null)

  function aplicar() {
    if (borrador !== null && borrador !== fila.seccion) {
      despachar({ tipo: 'renombrarSeccion', clave: fila.clave, seccion: borrador })
    }
    setBorrador(null)
  }

  return (
    <div className="border-b bg-muted/60 py-1.5 pr-3 pl-9">
      <Input
        id={id}
        aria-label={`Nombre de la sección ${fila.numero}`}
        value={borrador ?? fila.seccion}
        maxLength={100}
        // Una sección sin nombre sale como "Precios:" en el PDF por jornada.
        placeholder="Precios"
        onChange={(evento) => setBorrador(evento.target.value)}
        onBlur={aplicar}
        onKeyDown={(evento) => {
          if (evento.key !== 'Enter' || evento.nativeEvent.isComposing) return
          evento.preventDefault()
          aplicar()
        }}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : undefined}
        className={cn(FANTASMA, 'h-7 px-2.5 font-semibold')}
      />
      {error ? (
        <p id={`${id}-error`} className="px-2.5 text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  )
}

type CampoItem = 'descripcion' | 'cantidad' | 'precio' | 'unidad'

function FilaItem({
  item,
  indice,
  cantidadItems,
  errores,
  despachar,
  alEnter,
  alMover,
  alDuplicar,
  alQuitar,
}: {
  item: ItemEditor
  indice: number
  cantidadItems: number
  errores: Record<string, string>
  despachar: Despachar
  alEnter: () => void
  alMover: (paso: -1 | 1) => void
  alDuplicar: () => void
  alQuitar: () => void
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = useSortable({
    id: item.clave,
    attributes: { roleDescription: 'ítem ordenable' },
  })
  const [menuAbierto, setMenuAbierto] = useState(false)
  // Mientras se escribe el precio se ve tal cual; fuera del campo, con formato ("1.950.000,00"), venga de donde venga
  // (lo cargado de la base llega como "1.950.000", textoPrecio de la Task 3).
  const [editandoPrecio, setEditandoPrecio] = useState(false)
  // Un clic sin mover abre el menú; el clic que llega al soltar después de arrastrar, no.
  const huboArrastre = useRef(false)
  // Duplicar y Eliminar llevan el foco a otra fila: el menú no lo devuelve al agarre al cerrarse.
  const mantenerFoco = useRef(false)
  useEffect(() => {
    if (isDragging) huboArrastre.current = true
  }, [isDragging])

  const numero = indice + 1
  const id = `item-${item.clave}`
  const error = (campo: CampoItem) => errores[`items.${indice}.${campo}`]
  const mensajes = (['descripcion', 'cantidad', 'precio', 'unidad'] as const).map(error).filter(Boolean)
  const describir = (campo: CampoItem) => (error(campo) ? `${id}-error` : undefined)
  const precioMalEscrito = item.precio.trim() !== '' && parsePrecio(item.precio) === null
  const total = totalLinea(item)
  const cambiar = (cambios: Partial<Omit<ItemEditor, 'clave'>>) => despachar({ tipo: 'item', clave: item.clave, cambios })

  // Enter (sin Shift, que deja escribir un salto en la descripción) agrega una fila debajo y la enfoca.
  function alTeclear(evento: React.KeyboardEvent) {
    if (evento.key !== 'Enter' || evento.shiftKey || evento.nativeEvent.isComposing) return
    evento.preventDefault()
    alEnter()
  }

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'grid grid-cols-[1.25rem_minmax(0,1fr)] items-start gap-x-1 gap-y-1.5 border-b bg-card px-3 py-2',
        COLUMNAS,
        isDragging && 'relative z-10 shadow-lg',
      )}
    >
      <DropdownMenu open={menuAbierto} onOpenChange={setMenuAbierto} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={setActivatorNodeRef}
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label={`Opciones del ítem ${numero}`}
            title="Arrastrá para mover; hacé clic para ver las opciones"
            className="mt-1 cursor-grab touch-none text-muted-foreground active:cursor-grabbing"
            {...attributes}
            onPointerDown={(evento) => {
              huboArrastre.current = false
              listeners?.onPointerDown?.(evento)
              // Sin esto Radix abriría el menú al apoyar, antes de saber si es un arrastre.
              evento.preventDefault()
            }}
            onKeyDown={(evento) => {
              listeners?.onKeyDown?.(evento)
              // Mientras se arrastra con el teclado, las flechas y Espacio son del arrastre, no del menú.
              if (isDragging) evento.preventDefault()
            }}
            onClick={(evento) => {
              // detail 0 = clic generado por el teclado: Enter ya abrió el menú y Espacio es para arrastrar.
              const ignorar = evento.detail === 0 || huboArrastre.current
              huboArrastre.current = false
              if (!ignorar) setMenuAbierto(true)
            }}
          >
            <GripVertical aria-hidden />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="start"
          className="w-44"
          onCloseAutoFocus={(evento) => {
            if (!mantenerFoco.current) return
            mantenerFoco.current = false
            evento.preventDefault()
          }}
        >
          <DropdownMenuItem disabled={indice === 0} onSelect={() => alMover(-1)}>
            <ArrowUp aria-hidden />
            Subir
          </DropdownMenuItem>
          <DropdownMenuItem disabled={indice === cantidadItems - 1} onSelect={() => alMover(1)}>
            <ArrowDown aria-hidden />
            Bajar
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              mantenerFoco.current = true
              alDuplicar()
            }}
          >
            <Copy aria-hidden />
            Duplicar fila
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => {
              mantenerFoco.current = true
              alQuitar()
            }}
          >
            <Trash2 aria-hidden />
            Eliminar
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Textarea
        id={`${id}-descripcion`}
        aria-label={`Descripción del ítem ${numero}`}
        rows={1}
        value={item.descripcion}
        placeholder="Descripción"
        onChange={(evento) => cambiar({ descripcion: evento.target.value })}
        onKeyDown={alTeclear}
        aria-invalid={Boolean(error('descripcion'))}
        aria-describedby={describir('descripcion')}
        className={cn(FANTASMA, 'min-h-8 resize-none px-2.5 py-1.5')}
      />

      {/* Angosta: cantidad, precio y unidad en una segunda línea. Desde 33rem, cada uno en su columna. */}
      <div className="col-start-2 flex flex-wrap gap-2 @min-[33rem]:contents">
        <Input
          id={`${id}-cantidad`}
          aria-label={`Cantidad del ítem ${numero}`}
          inputMode="decimal"
          value={item.cantidad}
          onChange={(evento) => cambiar({ cantidad: evento.target.value })}
          onKeyDown={alTeclear}
          aria-invalid={Boolean(error('cantidad'))}
          aria-describedby={describir('cantidad')}
          className="h-8 w-16 px-2 text-sm tabular-nums md:text-sm @min-[33rem]:w-full"
        />
        <Input
          id={`${id}-precio`}
          aria-label={`Precio del ítem ${numero}`}
          inputMode="decimal"
          value={editandoPrecio ? item.precio : normalizarPrecio(item.precio)}
          placeholder="Sin precio"
          onChange={(evento) => cambiar({ precio: evento.target.value })}
          onFocus={() => setEditandoPrecio(true)}
          onBlur={() => {
            setEditandoPrecio(false)
            const normal = normalizarPrecio(item.precio)
            if (normal !== item.precio) cambiar({ precio: normal })
          }}
          onKeyDown={alTeclear}
          aria-invalid={Boolean(error('precio')) || precioMalEscrito}
          aria-describedby={describir('precio')}
          className={cn(
            'h-8 min-w-28 flex-1 px-2.5 text-right text-sm tabular-nums md:text-sm @min-[33rem]:min-w-0',
            // Sin precio: borde visible y el amarillo de "falta completar" (decisión 17).
            item.precio.trim() === '' ? 'border-brand-yellow/70 bg-brand-yellow/10' : FANTASMA,
          )}
        />
        <NativeSelect
          id={`${id}-unidad`}
          size="sm"
          aria-label={`Unidad del ítem ${numero}`}
          value={item.unidad}
          onChange={(evento) => cambiar({ unidad: evento.target.value as Unidad })}
          aria-invalid={Boolean(error('unidad'))}
          aria-describedby={describir('unidad')}
          className="w-28 @min-[33rem]:w-full [&_select]:text-xs"
        >
          {UNIDADES.map((unidad) => (
            <NativeSelectOption key={unidad} value={unidad}>
              {unidad}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>

      <p className="col-start-2 text-right text-[13px] text-muted-foreground tabular-nums @min-[33rem]:col-start-auto @min-[33rem]:pt-1.5 @min-[33rem]:text-sm @min-[33rem]:text-foreground">
        <span className="@min-[33rem]:sr-only">Total </span>
        {total === null ? '—' : formatMontoTabla(total)}
      </p>

      {mensajes.length ? (
        <p id={`${id}-error`} className="col-start-2 text-sm text-destructive @min-[33rem]:col-span-5">
          {mensajes.join(' · ')}
        </p>
      ) : null}
    </div>
  )
}

export function TarjetaItems({
  items,
  formato,
  mostrarTotal,
  errores,
  despachar,
}: {
  items: ItemEditor[]
  formato: Formato
  mostrarTotal: boolean
  errores: Record<string, string>
  despachar: Despachar
}) {
  const idDnd = useId()
  const foco = useRef<PedidoFoco | 'agregar' | null>(null)
  const botonAgregar = useRef<HTMLButtonElement>(null)
  const sensores = useSensors(
    // 4 px de movimiento antes de arrastrar: un clic en el agarre abre el menú.
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates, keyboardCodes: TECLAS }),
  )
  const filas = filasGrilla(items)
  const { total, sinPrecio } = totalGeneral(items)

  // Después de agregar, duplicar o borrar, el foco va a la fila que corresponde (las claves las pone el reducer).
  useEffect(() => {
    const pedido = foco.current
    if (!pedido) return
    foco.current = null
    if (pedido === 'agregar') {
      botonAgregar.current?.focus()
      return
    }
    const destino = destinoFoco(pedido, items)
    if (!destino) return
    const elemento = document.getElementById(
      destino.campo === 'seccion' ? `seccion-${destino.clave}` : `item-${destino.clave}-descripcion`,
    )
    elemento?.focus()
    if (destino.campo === 'seccion' && elemento instanceof HTMLInputElement) elemento.select()
  }, [items])

  // Si el ítem cae en el medio de otro grupo, el reducer le pone esa sección (Task 3).
  function mover(desde: number, hasta: number) {
    if (desde === hasta || hasta < 0 || hasta >= items.length) return
    despachar({ tipo: 'moverItem', desde, hasta })
  }

  function agregarDespuesDe(item: ItemEditor) {
    foco.current = { tipo: 'siguiente', clave: item.clave }
    despachar({ tipo: 'agregarItem', despuesDe: item.clave, seccion: item.seccion })
  }

  function agregarAlFinal() {
    foco.current = { tipo: 'ultimo' }
    despachar({ tipo: 'agregarItem', seccion: items.at(-1)?.seccion ?? '' })
  }

  function agregarSeccion() {
    foco.current = { tipo: 'seccionUltima' }
    despachar({ tipo: 'agregarSeccion', nombre: nombreSeccionNueva(items) })
  }

  function duplicar(item: ItemEditor) {
    foco.current = { tipo: 'siguiente', clave: item.clave }
    despachar({ tipo: 'duplicarItem', clave: item.clave })
  }

  function quitar(item: ItemEditor) {
    const vecino = vecinoAlQuitar(items, item.clave)
    foco.current = vecino ? { tipo: 'item', clave: vecino } : 'agregar'
    despachar({ tipo: 'quitarItem', clave: item.clave })
  }

  function alSoltar({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return
    mover(
      items.findIndex((item) => item.clave === active.id),
      items.findIndex((item) => item.clave === over.id),
    )
  }

  const posicion = (id: UniqueIdentifier) => items.findIndex((item) => item.clave === id) + 1
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Tomaste el ítem ${posicion(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `El ítem ${posicion(active.id)} pasa a la posición ${posicion(over.id)}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste el ítem ${posicion(active.id)} en la posición ${posicion(over.id)}.`
        : `Soltaste el ítem ${posicion(active.id)}.`,
    onDragCancel: ({ active }) => `Se canceló el movimiento del ítem ${posicion(active.id)}.`,
  }

  return (
    <Tarjeta titulo="Ítems">
      {/* A sangre dentro de la tarjeta, como la tabla de ítems de la plantilla. */}
      <div className="-mx-5 -mb-5 border-t sm:-mx-6 sm:-mb-6">
        {items.length === 0 ? (
          <p className="px-5 py-6 text-[15px] text-muted-foreground sm:px-6">Todavía no hay ítems.</p>
        ) : (
          <>
            <div
              aria-hidden
              className={cn(
                'hidden h-10 items-center gap-x-1 border-b px-3 text-sm font-medium text-muted-foreground @min-[33rem]:grid',
                COLUMNAS,
              )}
            >
              <span />
              <span className="pl-2.5">Descripción</span>
              <span className="pl-2">Cant.</span>
              <span className="pr-2.5 text-right">Precio</span>
              <span className="pl-2.5">Unidad</span>
              <span className="text-right">Total</span>
            </div>
            <DndContext
              id={idDnd}
              sensors={sensores}
              collisionDetection={closestCenter}
              onDragEnd={alSoltar}
              accessibility={{ announcements: anuncios, screenReaderInstructions: INSTRUCCIONES }}
            >
              <SortableContext items={items.map((item) => item.clave)} strategy={verticalListSortingStrategy}>
                {filas.map((fila) =>
                  fila.tipo === 'seccion' ? (
                    <EncabezadoSeccion
                      key={`seccion-${fila.clave}`}
                      fila={fila}
                      error={errores[`items.${fila.indice}.seccion`]}
                      despachar={despachar}
                    />
                  ) : (
                    <FilaItem
                      key={items[fila.indice].clave}
                      item={items[fila.indice]}
                      indice={fila.indice}
                      cantidadItems={items.length}
                      errores={errores}
                      despachar={despachar}
                      alEnter={() => agregarDespuesDe(items[fila.indice])}
                      alMover={(paso) => mover(fila.indice, fila.indice + paso)}
                      alDuplicar={() => duplicar(items[fila.indice])}
                      alQuitar={() => quitar(items[fila.indice])}
                    />
                  ),
                )}
              </SortableContext>
            </DndContext>
            {mostrarTotal ? (
              <div className="flex items-center justify-end gap-6 border-b px-3 py-2 text-sm">
                <span className="font-medium">Total</span>
                {total === null ? (
                  <span className="text-muted-foreground">
                    {sinPrecio > 0
                      ? `Falta el precio de ${sinPrecio === 1 ? '1 ítem' : `${sinPrecio} ítems`}`
                      : 'Revisá las cantidades'}
                  </span>
                ) : (
                  <span className="w-[5.75rem] text-right font-medium tabular-nums">{formatMontoTabla(total)}</span>
                )}
              </div>
            ) : null}
          </>
        )}
        <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
          <div className="flex flex-wrap gap-1">
            <Button ref={botonAgregar} type="button" variant="ghost" size="sm" className="text-primary" onClick={agregarAlFinal}>
              <Plus aria-hidden />
              Agregar ítem
            </Button>
            {/* Las secciones solo se imprimen en el formato por jornada. */}
            {formato === 'jornada' ? (
              <Button type="button" variant="ghost" size="sm" className="text-primary" onClick={agregarSeccion}>
                <Plus aria-hidden />
                Agregar sección
              </Button>
            ) : null}
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="cotizacion-mostrar-total"
              checked={mostrarTotal}
              onCheckedChange={(valor) => despachar({ tipo: 'mostrarTotal', valor })}
            />
            <Label htmlFor="cotizacion-mostrar-total" className="text-sm font-normal">
              Total en el PDF
            </Label>
          </div>
        </div>
      </div>
    </Tarjeta>
  )
}
```

- [ ] **Step 5: Montar la tarjeta en el editor**

En `src/components/cotizaciones/editor/editor-cotizacion.tsx`, agregar el import junto a los de las otras tarjetas:

```tsx
import { TarjetaItems } from './tarjeta-items'
```

y reemplazar el hueco `{/* Ítems (Task 9) */}` por:

```tsx
            <TarjetaItems
              items={estado.items}
              formato={estado.formato}
              mostrarTotal={estado.mostrarTotal}
              errores={errores}
              despachar={despachar}
            />
```

```bash
npm run typecheck && npm run lint
npm run test:e2e -- tests/e2e/cotizaciones.spec.ts -g "grilla de ítems|editor de cotizaciones"
```

Expected: sin errores de tipos ni de lint; los E2E de la grilla y del editor (Task 8) en PASS.

- [ ] **Step 6: Verificación visual contra la 03 (tarjeta Ítems)**

```bash
S=/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/plan3b-capturas
mkdir -p "$S"
magick docs/diseno/referencias/03-editor-cotizacion.png -resize 1200x "$S/ref-03.png"
# Recorte de la tarjeta Ítems de la referencia (a 1200 de ancho va de x≈258 a 814 y de y≈446 a 691).
magick "$S/ref-03.png" -crop 556x245+258+446 +repage "$S/ref-03-items.png"
# Solo si no hay un servidor en el puerto 3000:
npm run dev > "$S/dev.log" 2>&1 & echo $! > "$S/dev.pid"
node -e "const t=Date.now();(async function f(){try{if((await fetch('http://localhost:3000/api/health')).ok)return}catch{}if(Date.now()-t>120000)process.exit(1);setTimeout(f,1000)})()"
```

Escribir `$S/items-09.mjs`:

```js
// Captura de la tarjeta Ítems (Task 9) a 1200×805 y a 390 de ancho (dos líneas por ítem).
import { createRequire } from 'node:module'
const require = createRequire('/Users/guidoolguin/Desktop/equipos-patagonicos/package.json')
const { chromium } = require('@playwright/test')

const S = new URL('.', import.meta.url).pathname
const BASE = 'http://localhost:3000'
const navegador = await chromium.launch()
try {
  const page = await navegador.newPage({
    viewport: { width: 1200, height: 805 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  })
  page.setDefaultTimeout(60_000)
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill('e2e@equipos.test')
  await page.getByLabel('Contraseña').fill('E2e-1234-segura')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('heading', { name: 'Inicio' }).waitFor()

  await page.goto(`${BASE}/cotizaciones/nueva`)
  await page.getByRole('radio', { name: 'Por jornada' }).click()
  await page.getByLabel('Precio del ítem 1', { exact: true }).fill('1950000')
  await page.getByLabel('Precio del ítem 3', { exact: true }).fill('195000')
  await page.mouse.click(5, 400)
  const tarjeta = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Ítems' }) })
  await tarjeta.scrollIntoViewIfNeeded()
  await tarjeta.screenshot({ path: `${S}09-items-1200.png` })
  await page.screenshot({ path: `${S}09-editor-1200.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await tarjeta.scrollIntoViewIfNeeded()
  await tarjeta.screenshot({ path: `${S}09-items-390.png` })
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  console.log(desborda ? 'MAL: hay scroll horizontal a 390' : 'OK: sin scroll horizontal a 390')
} finally {
  await navegador.close()
}
```

```bash
node "$S/items-09.mjs"
```

Abrir `ref-03-items.png`, `09-items-1200.png` y `09-items-390.png` y revisar:
- **Columnas a 1200 (tarjeta de 548 px):** agarre 20 | descripción ≈ 140 | cantidad 52 | precio 104 | unidad 96 | total 92; encabezado h-10 sin fondo, Precio y Total alineados a la derecha.
- **Secciones:** fila gris (`bg-muted/60`) en negrita con el nombre alineado al texto de la descripción.
- **Filas:** `py-2`, borde inferior fino, la descripción se ve como texto (sin borde hasta pasar el mouse), montos sin "$" ("1.950.000,00") con números tabulares, total alineado a la derecha; el precio vacío con borde amarillo y "Sin precio".
- **Pie:** "+ Agregar ítem" y "+ Agregar sección" en azul a la izquierda; "Total en el PDF" con el switch a la derecha.
- **390:** cada ítem en dos líneas (agarre y descripción; cantidad, precio y unidad) y "Total …" abajo a la derecha, sin scroll horizontal.

Diferencias buscadas: sin "$" en las celdas (relev-visual §3.5), el agarre con menú, "+ Agregar sección" y el switch del total, que la imagen no tiene. Ajustar clases hasta que lo demás coincida y matar solo el servidor propio:

```bash
kill "$(cat "$S/dev.pid")" 2>/dev/null || lsof -ti tcp:3000 | xargs kill
```

- [ ] **Step 7: Verificar todo y commit**

```bash
npm run check && npm run test:e2e
```

Expected: todo en verde (esta tarea no toca la base: los tests de integración no cambian).

```bash
git add src/lib/cotizaciones/grilla.ts src/lib/cotizaciones/grilla.test.ts \
  src/components/cotizaciones/editor/tarjeta-items.tsx src/components/cotizaciones/editor/editor-cotizacion.tsx \
  tests/e2e/cotizaciones.spec.ts
git commit -m "feat: grilla de ítems del editor con teclado, arrastre y precios pegados

- Enter agrega una fila debajo y la enfoca; Tab recorre la fila
- Arrastrar con mouse o teclado (dnd-kit) y menú del agarre: subir, bajar, duplicar y eliminar
- Precios pegados al estilo argentino, total por línea y switch del total en el PDF
- Secciones editables como filas de encabezado y dos líneas por ítem en pantallas angostas

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 10: Editor — textos

La tarjeta Textos del editor (relev-visual §3.6, decisiones 5 y 6): cada bloque es una subtarjeta con el título editable, subir y bajar, un único botón de ocultar y "Restaurar este bloque" (solo si la plantilla tiene un bloque con el mismo título y el texto cambió), una barra con Negrita, Viñeta, Subviñeta y Quitar sangría que actúa sobre la selección del textarea (y Ctrl/⌘+B), y el texto pegado desde Word se lleva al formato mínimo. Un bloque oculto se pliega a una fila con "Oculto en esta cotización" y "Mostrar". La acción del título restaura todos los bloques desde la plantilla, con confirmación en el lugar. La lógica de edición de texto vive en funciones puras con tests (`src/lib/plantillas/edicion.ts`).

**Files:**
- Create: `src/lib/plantillas/edicion.ts`, `src/lib/plantillas/edicion.test.ts`
- Create: `src/components/cotizaciones/editor/tarjeta-textos.tsx`
- Modify: `src/components/cotizaciones/editor/editor-cotizacion.tsx`
- Modify: `tests/e2e/cotizaciones.spec.ts`
- Test: `src/lib/plantillas/edicion.test.ts`, `tests/e2e/cotizaciones.spec.ts`

**Usa de tareas anteriores:**
- Task 2: `Bloque` con `oculto` (`src/lib/plantillas/contenido.ts`) y `armarDocumento` que no dibuja los ocultos.
- Task 3 (`src/lib/cotizaciones/editor.ts`): `BloqueEditor`, `PlantillaEditor` y las acciones `bloque`, `moverBloque` y `restaurarBloques` de `AccionEditor` (`restaurarBloques` reemplaza todos los bloques por los dados, con claves nuevas).
- Task 6: `Tarjeta` con la prop `acciones`.
- Task 8: `EditorCotizacion` con el hueco `{/* Textos (Task 10) */}`, `ConfirmacionEnLugar` (`src/components/formulario/confirmacion-en-lugar.tsx`), el tipo `Despachar` y el bloque de E2E del editor (el combobox "Cliente", el guardado, `conBaseEditor` e `idDeLaUrl`).

---

- [ ] **Step 1: Funciones de edición — tests que fallan**

```ts
// src/lib/plantillas/edicion.test.ts
import { describe, expect, it } from 'vitest'
import { parsearFormato } from './formato'
import {
  alternarNegrita,
  alternarVineta,
  bloqueDePlantilla,
  limpiarPegado,
  mismosBloques,
  nivelDeLinea,
  pegar,
  quitarSangria,
} from './edicion'

describe('nivelDeLinea', () => {
  it('usa las mismas marcas que parsearFormato', () => {
    expect(nivelDeLinea('texto')).toBe(0)
    expect(nivelDeLinea('- texto')).toBe(1)
    expect(nivelDeLinea('• texto')).toBe(1)
    expect(nivelDeLinea('  - texto')).toBe(2)
    expect(nivelDeLinea('\t- texto')).toBe(0)
    expect(nivelDeLinea('-30 días')).toBe(0)
  })
})

describe('alternarNegrita', () => {
  it('envuelve la selección en ** y la deja marcada', () => {
    expect(alternarNegrita('hola mundo', { inicio: 0, fin: 4 })).toEqual({
      texto: '**hola** mundo',
      seleccion: { inicio: 0, fin: 8 },
    })
  })

  it('los espacios de los bordes de la selección quedan afuera', () => {
    expect(alternarNegrita('hola mundo', { inicio: 0, fin: 5 }).texto).toBe('**hola** mundo')
  })

  it('si ya está en negrita, la quita (con o sin los asteriscos seleccionados)', () => {
    expect(alternarNegrita('**hola** mundo', { inicio: 0, fin: 8 })).toEqual({
      texto: 'hola mundo',
      seleccion: { inicio: 0, fin: 4 },
    })
    expect(alternarNegrita('**hola** mundo', { inicio: 2, fin: 6 })).toEqual({
      texto: 'hola mundo',
      seleccion: { inicio: 0, fin: 4 },
    })
  })

  it('línea por línea, dejando afuera la marca de viñeta (el formato no cruza saltos)', () => {
    const negrita = alternarNegrita('- uno\n- dos', { inicio: 0, fin: 11 })
    expect(negrita).toEqual({ texto: '- **uno**\n- **dos**', seleccion: { inicio: 0, fin: 19 } })
    expect(parsearFormato(negrita.texto).map((nodo) => nodo.segmentos)).toEqual([
      [{ texto: 'uno', negrita: true }],
      [{ texto: 'dos', negrita: true }],
    ])
    expect(alternarNegrita(negrita.texto, negrita.seleccion).texto).toBe('- uno\n- dos')
  })

  it('una selección con negrita parcial queda toda en negrita, sin asteriscos anidados', () => {
    expect(alternarNegrita('**a** b', { inicio: 0, fin: 7 }).texto).toBe('**a b**')
  })

  it('sin selección inserta **** con el cursor en el medio, y lo saca si se repite', () => {
    expect(alternarNegrita('ab', { inicio: 1, fin: 1 })).toEqual({ texto: 'a****b', seleccion: { inicio: 3, fin: 3 } })
    expect(alternarNegrita('a****b', { inicio: 3, fin: 3 })).toEqual({ texto: 'ab', seleccion: { inicio: 1, fin: 1 } })
  })

  it('una selección de solo espacios no cambia nada', () => {
    expect(alternarNegrita('a  b', { inicio: 1, fin: 3 })).toEqual({ texto: 'a  b', seleccion: { inicio: 1, fin: 3 } })
  })
})

describe('alternarVineta', () => {
  it('pone viñeta a cada línea tocada y marca las líneas enteras', () => {
    expect(alternarVineta('uno\ndos', { inicio: 1, fin: 6 }, 1)).toEqual({
      texto: '- uno\n- dos',
      seleccion: { inicio: 0, fin: 11 },
    })
  })

  it('si ya son todas viñetas de ese nivel, las vuelve párrafo', () => {
    expect(alternarVineta('- uno\n- dos', { inicio: 0, fin: 11 }, 1)).toEqual({
      texto: 'uno\ndos',
      seleccion: { inicio: 0, fin: 7 },
    })
  })

  it('cambia de nivel y respeta las líneas vacías', () => {
    expect(alternarVineta('- uno\n\ndos', { inicio: 0, fin: 10 }, 2).texto).toBe('  - uno\n\n  - dos')
    expect(alternarVineta('- uno\ndos', { inicio: 0, fin: 9 }, 1).texto).toBe('- uno\n- dos')
  })

  it('una selección que termina al principio de una línea no la toca', () => {
    expect(alternarVineta('uno\ndos', { inicio: 0, fin: 4 }, 1).texto).toBe('- uno\ndos')
  })

  it('con el cursor, el cursor sigue en el mismo lugar del texto', () => {
    expect(alternarVineta('- uno', { inicio: 2, fin: 2 }, 2)).toEqual({
      texto: '  - uno',
      seleccion: { inicio: 4, fin: 4 },
    })
    expect(alternarVineta('uno', { inicio: 3, fin: 3 }, 1).seleccion).toEqual({ inicio: 5, fin: 5 })
  })

  it('en una línea vacía pone la marca para empezar a escribir', () => {
    expect(alternarVineta('', { inicio: 0, fin: 0 }, 1)).toEqual({ texto: '- ', seleccion: { inicio: 2, fin: 2 } })
    expect(alternarVineta('uno\n', { inicio: 4, fin: 4 }, 2)).toEqual({
      texto: 'uno\n  - ',
      seleccion: { inicio: 8, fin: 8 },
    })
  })
})

describe('quitarSangria', () => {
  it('subviñeta → viñeta → párrafo', () => {
    expect(quitarSangria('  - uno\n- dos\ntres', { inicio: 0, fin: 18 })).toEqual({
      texto: '- uno\ndos\ntres',
      seleccion: { inicio: 0, fin: 14 },
    })
    expect(quitarSangria('- dos', { inicio: 5, fin: 5 })).toEqual({ texto: 'dos', seleccion: { inicio: 3, fin: 3 } })
  })
})

describe('limpiarPegado', () => {
  it('lleva las viñetas de Word al formato mínimo y limpia saltos, tabs y espacios duros', () => {
    expect(limpiarPegado('•\tPrimera\r\no\tSegunda\r\nTexto\tcon tab ')).toBe('- Primera\n  - Segunda\nTexto con tab')
    expect(limpiarPegado('·  Ítem con punto medio')).toBe('- Ítem con punto medio')
    expect(limpiarPegado('precio final')).toBe('precio final')
  })

  it('no toca lo que ya está en el formato ni un número negativo', () => {
    expect(limpiarPegado('- ya era viñeta\n  - y subviñeta')).toBe('- ya era viñeta\n  - y subviñeta')
    expect(limpiarPegado('-30 días de plazo')).toBe('-30 días de plazo')
  })
})

describe('pegar', () => {
  it('reemplaza la selección por lo pegado ya limpio y deja el cursor al final', () => {
    expect(pegar('Hola mundo', { inicio: 5, fin: 10 }, '•\tgente\r\n')).toEqual({
      texto: 'Hola - gente\n',
      seleccion: { inicio: 13, fin: 13 },
    })
  })
})

describe('bloques de la plantilla', () => {
  const plantilla = [
    { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}', oculto: false },
    { titulo: 'Alcance', contenido: 'Horario de {{horario}}.', oculto: false },
    { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.', oculto: false },
  ]

  it('bloqueDePlantilla busca por título (también el bloque sin título)', () => {
    expect(bloqueDePlantilla(plantilla, ' Alcance ')).toEqual(plantilla[1])
    expect(bloqueDePlantilla(plantilla, '')).toEqual(plantilla[2])
    expect(bloqueDePlantilla(plantilla, 'Otro')).toBeNull()
  })

  it('mismosBloques: no hay nada que restaurar si son los mismos, en orden y visibles', () => {
    expect(mismosBloques(plantilla, plantilla)).toBe(true)
    expect(mismosBloques([plantilla[1], plantilla[0], plantilla[2]], plantilla)).toBe(false)
    expect(mismosBloques([{ ...plantilla[0], oculto: true }, plantilla[1], plantilla[2]], plantilla)).toBe(false)
    expect(mismosBloques(plantilla.slice(1), plantilla)).toBe(false)
  })
})
```

```bash
npx vitest run src/lib/plantillas/edicion.test.ts
```

Expected: FAIL (`Failed to resolve import "./edicion"`).

- [ ] **Step 2: Implementar `edicion.ts`**

```ts
// src/lib/plantillas/edicion.ts
// Edición del formato mínimo de los bloques de texto, el que entiende parsearFormato y dibuja el PDF (decisión 5):
// negrita con **, viñeta con "- ", subviñeta con "  - " y quitar sangría. Funciones puras sobre el texto y la
// selección de un textarea, más la limpieza de lo que se pega desde Word.
import type { Bloque } from './contenido'

/** Selección de un textarea (selectionStart / selectionEnd). Vacía = cursor. */
export type Seleccion = { inicio: number; fin: number }
/** Texto nuevo y la selección que tiene que quedar marcada. */
export type Edicion = { texto: string; seleccion: Seleccion }

// Las mismas marcas que parsearFormato (formato.ts): nivel 2 con dos o más espacios o tabs antes.
const MARCA_NIVEL_2 = /^[ \t]{2,}[-•] /
const MARCA_NIVEL_1 = /^[-•] /
const MARCAS = { 0: '', 1: '- ', 2: '  - ' } as const

/** 0 = párrafo, 1 = viñeta, 2 = subviñeta. */
export function nivelDeLinea(linea: string): 0 | 1 | 2 {
  if (MARCA_NIVEL_2.test(linea)) return 2
  if (MARCA_NIVEL_1.test(linea)) return 1
  return 0
}

/** La línea sin su marca de viñeta ni la sangría del principio. */
function sinMarca(linea: string): string {
  return linea.replace(MARCA_NIVEL_2, '').replace(MARCA_NIVEL_1, '').replace(/^[ \t]+/, '')
}

function largoMarca(linea: string): number {
  return linea.length - sinMarca(linea).length
}

function conNivel(linea: string, nivel: 0 | 1 | 2): string {
  return `${MARCAS[nivel]}${sinMarca(linea)}`
}

/** Las líneas que toca la selección (con un cursor, la del cursor). Si termina al principio de una línea, esa no. */
function lineasTocadas(texto: string, seleccion: Seleccion) {
  const inicio = Math.min(seleccion.inicio, seleccion.fin)
  const fin = Math.max(seleccion.inicio, seleccion.fin)
  const lineas = texto.split('\n')
  const lineaDe = (posicion: number) => texto.slice(0, posicion).split('\n').length - 1
  const primera = lineaDe(inicio)
  let ultima = lineaDe(fin)
  if (fin > inicio && ultima > primera && texto[fin - 1] === '\n') ultima -= 1
  const desde = lineas.slice(0, primera).reduce((suma, linea) => suma + linea.length + 1, 0)
  return { lineas, primera, ultima, inicio, fin, desde }
}

/**
 * Reemplaza cada línea tocada por `transformar(linea)`. Con selección, quedan marcadas las líneas enteras; con un
 * cursor, el cursor queda en el mismo lugar del texto de la línea (después de la marca nueva).
 */
function editarLineas(texto: string, seleccion: Seleccion, transformar: (linea: string) => string): Edicion {
  const { lineas, primera, ultima, inicio, fin, desde } = lineasTocadas(texto, seleccion)
  const viejas = lineas.slice(primera, ultima + 1)
  const nuevas = viejas.map(transformar)
  const resultado = [...lineas.slice(0, primera), ...nuevas, ...lineas.slice(ultima + 1)].join('\n')
  if (inicio === fin) {
    const [vieja] = viejas
    const [nueva] = nuevas
    const enLinea = Math.max(largoMarca(nueva), inicio - desde - largoMarca(vieja) + largoMarca(nueva))
    const cursor = desde + Math.min(enLinea, nueva.length)
    return { texto: resultado, seleccion: { inicio: cursor, fin: cursor } }
  }
  return { texto: resultado, seleccion: { inicio: desde, fin: desde + nuevas.join('\n').length } }
}

const tieneTexto = (linea: string) => sinMarca(linea).trim() !== ''

/** Viñeta (nivel 1) o subviñeta (nivel 2) en las líneas tocadas; si ya lo son todas, vuelven a ser párrafo. */
export function alternarVineta(texto: string, seleccion: Seleccion, nivel: 1 | 2): Edicion {
  const { lineas, primera, ultima } = lineasTocadas(texto, seleccion)
  const conTexto = lineas.slice(primera, ultima + 1).filter(tieneTexto)
  // En una línea vacía pone la marca, para empezar a escribir la viñeta.
  if (conTexto.length === 0) return editarLineas(texto, seleccion, () => MARCAS[nivel])
  const quitar = conTexto.every((linea) => nivelDeLinea(linea) === nivel)
  return editarLineas(texto, seleccion, (linea) => (tieneTexto(linea) ? conNivel(linea, quitar ? 0 : nivel) : linea))
}

/** Quitar sangría: subviñeta → viñeta → párrafo. */
export function quitarSangria(texto: string, seleccion: Seleccion): Edicion {
  return editarLineas(texto, seleccion, (linea) => {
    const nivel = nivelDeLinea(linea)
    return nivel === 0 ? linea : conNivel(linea, nivel === 2 ? 1 : 0)
  })
}

// Una línea (o pedazo de línea) toda en negrita, con su marca de viñeta y espacios afuera: "- **texto** ".
const EN_NEGRITA = /^(\s*(?:[-•] )?)\*\*((?:(?!\*\*).)+)\*\*(\s*)$/
const PARTES_LINEA = /^(\s*(?:[-•] )?)(.*?)(\s*)$/

function envolver(pieza: string): string {
  if (EN_NEGRITA.test(pieza)) return pieza
  const [, marca = '', contenido = '', espacios = ''] = PARTES_LINEA.exec(pieza) ?? []
  // Sin asteriscos adentro: "**a** b" en negrita queda "**a b**", no "****a** b**".
  return contenido === '' ? pieza : `${marca}**${contenido.replaceAll('**', '')}**${espacios}`
}

function desenvolver(pieza: string): string {
  const partes = EN_NEGRITA.exec(pieza)
  return partes ? `${partes[1]}${partes[2]}${partes[3]}` : pieza
}

/**
 * Negrita sobre la selección (botón o Ctrl/⌘+B). Envuelve en ** cada línea seleccionada por separado porque el
 * formato no cruza saltos de línea; si ya estaba toda en negrita, la quita. Sin selección, inserta "****" con el
 * cursor en el medio (o los saca si el cursor está justo entre "**" y "**").
 */
export function alternarNegrita(texto: string, seleccion: Seleccion): Edicion {
  let inicio = Math.min(seleccion.inicio, seleccion.fin)
  let fin = Math.max(seleccion.inicio, seleccion.fin)
  const antes = (posicion: number) => (posicion >= 2 ? texto.slice(posicion - 2, posicion) : '')
  const despues = (posicion: number) => texto.slice(posicion, posicion + 2)

  if (inicio === fin) {
    if (antes(inicio) === '**' && despues(fin) === '**') {
      return { texto: texto.slice(0, inicio - 2) + texto.slice(fin + 2), seleccion: { inicio: inicio - 2, fin: inicio - 2 } }
    }
    return { texto: `${texto.slice(0, inicio)}****${texto.slice(fin)}`, seleccion: { inicio: inicio + 2, fin: inicio + 2 } }
  }

  // Los espacios y saltos de los bordes quedan afuera de la negrita.
  while (inicio < fin && /\s/.test(texto[inicio])) inicio += 1
  while (fin > inicio && /\s/.test(texto[fin - 1])) fin -= 1
  if (inicio === fin) return { texto, seleccion }

  const elegido = texto.slice(inicio, fin)
  // Seleccionado sin los asteriscos: "**[hola]**".
  if (!elegido.includes('\n') && !elegido.includes('**') && antes(inicio) === '**' && despues(fin) === '**') {
    return {
      texto: texto.slice(0, inicio - 2) + elegido + texto.slice(fin + 2),
      seleccion: { inicio: inicio - 2, fin: fin - 2 },
    }
  }

  const piezas = elegido.split('\n')
  const quitar = piezas.filter((pieza) => pieza.trim() !== '').every((pieza) => EN_NEGRITA.test(pieza))
  const nuevo = piezas
    .map((pieza) => (pieza.trim() === '' ? pieza : quitar ? desenvolver(pieza) : envolver(pieza)))
    .join('\n')
  return { texto: texto.slice(0, inicio) + nuevo + texto.slice(fin), seleccion: { inicio, fin: inicio + nuevo.length } }
}

// Viñetas de Word o de un mail pegadas como texto: "•\t", "·  ", "§\t" (nivel 1) y "o\t", "◦\t" (nivel 2).
const VINETA_PEGADA_2 = /^[ \t]*(?:o|◦)\t+[ \t]*/
const VINETA_PEGADA_1 = /^[ \t]*[-–•·●▪■§][ \t]+/

/** Lo pegado se lleva al formato mínimo: saltos de Windows, espacios duros, tabs y viñetas de Word. */
export function limpiarPegado(texto: string): string {
  return texto
    .replace(/\r\n?/g, '\n')
    .replace(/[   ]/g, ' ')
    .split('\n')
    .map((linea) => {
      if (MARCA_NIVEL_2.test(linea)) return linea.replace(/\t/g, ' ')
      if (VINETA_PEGADA_2.test(linea)) return `  - ${linea.replace(VINETA_PEGADA_2, '')}`
      if (VINETA_PEGADA_1.test(linea)) return `- ${linea.replace(VINETA_PEGADA_1, '')}`
      return linea
    })
    .map((linea) => linea.replace(/(?<=\S)\t+/g, ' ').trimEnd())
    .join('\n')
}

/** Reemplaza la selección por lo pegado (ya limpio) y deja el cursor al final de lo pegado. */
export function pegar(texto: string, seleccion: Seleccion, pegado: string): Edicion {
  const inicio = Math.min(seleccion.inicio, seleccion.fin)
  const fin = Math.max(seleccion.inicio, seleccion.fin)
  const limpio = limpiarPegado(pegado)
  const cursor = inicio + limpio.length
  return { texto: texto.slice(0, inicio) + limpio + texto.slice(fin), seleccion: { inicio: cursor, fin: cursor } }
}

/** El bloque de la plantilla con el mismo título (decisión 6: "Restaurar este bloque" solo si existe). */
export function bloqueDePlantilla(bloques: Bloque[], titulo: string): Bloque | null {
  return bloques.find((bloque) => bloque.titulo.trim() === titulo.trim()) ?? null
}

/** true si los bloques son los de la plantilla, en el mismo orden y visibles: no hay nada que restaurar. */
export function mismosBloques(bloques: Bloque[], plantilla: Bloque[]): boolean {
  return (
    bloques.length === plantilla.length &&
    bloques.every(
      (bloque, indice) =>
        bloque.titulo === plantilla[indice].titulo &&
        bloque.contenido === plantilla[indice].contenido &&
        bloque.oculto === plantilla[indice].oculto,
    )
  )
}
```

```bash
npx vitest run src/lib/plantillas/edicion.test.ts
```

Expected: PASS. Comprobar en especial `limpiarPegado('•\tPrimera\r\no\tSegunda\r\nTexto\tcon tab ')`: el tab de "Texto\tcon" pasa a un espacio y el espacio final se recorta.

- [ ] **Step 3: E2E de los textos — test que falla**

Agregar al final de `tests/e2e/cotizaciones.spec.ts` (usa `expect`, `test`, `iniciarSesion`, `conBaseEditor` e `idDeLaUrl`, ya en el archivo por las tareas 7 y 8). La cotización que guarda se borra por id en el `afterAll`: el editor no escribe `notas`, así que no hay marca por la cual limpiarla.

```ts
// ── Editor: textos (Task 10) ──

test.describe('textos del editor', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBaseEditor((db) => db.query('delete from public.cotizaciones where id = any($1::uuid[])', [creadas]))
  })

  test('textos: formato sobre la selección, pegar desde Word, ocultar y restaurar desde la plantilla', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones/nueva')
    await page.getByRole('radio', { name: 'Por jornada' }).click()
    await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()

    // La barra actúa sobre lo seleccionado en el textarea.
    const equipo = page.getByRole('article', { name: 'Equipo ofrecido' })
    const contenido = equipo.getByLabel(/^Contenido del bloque \d+$/)
    await contenido.click()
    await contenido.press('ControlOrMeta+a')
    await equipo.getByRole('button', { name: 'Negrita' }).click()
    await expect(contenido).toHaveValue('**{{equipo_descripcion}}**')
    await equipo.getByRole('button', { name: 'Viñeta' }).click()
    await expect(contenido).toHaveValue('- **{{equipo_descripcion}}**')
    await equipo.getByRole('button', { name: 'Subviñeta' }).click()
    await expect(contenido).toHaveValue('  - **{{equipo_descripcion}}**')
    await equipo.getByRole('button', { name: 'Quitar sangría' }).click()
    await expect(contenido).toHaveValue('- **{{equipo_descripcion}}**')

    // Lo pegado desde Word (viñetas • y o con tabs, saltos \r\n) entra en el formato mínimo. El evento se arma a mano
    // porque el portapapeles del navegador sin interfaz no se puede escribir.
    await contenido.press('ControlOrMeta+a')
    await contenido.evaluate((area) => {
      const datos = new DataTransfer()
      datos.setData('text/plain', '•\tPrimera\r\no\tSegunda')
      area.dispatchEvent(new ClipboardEvent('paste', { clipboardData: datos, bubbles: true, cancelable: true }))
    })
    await expect(contenido).toHaveValue('- Primera\n  - Segunda')

    // Restaurar este bloque, con confirmación en el lugar.
    await equipo.getByRole('button', { name: 'Restaurar este bloque' }).click()
    await equipo
      .getByRole('group', { name: '¿Restaurar este bloque desde la plantilla?' })
      .getByRole('button', { name: 'Restaurar' })
      .click()
    await expect(contenido).toHaveValue('{{equipo_descripcion}}')
    await expect(equipo.getByRole('button', { name: 'Restaurar este bloque' })).toHaveCount(0)

    // Ocultar: el bloque se pliega sin perderse y el foco queda en "Mostrar".
    const alcance = page.getByRole('article', { name: 'Alcance' })
    const ocultarAlcance = alcance.getByRole('button', { name: 'Ocultar en esta cotización' })
    await ocultarAlcance.click()
    await expect(alcance.getByText('Oculto en esta cotización')).toBeVisible()
    await expect(alcance.getByRole('button', { name: 'Mostrar' })).toBeFocused()

    // Restaurar todo pide confirmación; Escape cancela y no cambia nada.
    const restaurarTodosBoton = page.getByRole('button', { name: 'Restaurar desde la plantilla' })
    await restaurarTodosBoton.click()
    const restaurarTodos = page.getByRole('group', { name: /^¿Restaurar todos los textos/ })
    await expect(restaurarTodos.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(restaurarTodos).toBeHidden()
    await expect(alcance.getByText('Oculto en esta cotización')).toBeVisible()

    // Confirmado, vuelven los textos de la plantilla: Alcance otra vez visible y ya no hay nada que restaurar.
    await restaurarTodosBoton.click()
    await restaurarTodos.getByRole('button', { name: 'Restaurar', exact: true }).click()
    await expect(restaurarTodos).toBeHidden()
    await expect(ocultarAlcance).toBeVisible()
    await expect(alcance.getByText('Oculto en esta cotización')).toHaveCount(0)
    await expect(restaurarTodosBoton).toHaveCount(0)

    // El bloque oculto se guarda así y vuelve tal cual con "Mostrar".
    await ocultarAlcance.click()
    await expect(alcance.getByText('Oculto en esta cotización')).toBeVisible()
    const cliente = page.getByRole('combobox', { name: 'Cliente', exact: true })
    await cliente.click()
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('vertice')
    await page.getByRole('option', { name: /VERTICE SERVICIOS INTEGRALES/ }).click()
    await page.getByRole('button', { name: 'Guardar' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    creadas.push(idDeLaUrl(page.url()))
    await expect(page.getByRole('heading', { name: /^Cotización N° \d+$/ })).toBeVisible()

    const alcanceGuardado = page.getByRole('article', { name: 'Alcance' })
    await expect(alcanceGuardado.getByText('Oculto en esta cotización')).toBeVisible()
    await alcanceGuardado.getByRole('button', { name: 'Mostrar' }).click()
    await expect(alcanceGuardado.getByLabel(/^Contenido del bloque \d+$/)).toHaveValue(/Horario de \{\{horario\}\}/)
  })
})
```

```bash
npm run test:e2e -- tests/e2e/cotizaciones.spec.ts -g "textos:"
```

Expected: FAIL (no hay `article` "Equipo ofrecido": la tarjeta todavía no existe).

- [ ] **Step 4: Tarjeta Textos**

Detalles que importan:
- La barra usa `onMouseDown={(evento) => evento.preventDefault()}` para que el clic no le saque el foco ni la selección al textarea; lee `selectionStart`/`selectionEnd`, aplica la función pura y, después de que el reducer aplique el texto, vuelve a marcar la selección en un `useLayoutEffect`.
- El título del bloque es un input "fantasma"; el `article` lleva `aria-label` con el título (o "Bloque N") y marca el foco con `focus-within`.
- Un solo botón de ocultar por bloque (la imagen lo repite: defecto conocido). Al ocultar, el foco va a "Mostrar"; al mostrar, vuelve a "Ocultar".
- "Restaurar desde la plantilla" (todos) solo aparece si los bloques difieren de los de la plantilla (`mismosBloques`); "Restaurar este bloque", si la plantilla tiene un bloque con el mismo título y el texto cambió. Los dos confirman en el lugar.

```tsx
'use client'
// src/components/cotizaciones/editor/tarjeta-textos.tsx

import {
  ArrowDown,
  ArrowUp,
  Bold,
  Eye,
  EyeOff,
  List,
  ListIndentDecrease,
  ListIndentIncrease,
  RotateCcw,
  type LucideIcon,
} from 'lucide-react'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Tarjeta } from '@/components/formulario/tarjeta'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Pastilla } from '@/components/ui/pastilla'
import { Textarea } from '@/components/ui/textarea'
import type { BloqueEditor, PlantillaEditor } from '@/lib/cotizaciones/editor'
import type { Despachar } from '@/lib/cotizaciones/editor-pantalla'
import type { Bloque } from '@/lib/plantillas/contenido'
import {
  alternarNegrita,
  alternarVineta,
  bloqueDePlantilla,
  mismosBloques,
  pegar,
  quitarSangria,
  type Edicion,
  type Seleccion,
} from '@/lib/plantillas/edicion'

type Herramienta = {
  etiqueta: string
  atajo?: string
  Icono: LucideIcon
  aplicar: (texto: string, seleccion: Seleccion) => Edicion
}

/** Solo lo que entiende parsearFormato y dibuja el PDF (decisión 5): sin itálica ni lista numerada. */
const HERRAMIENTAS: Herramienta[] = [
  { etiqueta: 'Negrita', atajo: 'Ctrl+B', Icono: Bold, aplicar: alternarNegrita },
  { etiqueta: 'Viñeta', Icono: List, aplicar: (texto, seleccion) => alternarVineta(texto, seleccion, 1) },
  { etiqueta: 'Subviñeta', Icono: ListIndentIncrease, aplicar: (texto, seleccion) => alternarVineta(texto, seleccion, 2) },
  { etiqueta: 'Quitar sangría', Icono: ListIndentDecrease, aplicar: quitarSangria },
]

const ICONO = 'text-muted-foreground'

function EditorBloque({
  bloque,
  indice,
  total,
  original,
  errores,
  despachar,
}: {
  bloque: BloqueEditor
  indice: number
  total: number
  /** El bloque de la plantilla con el mismo título, si existe. */
  original: Bloque | null
  errores: Record<string, string>
  despachar: Despachar
}) {
  const numero = indice + 1
  const id = `bloque-${bloque.clave}`
  const nombre = bloque.titulo.trim() || `Bloque ${numero}`
  const area = useRef<HTMLTextAreaElement>(null)
  // Selección a marcar cuando el reducer aplique el texto editado.
  const seleccionPendiente = useRef<Seleccion | null>(null)
  // Al ocultar el foco va a "Mostrar" y al mostrar vuelve a "Ocultar" (cada botón se monta de nuevo).
  const foco = useRef<'mostrar' | 'ocultar' | null>(null)
  const [confirmando, setConfirmando] = useState(false)

  useLayoutEffect(() => {
    const seleccion = seleccionPendiente.current
    const elemento = area.current
    if (!seleccion || !elemento) return
    seleccionPendiente.current = null
    elemento.focus()
    elemento.setSelectionRange(seleccion.inicio, seleccion.fin)
  }, [bloque.contenido])

  const alMontarMostrar = useCallback((boton: HTMLButtonElement | null) => {
    if (boton && foco.current === 'mostrar') {
      foco.current = null
      boton.focus()
    }
  }, [])
  const alMontarOcultar = useCallback((boton: HTMLButtonElement | null) => {
    if (boton && foco.current === 'ocultar') {
      foco.current = null
      boton.focus()
    }
  }, [])

  const cambiar = (cambios: Partial<Omit<BloqueEditor, 'clave'>>) =>
    despachar({ tipo: 'bloque', clave: bloque.clave, cambios })

  function editar(operacion: (texto: string, seleccion: Seleccion) => Edicion) {
    const elemento = area.current
    if (!elemento) return
    const { texto, seleccion } = operacion(elemento.value, {
      inicio: elemento.selectionStart,
      fin: elemento.selectionEnd,
    })
    if (texto === bloque.contenido) {
      elemento.focus()
      elemento.setSelectionRange(seleccion.inicio, seleccion.fin)
      return
    }
    seleccionPendiente.current = seleccion
    cambiar({ contenido: texto })
  }

  function cerrarConfirmacion() {
    setConfirmando(false)
    requestAnimationFrame(() => area.current?.focus())
  }

  const errorTitulo = errores[`bloques.${indice}.titulo`]
  const errorContenido = errores[`bloques.${indice}.contenido`]
  const describir = errorTitulo || errorContenido ? `${id}-error` : undefined
  const puedeRestaurar = original !== null && original.contenido !== bloque.contenido

  if (bloque.oculto) {
    return (
      <article aria-label={nombre} className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed px-3 py-2">
        <span className="min-w-0 flex-1 truncate text-[15px] text-muted-foreground">
          {bloque.titulo.trim() || 'Sin título'}
        </span>
        <Pastilla>Oculto en esta cotización</Pastilla>
        <Button
          ref={alMontarMostrar}
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            foco.current = 'ocultar'
            cambiar({ oculto: false })
          }}
        >
          <Eye aria-hidden />
          Mostrar
        </Button>
      </article>
    )
  }

  return (
    <article
      aria-label={nombre}
      className="overflow-hidden rounded-lg border transition-[border-color,box-shadow] focus-within:border-ring focus-within:ring-3 focus-within:ring-ring/50"
    >
      <div className="flex items-center gap-1 border-b px-2 py-1.5">
        <Input
          id={`${id}-titulo`}
          aria-label={`Título del bloque ${numero}`}
          value={bloque.titulo}
          placeholder="Sin título"
          onChange={(evento) => cambiar({ titulo: evento.target.value })}
          aria-invalid={Boolean(errorTitulo)}
          aria-describedby={describir}
          className="h-8 min-w-0 flex-1 border-transparent bg-transparent px-1.5 text-[15px] font-medium shadow-none hover:border-input focus-visible:border-ring focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
        />
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Subir bloque"
          title="Subir bloque"
          disabled={indice === 0}
          onClick={() => despachar({ tipo: 'moverBloque', clave: bloque.clave, direccion: -1 })}
        >
          <ArrowUp aria-hidden />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Bajar bloque"
          title="Bajar bloque"
          disabled={indice === total - 1}
          onClick={() => despachar({ tipo: 'moverBloque', clave: bloque.clave, direccion: 1 })}
        >
          <ArrowDown aria-hidden />
        </Button>
        <Button
          ref={alMontarOcultar}
          type="button"
          variant="ghost"
          size="icon-sm"
          className={ICONO}
          aria-label="Ocultar en esta cotización"
          title="Ocultar en esta cotización (no sale en el PDF)"
          onClick={() => {
            foco.current = 'mostrar'
            cambiar({ oculto: true })
          }}
        >
          <EyeOff aria-hidden />
        </Button>
        {puedeRestaurar ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className={ICONO}
            aria-label="Restaurar este bloque"
            title="Restaurar este bloque desde la plantilla"
            disabled={confirmando}
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw aria-hidden />
          </Button>
        ) : null}
      </div>

      {confirmando && original ? (
        <ConfirmacionEnLugar
          className="m-2"
          tono="aviso"
          pregunta="¿Restaurar este bloque desde la plantilla?"
          detalle="Se pierden los cambios hechos en su texto."
          textoConfirmar="Restaurar"
          alConfirmar={() => {
            cambiar({ titulo: original.titulo, contenido: original.contenido, oculto: false })
            cerrarConfirmacion()
          }}
          alCancelar={cerrarConfirmacion}
        />
      ) : null}

      <div
        role="toolbar"
        aria-label={`Formato del bloque ${numero}`}
        aria-controls={`${id}-contenido`}
        className="flex gap-0.5 border-b bg-muted/30 px-1.5 py-1"
      >
        {HERRAMIENTAS.map(({ etiqueta, atajo, Icono, aplicar }) => (
          <Button
            key={etiqueta}
            type="button"
            variant="ghost"
            size="icon-sm"
            className={ICONO}
            aria-label={etiqueta}
            title={atajo ? `${etiqueta} (${atajo})` : etiqueta}
            // Sin esto el clic le saca el foco y la selección al texto.
            onMouseDown={(evento) => evento.preventDefault()}
            onClick={() => editar(aplicar)}
          >
            <Icono aria-hidden />
          </Button>
        ))}
      </div>

      <Textarea
        ref={area}
        id={`${id}-contenido`}
        aria-label={`Contenido del bloque ${numero}`}
        value={bloque.contenido}
        placeholder="Texto del bloque"
        onChange={(evento) => cambiar({ contenido: evento.target.value })}
        onKeyDown={(evento) => {
          if ((evento.ctrlKey || evento.metaKey) && !evento.altKey && evento.key.toLowerCase() === 'b') {
            evento.preventDefault()
            editar(alternarNegrita)
          }
        }}
        // Lo pegado desde Word llega como texto plano, pero con sus viñetas y tabs: se lleva al formato mínimo.
        onPaste={(evento) => {
          const pegado = evento.clipboardData.getData('text/plain')
          if (!pegado) return
          evento.preventDefault()
          editar((texto, seleccion) => pegar(texto, seleccion, pegado))
        }}
        aria-invalid={Boolean(errorContenido)}
        aria-describedby={describir}
        className="min-h-20 resize-none rounded-none border-0 px-3 py-2.5 text-[15px] shadow-none focus-visible:ring-0 md:text-[15px] dark:bg-transparent"
      />
      {describir ? (
        <p id={describir} className="border-t px-3 py-2 text-sm text-destructive">
          {[errorTitulo, errorContenido].filter(Boolean).join(' · ')}
        </p>
      ) : null}
    </article>
  )
}

export function TarjetaTextos({
  bloques,
  plantilla,
  errores,
  despachar,
}: {
  bloques: BloqueEditor[]
  /** La plantilla de la cotización (también si está inactiva); null si no tiene. */
  plantilla: PlantillaEditor | null
  errores: Record<string, string>
  despachar: Despachar
}) {
  const [confirmando, setConfirmando] = useState(false)
  const botonRestaurar = useRef<HTMLButtonElement>(null)
  const hayQueRestaurar = plantilla !== null && bloques.length > 0 && !mismosBloques(bloques, plantilla.bloques)

  function restaurarTodos() {
    if (plantilla) despachar({ tipo: 'restaurarBloques', bloques: plantilla.bloques })
  }

  function cerrar() {
    setConfirmando(false)
    requestAnimationFrame(() => botonRestaurar.current?.focus())
  }

  return (
    <Tarjeta
      titulo="Textos"
      acciones={
        hayQueRestaurar ? (
          <Button
            ref={botonRestaurar}
            type="button"
            variant="ghost"
            size="sm"
            className={ICONO}
            disabled={confirmando}
            onClick={() => setConfirmando(true)}
          >
            <RotateCcw aria-hidden />
            Restaurar desde la plantilla
          </Button>
        ) : null
      }
    >
      {confirmando && plantilla ? (
        <ConfirmacionEnLugar
          tono="aviso"
          pregunta={`¿Restaurar todos los textos desde «${plantilla.nombre}»?`}
          detalle="Se pierden los cambios hechos en los textos de esta cotización, también los bloques ocultos."
          textoConfirmar="Restaurar"
          alConfirmar={() => {
            restaurarTodos()
            cerrar()
          }}
          alCancelar={cerrar}
        />
      ) : null}
      {bloques.length === 0 ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-dashed px-4 py-6">
          <p className="flex-1 text-[15px] text-muted-foreground">Esta cotización no tiene textos.</p>
          {plantilla && plantilla.bloques.length > 0 ? (
            // Sin textos no hay nada que perder: restaura sin confirmar.
            <Button type="button" variant="outline" size="sm" onClick={restaurarTodos}>
              <RotateCcw aria-hidden />
              Restaurar desde la plantilla
            </Button>
          ) : null}
        </div>
      ) : (
        <div className="space-y-3">
          {bloques.map((bloque, indice) => (
            <EditorBloque
              key={bloque.clave}
              bloque={bloque}
              indice={indice}
              total={bloques.length}
              original={plantilla ? bloqueDePlantilla(plantilla.bloques, bloque.titulo) : null}
              errores={errores}
              despachar={despachar}
            />
          ))}
        </div>
      )}
    </Tarjeta>
  )
}
```

- [ ] **Step 5: Montar la tarjeta en el editor**

En `src/components/cotizaciones/editor/editor-cotizacion.tsx`, agregar el import junto a los de las otras tarjetas:

```tsx
import { TarjetaTextos } from './tarjeta-textos'
```

y reemplazar el hueco `{/* Textos (Task 10) */}` por:

```tsx
            <TarjetaTextos
              bloques={estado.bloques}
              plantilla={catalogos.plantillas.find((plantilla) => plantilla.id === estado.plantillaId) ?? null}
              errores={errores}
              despachar={despachar}
            />
```

(La página `[id]` ya incluye en `catalogos.plantillas` la plantilla de la cotización aunque esté inactiva: `leerCatalogosEditor` de la Task 8.)

```bash
npm run typecheck && npm run lint
npm run test:e2e -- tests/e2e/cotizaciones.spec.ts -g "textos:|grilla de ítems|editor de cotizaciones"
```

Expected: sin errores de tipos ni de lint; los E2E de textos, grilla y editor en PASS.

- [ ] **Step 6: Verificación visual contra la 03 (tarjeta Textos)**

La referencia solo muestra el principio de la tarjeta (corta en y≈805 a 1200 de ancho); se compara la cabecera, la barra y el primer bloque.

```bash
S=/private/tmp/claude-501/-Users-guidoolguin-Desktop-equipos-patagonicos/f204ed8f-2b7c-4e0e-845d-e3dc462cd7cb/scratchpad/plan3b-capturas
mkdir -p "$S"
magick docs/diseno/referencias/03-editor-cotizacion.png -resize 1200x "$S/ref-03.png"
magick "$S/ref-03.png" -crop 556x110+258+695 +repage "$S/ref-03-textos.png"
# Solo si no hay un servidor en el puerto 3000:
npm run dev > "$S/dev.log" 2>&1 & echo $! > "$S/dev.pid"
node -e "const t=Date.now();(async function f(){try{if((await fetch('http://localhost:3000/api/health')).ok)return}catch{}if(Date.now()-t>120000)process.exit(1);setTimeout(f,1000)})()"
```

Escribir `$S/textos-10.mjs`:

```js
// Captura de la tarjeta Textos (Task 10) a 1200×805, con un bloque oculto y otro con el foco.
import { createRequire } from 'node:module'
const require = createRequire('/Users/guidoolguin/Desktop/equipos-patagonicos/package.json')
const { chromium } = require('@playwright/test')

const S = new URL('.', import.meta.url).pathname
const BASE = 'http://localhost:3000'
const navegador = await chromium.launch()
try {
  const page = await navegador.newPage({
    viewport: { width: 1200, height: 805 },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  })
  page.setDefaultTimeout(60_000)
  await page.goto(`${BASE}/login`)
  await page.getByLabel('Email').fill('e2e@equipos.test')
  await page.getByLabel('Contraseña').fill('E2e-1234-segura')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('heading', { name: 'Inicio' }).waitFor()

  await page.goto(`${BASE}/cotizaciones/nueva`)
  await page.getByRole('radio', { name: 'Mensual' }).click()
  const tarjeta = page.locator('section').filter({ has: page.getByRole('heading', { name: 'Textos' }) })
  await page
    .getByRole('article', { name: 'RENEGOCIACIÓN DE TARIFAS' })
    .getByRole('button', { name: 'Ocultar en esta cotización' })
    .click()
  await page.getByRole('article', { name: /^CONDICIONES PARTICULARES/ }).getByLabel(/^Contenido del bloque/).click()
  await tarjeta.scrollIntoViewIfNeeded()
  await tarjeta.screenshot({ path: `${S}10-textos-1200.png` })

  await page.setViewportSize({ width: 390, height: 844 })
  await tarjeta.scrollIntoViewIfNeeded()
  await tarjeta.screenshot({ path: `${S}10-textos-390.png` })
  const desborda = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)
  console.log(desborda ? 'MAL: hay scroll horizontal a 390' : 'OK: sin scroll horizontal a 390')
} finally {
  await navegador.close()
}
```

```bash
node "$S/textos-10.mjs"
```

Abrir `ref-03-textos.png`, `10-textos-1200.png` y `10-textos-390.png` y revisar:
- **Subtarjeta por bloque:** `rounded-lg border`, 12 px entre bloques; el que tiene el foco con el anillo azul en todo el bloque.
- **Cabecera del bloque:** título de 15 px medium que se ve como texto (sin borde) y a la derecha ↑ ↓ ojo tachado (y ↺ si cambió), íconos grises de 28 px.
- **Barra:** fondo gris muy claro (`bg-muted/30`), cuatro íconos (B, viñeta, subviñeta, quitar sangría) alineados a la izquierda, sin itálica ni lista numerada ni un ojo repetido.
- **Texto:** 15 px, sin borde propio, con el mismo padding que la referencia.
- **Oculto:** una sola fila con borde punteado, el título en gris, la pastilla "Oculto en esta cotización" y "Mostrar".
- **390:** los íconos de la cabecera entran en la fila sin desbordar; sin scroll horizontal.

Diferencias buscadas (no corregir):
- Controles por bloque en vez de una barra global con el ojo repetido (decisiones 5 y 6), sin itálica ni lista numerada, y "Restaurar desde la plantilla" a la derecha del título cuando hay cambios.
- La cabecera del bloque no tiene el "agarre con menú" de relev-visual §3.6: se reordena con ↑ y ↓, que alcanzan para los pocos bloques de una cotización.
- El bloque se ve siempre en el textarea, con "- " y "**" a la vista. relev-visual §3.6 marca como opcional mostrarlo en reposo con `TextoBloque`/`ConVariables`; queda para el 3C (`TextoBloque` ya está compartido desde la Task 6). Las `{{variables}}` que faltan se ven en la franja amarilla y en los campos de Datos.

Ajustar clases hasta que lo demás coincida y matar solo el servidor propio:

```bash
kill "$(cat "$S/dev.pid")" 2>/dev/null || lsof -ti tcp:3000 | xargs kill
```

- [ ] **Step 7: Verificar todo y commit**

```bash
npm run check && npm run test:e2e
```

Expected: todo en verde (esta tarea no toca la base).

```bash
git add src/lib/plantillas/edicion.ts src/lib/plantillas/edicion.test.ts \
  src/components/cotizaciones/editor/tarjeta-textos.tsx src/components/cotizaciones/editor/editor-cotizacion.tsx \
  tests/e2e/cotizaciones.spec.ts
git commit -m "feat: textos del editor con formato mínimo, ocultar y restaurar desde la plantilla

- Barra con negrita, viñeta, subviñeta y quitar sangría sobre la selección (y Ctrl/⌘+B)
- Lo pegado desde Word se lleva al formato mínimo
- Cada bloque se reordena, se oculta en la cotización o se restaura desde la plantilla
- Restaurar todos los textos con confirmación en el lugar

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 11: Editor: vista previa

**Depende de:** Task 3 (`EstadoEditor`, `hayCambios`, `estadoNuevo`), Task 4 (`vistaPrevia` resalta en amarillo las variables sin completar), Task 5 (`POST /cotizaciones/vista-previa` y `GET /cotizaciones/{id}/pdf?actual=1`), Task 8 (`EditorCotizacion` con `estado`, `guardar()` y el marco vacío del `<aside>`; `BarraInferior` con el hueco `vistaPrevia`; la página `[id]`). Nada de las Tasks 9 y 10.

**Qué deja:**
- La columna "Vista previa" del editor (decisión 16, relev-visual §3.8): desde 72rem, fija a la derecha (`sticky`), con la hoja en un pozo gris y el **PDF real** en un `<iframe>` con un blob del `POST /cotizaciones/vista-previa` (`#toolbar=0&navpanes=0&view=FitH`). Se genera sola la primera vez en escritorio y después con "Actualizar vista previa" (no en cada tecla). Estados: cargando, error con "Reintentar", desactualizada ("Hay cambios sin reflejar", hoja en `opacity-60`), sin cliente. El blob anterior se libera al llegar uno nuevo y al desmontar.
- Aprobada, rechazada o cargada: el PDF guardado con el GET normal (sin "Actualizar"); directa: "Un presupuesto directo no tiene PDF.". El ícono "Abrir el PDF en otra pestaña" abre lo mismo que se ve.
- Entre md y 72rem: botón "Vista previa" en la `BarraInferior` que abre el mismo panel en un `Sheet` lateral. En el celular: guarda y abre `/cotizaciones/{id}/pdf?actual=1` en otra pestaña.
- `ContextoEstado`, `CONTEXTO_NUEVA` y `leerContextoEstado` (`src/lib/cotizaciones/contexto-estado.ts`): envíos (el más reciente primero), vencimiento, fecha de aprobación y cotización anterior (`reemplaza_a` con su número). La página `[id]` lo lee y se lo pasa al editor (`contexto`); lo usan esta tarea (la línea bajo el título del panel) y la Task 12 (franjas, menú de envíos, confirmaciones). La fila del editor (`FilaEditor`) no alcanza: no trae `vence_el` ni el número de la anterior.
- `tests/e2e/base-datos.ts` (`conBase`, `DATOS_COMPLETOS`, `crearCotizacionCompleta` con `datos` y `precioMovilizacion` opcionales, `borrarCotizaciones`), que reutilizan las Tasks 12 y 13.

**Files:**
- Create: `src/lib/cotizaciones/vista-previa.ts`, `src/lib/cotizaciones/vista-previa.test.ts`
- Create: `src/lib/cotizaciones/contexto-estado.ts`, `tests/integration/cotizaciones-contexto.test.ts`
- Create: `src/components/cotizaciones/editor/panel-vista-previa.tsx`
- Create: `tests/e2e/base-datos.ts`
- Modify: `src/app/(app)/cotizaciones/[id]/page.tsx`, `src/components/cotizaciones/editor/editor-cotizacion.tsx` (los dos de la Task 8)
- Modify: `tests/e2e/cotizaciones.spec.ts` (se suma un `describe` y se usa el `conBase` compartido)
- Test: los de arriba, `npm run check`, `npm run test:int`, `npm run test:e2e`

- [ ] **Step 1: Tests de la lógica de la vista previa (fallan)**

```ts
// src/lib/cotizaciones/vista-previa.test.ts
import { describe, expect, it } from 'vitest'
import { estadoNuevo, type EstadoEditor } from './editor'
import {
  fechaDeMarca,
  lineaVistaPrevia,
  mensajeErrorVistaPrevia,
  modoVistaPrevia,
  urlPdfActual,
  urlVisor,
  vistaDesactualizada,
} from './vista-previa'

const ID = '0b6f3c1e-5a2d-4f7e-9c8b-1d2e3f4a5b6c'
const CLIENTE = { id: '7d1e2f3a-4b5c-4d6e-8f9a-0b1c2d3e4f5a', razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.', cuit: null }

function estado(cambios: Partial<EstadoEditor> = {}): EstadoEditor {
  return { ...estadoNuevo({ plantilla: null, firmanteId: '', hoy: '2026-10-25' }), cliente: CLIENTE, ...cambios }
}

describe('modoVistaPrevia', () => {
  it('un borrador o una enviada de la app se generan con lo que hay en pantalla', () => {
    expect(modoVistaPrevia(estado())).toEqual({ tipo: 'generada' })
    expect(modoVistaPrevia(estado({ id: ID, estado: 'enviada' }))).toEqual({ tipo: 'generada' })
  })

  it('sin cliente todavía no hay vista previa', () => {
    expect(modoVistaPrevia(estado({ cliente: null }))).toEqual({ tipo: 'sin-cliente' })
  })

  it('una aprobada, una rechazada o una cargada muestran el PDF guardado', () => {
    const guardada = { tipo: 'guardada', url: `/cotizaciones/${ID}/pdf` }
    expect(modoVistaPrevia(estado({ id: ID, estado: 'aprobada' }))).toEqual(guardada)
    expect(modoVistaPrevia(estado({ id: ID, estado: 'rechazada' }))).toEqual(guardada)
    expect(modoVistaPrevia(estado({ id: ID, estado: 'enviada', origen: 'importada' }))).toEqual(guardada)
  })

  it('un presupuesto directo no tiene PDF', () => {
    expect(modoVistaPrevia(estado({ id: ID, estado: 'aprobada', origen: 'directa' }))).toEqual({ tipo: 'sin-pdf' })
  })
})

describe('urls', () => {
  it('el visor va sin barra, sin miniaturas y al ancho', () => {
    expect(urlVisor('blob:http://localhost:3000/abc')).toBe('blob:http://localhost:3000/abc#toolbar=0&navpanes=0&view=FitH')
  })

  it('el celular abre la versión actual de lo guardado', () => {
    expect(urlPdfActual(ID)).toBe(`/cotizaciones/${ID}/pdf?actual=1`)
  })
})

describe('fechaDeMarca', () => {
  it('usa la fecha argentina del instante, no la UTC', () => {
    expect(fechaDeMarca('2026-10-21T02:30:00.123456+00:00')).toBe('20/10/2026')
    expect(fechaDeMarca('2026-10-20T15:00:00+00:00')).toBe('20/10/2026')
  })
})

describe('vistaDesactualizada', () => {
  it('sin vista previa generada no hay nada desactualizado', () => {
    expect(vistaDesactualizada(null, estado())).toBe(false)
  })

  it('cambia con lo que se guarda y con el número, no con la identidad del objeto', () => {
    const base = estado({ asunto: 'Cotización' })
    expect(vistaDesactualizada(base, { ...base })).toBe(false)
    expect(vistaDesactualizada(base, { ...base, asunto: 'Cotización N° 112712' })).toBe(true)
    expect(vistaDesactualizada(base, { ...base, numero: 112712 })).toBe(true)
  })
})

describe('lineaVistaPrevia', () => {
  const base = { estado: 'borrador', origen: 'app', desactualizada: false, ultimoEnvio: null, fechaAprobacion: null } as const

  it('explica qué se está viendo en cada caso', () => {
    expect(lineaVistaPrevia({ ...base, modo: { tipo: 'generada' } })).toBe('Con lo que hay en pantalla, aunque no esté guardado')
    expect(lineaVistaPrevia({ ...base, modo: { tipo: 'generada' }, desactualizada: true })).toBe('Hay cambios sin reflejar')
    expect(
      lineaVistaPrevia({ ...base, estado: 'enviada', modo: { tipo: 'generada' }, ultimoEnvio: '2026-10-20T15:00:00+00:00' }),
    ).toBe('Versión actual · el último envío es del 20/10/2026')
    expect(lineaVistaPrevia({ ...base, modo: { tipo: 'sin-cliente' } })).toBe('Elegí el cliente para verla.')
    expect(lineaVistaPrevia({ ...base, modo: { tipo: 'sin-pdf' } })).toBe('')
  })

  it('en lo guardado dice de dónde sale el PDF', () => {
    const guardada = { tipo: 'guardada', url: `/cotizaciones/${ID}/pdf` } as const
    expect(lineaVistaPrevia({ ...base, estado: 'aprobada', modo: guardada, fechaAprobacion: '2026-10-25' })).toBe(
      'PDF aprobado el 25/10/2026',
    )
    expect(lineaVistaPrevia({ ...base, estado: 'enviada', origen: 'importada', modo: guardada })).toBe('PDF original cargado')
    expect(
      lineaVistaPrevia({ ...base, estado: 'rechazada', modo: guardada, ultimoEnvio: '2026-10-20T15:00:00+00:00' }),
    ).toBe('Último envío · 20/10/2026')
  })
})

describe('mensajeErrorVistaPrevia', () => {
  it('distingue la sesión vencida, los datos que no validan y el resto', () => {
    expect(mensajeErrorVistaPrevia(401)).toBe('Tu sesión venció: volvé a ingresar para ver la vista previa.')
    expect(mensajeErrorVistaPrevia(400)).toBe('Hay datos que todavía no se pueden dibujar: revisalos y probá de nuevo.')
    expect(mensajeErrorVistaPrevia(500)).toBe('No se pudo generar la vista previa.')
    expect(mensajeErrorVistaPrevia(null)).toBe('No se pudo generar la vista previa.')
  })
})
```

```bash
npm test -- src/lib/cotizaciones/vista-previa.test.ts
```

Expected: FAIL (no existe `./vista-previa`).

- [ ] **Step 2: Implementar `vista-previa.ts`**

```ts
// src/lib/cotizaciones/vista-previa.ts
// Qué muestra el panel de vista previa del editor y cómo lo explica. Puro: lo usa un componente de cliente.
import { formatFechaCorta, hoyArgentina } from '@/lib/format/fechas'
import { hayCambios, type EstadoEditor } from './editor'

/** Parámetros del visor de PDF del navegador: sin barra ni miniaturas y la hoja al ancho del panel. */
export const PARAMETROS_VISOR = '#toolbar=0&navpanes=0&view=FitH'

/** La URL que va en el <iframe> del panel. */
export function urlVisor(url: string): string {
  return `${url}${PARAMETROS_VISOR}`
}

/** El PDF de lo guardado en su versión actual (no el último envío): lo que abre "Vista previa" en el celular. */
export function urlPdfActual(id: string): string {
  return `/cotizaciones/${id}/pdf?actual=1`
}

export type ModoVistaPrevia =
  /** Se arma en el servidor con lo que hay en pantalla, aunque no esté guardado (POST /cotizaciones/vista-previa). */
  | { tipo: 'generada' }
  /** Un PDF que ya existe y no cambia con lo editado: el aprobado, el original de una cargada o lo enviado de una rechazada. */
  | { tipo: 'guardada'; url: string }
  /** Todavía no hay cliente: la cotización no tiene a quién dirigirse. */
  | { tipo: 'sin-cliente' }
  /** Un presupuesto directo no tiene PDF. */
  | { tipo: 'sin-pdf' }

export function modoVistaPrevia(estado: Pick<EstadoEditor, 'id' | 'estado' | 'origen' | 'cliente'>): ModoVistaPrevia {
  if (estado.origen === 'directa') return { tipo: 'sin-pdf' }
  const congelada = estado.origen === 'importada' || estado.estado === 'aprobada' || estado.estado === 'rechazada'
  if (estado.id && congelada) return { tipo: 'guardada', url: `/cotizaciones/${estado.id}/pdf` }
  if (!estado.cliente) return { tipo: 'sin-cliente' }
  return { tipo: 'generada' }
}

/** "20/10/2026" en hora argentina a partir de un timestamptz (por ejemplo, el enviada_at de un envío). */
export function fechaDeMarca(marca: string): string {
  return formatFechaCorta(hoyArgentina(new Date(marca)))
}

/**
 * La vista previa generada ya no muestra lo que hay en pantalla. El número cuenta aparte porque no está en lo que
 * se guarda: la primera vista previa de una nueva lo muestra como {{numero}} y, después de guardar, ya lo tiene.
 */
export function vistaDesactualizada(generadaCon: EstadoEditor | null, actual: EstadoEditor): boolean {
  if (!generadaCon) return false
  return generadaCon.numero !== actual.numero || hayCambios(generadaCon, actual)
}

/** La línea gris bajo el título "Vista previa". */
export function lineaVistaPrevia(args: {
  modo: ModoVistaPrevia
  estado: EstadoEditor['estado']
  origen: EstadoEditor['origen']
  desactualizada: boolean
  /** enviada_at del último envío, si hubo. */
  ultimoEnvio: string | null
  /** 'YYYY-MM-DD' */
  fechaAprobacion: string | null
}): string {
  switch (args.modo.tipo) {
    case 'sin-pdf':
      return ''
    case 'sin-cliente':
      return 'Elegí el cliente para verla.'
    case 'guardada':
      if (args.origen === 'importada') return 'PDF original cargado'
      if (args.estado === 'aprobada') {
        return args.fechaAprobacion ? `PDF aprobado el ${formatFechaCorta(args.fechaAprobacion)}` : 'PDF aprobado'
      }
      return args.ultimoEnvio ? `Último envío · ${fechaDeMarca(args.ultimoEnvio)}` : 'Versión guardada'
    case 'generada':
      if (args.desactualizada) return 'Hay cambios sin reflejar'
      if (args.ultimoEnvio) return `Versión actual · el último envío es del ${fechaDeMarca(args.ultimoEnvio)}`
      return 'Con lo que hay en pantalla, aunque no esté guardado'
  }
}

/** Mensaje del panel cuando la vista previa no se pudo generar (status null: no hubo respuesta). */
export function mensajeErrorVistaPrevia(status: number | null): string {
  if (status === 401) return 'Tu sesión venció: volvé a ingresar para ver la vista previa.'
  if (status === 400) return 'Hay datos que todavía no se pueden dibujar: revisalos y probá de nuevo.'
  return 'No se pudo generar la vista previa.'
}
```

```bash
npm test -- src/lib/cotizaciones/vista-previa.test.ts
```

Expected: PASS (12 tests). `vistaDesactualizada` usa el `hayCambios` real de la Task 3: si algún caso falla, revisá que `hayCambios` compare el payload (asunto incluido) y no las claves.

- [ ] **Step 3: Test de integración del contexto de estado (falla)**

Con Supabase local levantado (`npm run db:start` si hace falta):

```ts
// tests/integration/cotizaciones-contexto.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { leerContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import { aprobarCotizacion, enviarCotizacion } from '@/lib/cotizaciones/servicio'
import { ITEMS_JORNADA, idsDeEjemplo } from './cotizaciones-helpers'
import { adminClient, borrarUsuario, crearUsuario, sql } from './helpers'

let activo: Awaited<ReturnType<typeof crearUsuario>>
let ids: Awaited<ReturnType<typeof idsDeEjemplo>>
const creadas: string[] = []

beforeAll(async () => {
  activo = await crearUsuario({ activo: true, rol: 'operador' })
  ids = await idsDeEjemplo()
})

afterAll(async () => {
  const archivos = await sql<{ name: string }>(
    `select name from storage.objects where bucket_id = 'documentos' and split_part(name, '/', 2) = any($1::text[])`,
    [creadas],
  )
  if (archivos.length) await adminClient().storage.from('documentos').remove(archivos.map((a) => a.name))
  await sql('delete from public.cotizaciones where id = any($1::uuid[])', [creadas])
  await borrarUsuario(activo.id)
})

/** Un borrador completo (se puede enviar y aprobar) del 22/10/2026 con 30 días de validez. */
async function nueva(): Promise<string> {
  const { data, error } = await activo.client.rpc('guardar_cotizacion', {
    p_datos: {
      cliente_id: ids.cliente_id,
      formato: 'jornada',
      equipo_id: ids.equipo_id,
      firmante_id: ids.firmante_id,
      fecha: '2026-10-22',
      asunto: 'Cotización N° {{numero}} capacidad {{capacidad}} TN',
      intro: 'Servicios de izaje en {{ubicacion}}.',
      datos: { ubicacion: 'Loma Campana, Añelo' },
      bloques: [{ titulo: 'Alcance', contenido: '- Horario de 8 a 17 hs.' }],
    },
    p_items: ITEMS_JORNADA,
  })
  if (error) throw error
  creadas.push(data)
  return data
}

describe('leerContextoEstado', () => {
  it('una cotización inexistente da null', async () => {
    expect(await leerContextoEstado(activo.client, crypto.randomUUID())).toBeNull()
  })

  it('un borrador recién creado no tiene envíos, aprobación ni anterior', async () => {
    const id = await nueva()
    expect(await leerContextoEstado(activo.client, id)).toEqual({
      envios: [],
      vencida: false,
      venceEl: '2026-11-21',
      fechaAprobacion: null,
      anterior: null,
    })
  })

  it('lista los envíos del más reciente al más viejo', async () => {
    const id = await nueva()
    const primero = await enviarCotizacion(activo.client, id)
    const segundo = await enviarCotizacion(activo.client, id)

    const contexto = await leerContextoEstado(activo.client, id)
    expect(contexto?.envios.map((envio) => envio.id)).toEqual([segundo.envioId, primero.envioId])
    expect(contexto?.vencida).toBe(false)
  })

  it('una enviada fuera de validez figura vencida', async () => {
    const id = await nueva()
    await enviarCotizacion(activo.client, id)
    await sql(`update public.cotizaciones set fecha = '2020-01-01', validez_dias = 1 where id = $1`, [id])

    const contexto = await leerContextoEstado(activo.client, id)
    expect(contexto?.vencida).toBe(true)
    expect(contexto?.venceEl).toBe('2020-01-02')
  })

  it('una aprobada tiene su fecha y la duplicada conoce a la anterior', async () => {
    const id = await nueva()
    await aprobarCotizacion(activo.client, id, '2026-10-23')
    expect((await leerContextoEstado(activo.client, id))?.fechaAprobacion).toBe('2026-10-23')

    const { data: copia, error } = await activo.client.rpc('duplicar_cotizacion', { p_id: id })
    if (error) throw error
    creadas.push(copia)
    const [{ numero }] = await sql<{ numero: string }>('select numero from public.cotizaciones where id = $1', [id])

    expect((await leerContextoEstado(activo.client, copia))?.anterior).toEqual({ id, numero: Number(numero) })
  })
})
```

```bash
npm run test:int -- tests/integration/cotizaciones-contexto.test.ts
```

Expected: FAIL (no existe `@/lib/cotizaciones/contexto-estado`).

- [ ] **Step 4: Implementar `contexto-estado.ts`**

```ts
// src/lib/cotizaciones/contexto-estado.ts
// Lo que el editor necesita saber del estado de una cotización guardada y que no está en EstadoEditor:
// los envíos, el vencimiento, la fecha de aprobación y la cotización que reemplaza.
// Recibe el cliente de Supabase por parámetro (no importar 'server-only': lo carga Vitest).
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/lib/supabase/database.types'

export type ContextoEstado = {
  /** Envíos de la cotización, el más reciente primero. */
  envios: { id: string; enviada_at: string }[]
  /** Enviada y fuera de validez (v_cotizaciones.vencida). */
  vencida: boolean
  /** fecha + validez_dias ('YYYY-MM-DD'). */
  venceEl: string | null
  /** 'YYYY-MM-DD', solo en aprobadas. */
  fechaAprobacion: string | null
  /** La cotización que esta reemplaza (reemplaza_a): la de la que se duplicó para renegociar. */
  anterior: { id: string; numero: number } | null
}

/** El de una cotización que todavía no se guardó. */
export const CONTEXTO_NUEVA: ContextoEstado = { envios: [], vencida: false, venceEl: null, fechaAprobacion: null, anterior: null }

/** null si la cotización no existe (o la RLS no la deja ver). */
export async function leerContextoEstado(supabase: SupabaseClient<Database>, id: string): Promise<ContextoEstado | null> {
  const [fila, envios] = await Promise.all([
    supabase.from('v_cotizaciones').select('vencida, vence_el, fecha_aprobacion, reemplaza_a').eq('id', id).maybeSingle(),
    supabase
      .from('cotizacion_envios')
      .select('id, enviada_at')
      .eq('cotizacion_id', id)
      .order('enviada_at', { ascending: false }),
  ])
  if (fila.error) throw fila.error
  if (envios.error) throw envios.error
  if (!fila.data) return null

  let anterior: ContextoEstado['anterior'] = null
  if (fila.data.reemplaza_a) {
    const { data, error } = await supabase.from('cotizaciones').select('id, numero').eq('id', fila.data.reemplaza_a).maybeSingle()
    if (error) throw error
    anterior = data
  }

  return {
    envios: envios.data,
    vencida: fila.data.vencida ?? false,
    venceEl: fila.data.vence_el,
    fechaAprobacion: fila.data.fecha_aprobacion,
    anterior,
  }
}
```

```bash
npm run test:int -- tests/integration/cotizaciones-contexto.test.ts
```

Expected: PASS (5 tests).

- [ ] **Step 5: Panel de vista previa**

`src/components/cotizaciones/editor/panel-vista-previa.tsx`: un solo archivo con el hook (`useVistaPrevia`), el panel presentacional (`PanelVistaPrevia`), el `Sheet` de tablet (`VistaPreviaLateral`) y el botón del celular (`BotonVistaPreviaCelular`). El estado vive en el hook, que monta `EditorCotizacion` una sola vez: la columna fija y el `Sheet` muestran el mismo blob (no se genera dos veces ni quedan blobs sin liberar).

Notas para no romper el lint (`eslint-config-next` 16 trae las reglas del compilador de React): el `setState` dentro de `actualizar` corre desde una función y no directo en el cuerpo del efecto (`react-hooks/set-state-in-effect`), y los `ref.current` se leen y escriben solo en efectos y handlers (`react-hooks/refs`).

```tsx
'use client'

import { CircleAlert, ExternalLink, FileText, RefreshCw } from 'lucide-react'
import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import type { EstadoEditor } from '@/lib/cotizaciones/editor'
import {
  mensajeErrorVistaPrevia,
  modoVistaPrevia,
  urlPdfActual,
  urlVisor,
  vistaDesactualizada,
  type ModoVistaPrevia,
} from '@/lib/cotizaciones/vista-previa'
import { cn } from '@/lib/utils'

/** Desde este ancho la vista previa es una columna fija (docs/diseno/referencias/03-editor-cotizacion.png). */
const ESCRITORIO = '(min-width: 72rem)'

function suscribirEscritorio(avisar: () => void) {
  const consulta = window.matchMedia(ESCRITORIO)
  consulta.addEventListener('change', avisar)
  return () => consulta.removeEventListener('change', avisar)
}

/** true con la columna de vista previa visible; en el servidor, false. */
export function useEsEscritorio(): boolean {
  return useSyncExternalStore(
    suscribirEscritorio,
    () => window.matchMedia(ESCRITORIO).matches,
    () => false,
  )
}

class ErrorRespuesta extends Error {
  status: number
  constructor(status: number) {
    super(`La vista previa respondió ${status}`)
    this.status = status
  }
}

export type VistaPrevia = {
  modo: ModoVistaPrevia
  /** blob: de la última vista previa generada, o la ruta del PDF guardado. */
  url: string | null
  cargando: boolean
  error: string | null
  /** Lo que hay en pantalla cambió después de generarla. */
  desactualizada: boolean
  actualizar: () => void
}

/**
 * Estado de la vista previa. Vive en EditorCotizacion y lo comparten la columna fija y el panel lateral, así hay un
 * solo PDF generado y un solo blob que liberar. Se genera con el botón, no en cada tecla (decisión 16); con
 * `automatica`, la primera vez que se puede se genera sola (en escritorio, donde la columna está a la vista).
 */
export function useVistaPrevia(estado: EstadoEditor, { automatica }: { automatica: boolean }): VistaPrevia {
  const modo = modoVistaPrevia(estado)
  const [generada, setGenerada] = useState<{ url: string; con: EstadoEditor } | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const pedido = useRef<AbortController | null>(null)
  const urlViva = useRef<string | null>(null)
  const intentada = useRef(false)

  const actualizar = useCallback(() => {
    pedido.current?.abort()
    const controlador = new AbortController()
    pedido.current = controlador
    const enviado = estado
    setCargando(true)
    setError(null)
    void (async () => {
      try {
        const respuesta = await fetch('/cotizaciones/vista-previa', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado: enviado }),
          signal: controlador.signal,
        })
        if (!respuesta.ok) throw new ErrorRespuesta(respuesta.status)
        const pdf = await respuesta.blob()
        if (controlador.signal.aborted) return
        // El blob anterior se libera recién cuando hay uno nuevo: el <iframe> lo sigue mostrando hasta entonces.
        const url = URL.createObjectURL(pdf)
        if (urlViva.current) URL.revokeObjectURL(urlViva.current)
        urlViva.current = url
        setGenerada({ url, con: enviado })
      } catch (e) {
        if (controlador.signal.aborted) return
        if (!(e instanceof ErrorRespuesta)) console.error(e)
        setError(mensajeErrorVistaPrevia(e instanceof ErrorRespuesta ? e.status : null))
      } finally {
        if (pedido.current === controlador) {
          pedido.current = null
          setCargando(false)
        }
      }
    })()
  }, [estado])

  useEffect(() => {
    if (!automatica || modo.tipo !== 'generada' || intentada.current) return
    intentada.current = true
    actualizar()
  })

  useEffect(
    () => () => {
      pedido.current?.abort()
      // En desarrollo, StrictMode desmonta y vuelve a montar: el pedido automático abortado se tiene que repetir.
      intentada.current = false
      if (urlViva.current) URL.revokeObjectURL(urlViva.current)
      urlViva.current = null
    },
    [],
  )

  const desactualizada = useMemo(() => vistaDesactualizada(generada?.con ?? null, estado), [generada, estado])
  const url = modo.tipo === 'generada' ? (generada?.url ?? null) : modo.tipo === 'guardada' ? modo.url : null
  return { modo, url, cargando, error, desactualizada, actualizar }
}

/** Hoja vacía con líneas tenues: mientras se genera la primera vista previa o antes de pedirla. */
function HojaVacia({ cargando }: { cargando: boolean }) {
  return (
    <div className="absolute inset-0 p-[9%]">
      <div aria-hidden className={cn('space-y-2.5', cargando && 'animate-pulse')}>
        <div className="ml-auto h-6 w-2/5 rounded-sm bg-slate-100" />
        <div className="h-2 w-1/2 rounded-sm bg-slate-100" />
        <div className="h-2 w-3/5 rounded-sm bg-slate-100" />
        <div className="h-2 w-2/5 rounded-sm bg-slate-100" />
        <div className="h-16 w-full rounded-sm bg-slate-100" />
        <div className="h-2 w-full rounded-sm bg-slate-100" />
        <div className="h-2 w-11/12 rounded-sm bg-slate-100" />
        <div className="h-2 w-4/5 rounded-sm bg-slate-100" />
      </div>
      {cargando ? null : (
        <p className="absolute inset-x-6 bottom-[30%] text-center text-[13px] text-muted-foreground">
          Tocá «Actualizar vista previa» para ver cómo sale el PDF.
        </p>
      )}
    </div>
  )
}

/**
 * Columna "Vista previa" del editor: la hoja en un pozo gris, con el PDF real en un <iframe> (decisión 16).
 * Presentacional: el estado lo maneja useVistaPrevia.
 */
export function PanelVistaPrevia({
  vista,
  linea,
  className,
}: {
  vista: VistaPrevia
  /** lineaVistaPrevia(…): qué se está viendo. */
  linea: string
  className?: string
}) {
  const idTitulo = useId()
  const { modo } = vista

  return (
    <section aria-labelledby={idTitulo} className={cn('space-y-3', className)}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 space-y-0.5">
          <h2 id={idTitulo} className="text-lg leading-tight font-semibold tracking-tight">
            Vista previa
          </h2>
          {linea ? (
            <p className={cn('text-[13px] text-muted-foreground', vista.desactualizada && 'text-amber-700')}>{linea}</p>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {modo.tipo === 'generada' ? (
            <Button type="button" variant="outline" size="sm" onClick={vista.actualizar} disabled={vista.cargando}>
              <RefreshCw className={cn(vista.cargando && 'animate-spin')} aria-hidden />
              Actualizar vista previa
            </Button>
          ) : null}
          {vista.url ? (
            <Button asChild variant="ghost" size="icon-sm" className="text-muted-foreground">
              <a
                href={vista.url}
                target="_blank"
                rel="noopener"
                aria-label="Abrir el PDF en otra pestaña"
                title="Abrir el PDF en otra pestaña"
              >
                <ExternalLink aria-hidden />
              </a>
            </Button>
          ) : null}
        </div>
      </div>
      <p role="status" className="sr-only">
        {vista.cargando ? 'Generando la vista previa…' : ''}
      </p>

      {modo.tipo === 'sin-pdf' ? (
        <div className="rounded-xl border border-dashed px-6 py-12 text-center text-sm text-muted-foreground">
          Un presupuesto directo no tiene PDF.
        </div>
      ) : (
        <div className="max-h-[calc(100svh-8.5rem)] overflow-y-auto overscroll-contain rounded-xl bg-muted p-3">
          {vista.error ? (
            <div
              role="alert"
              className="flex aspect-[210/297] w-full flex-col items-center justify-center gap-3 rounded-[2px] bg-background px-6 text-center text-sm"
            >
              <CircleAlert className="size-6 text-destructive" aria-hidden />
              <p>{vista.error}</p>
              <Button type="button" variant="outline" size="sm" onClick={vista.actualizar} disabled={vista.cargando}>
                Reintentar
              </Button>
            </div>
          ) : (
            <div
              className={cn(
                'relative aspect-[210/297] w-full overflow-hidden rounded-[2px] bg-white shadow-md ring-1 ring-black/5 transition-opacity',
                (vista.desactualizada || (vista.cargando && vista.url)) && 'opacity-60',
              )}
            >
              {vista.url ? (
                // Un <iframe> nuevo por PDF (key): cambiarle el src agregaría entradas al historial y "Atrás"
                // navegaría dentro del panel en vez de salir del editor.
                <iframe
                  key={vista.url}
                  src={urlVisor(vista.url)}
                  title="Vista previa del PDF"
                  className="absolute inset-0 size-full border-0"
                />
              ) : modo.tipo === 'sin-cliente' ? (
                <p className="absolute inset-0 grid place-items-center px-6 text-center text-sm text-muted-foreground">
                  Elegí el cliente para ver cómo sale el PDF.
                </p>
              ) : (
                <HojaVacia cargando={vista.cargando} />
              )}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

/**
 * Entre md y 72rem no hay columna: la barra inferior abre el mismo panel en un Sheet lateral.
 * Si todavía no se generó ninguna, se genera al abrirlo.
 */
export function VistaPreviaLateral({ vista, linea }: { vista: VistaPrevia; linea: string }) {
  if (vista.modo.tipo === 'sin-pdf') return null
  return (
    <Sheet
      onOpenChange={(abierta) => {
        if (abierta && vista.modo.tipo === 'generada' && !vista.url && !vista.cargando) vista.actualizar()
      }}
    >
      <SheetTrigger asChild>
        <Button type="button" variant="outline" size="lg" className="hidden h-10 px-3.5 text-[15px] md:inline-flex">
          <FileText aria-hidden />
          Vista previa
        </Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        className="gap-0 overflow-y-auto px-4 pt-12 pb-6 data-[side=right]:w-full data-[side=right]:sm:max-w-[28rem]"
      >
        <SheetTitle className="sr-only">Vista previa del PDF</SheetTitle>
        <SheetDescription className="sr-only">Cómo sale el PDF con lo que hay en pantalla.</SheetDescription>
        <PanelVistaPrevia vista={vista} linea={linea} />
      </SheetContent>
    </Sheet>
  )
}

/**
 * En el celular la vista previa es el PDF en otra pestaña (diseño §6): se guarda y se abre la versión actual.
 * `guardarParaVer` devuelve el id de la cotización ya guardada, o null si no se pudo guardar.
 */
export function BotonVistaPreviaCelular({
  modo,
  guardarParaVer,
}: {
  modo: ModoVistaPrevia
  guardarParaVer: () => Promise<string | null>
}) {
  const [abriendo, setAbriendo] = useState(false)
  if (modo.tipo === 'sin-pdf') return null

  const clases = 'h-10 px-3.5 text-[15px] md:hidden'
  if (modo.tipo === 'guardada') {
    return (
      <Button asChild variant="outline" size="lg" className={clases}>
        <a href={modo.url} target="_blank" rel="noopener">
          <FileText aria-hidden />
          Vista previa
        </a>
      </Button>
    )
  }

  async function abrir() {
    // La pestaña se abre en el clic: abierta después de guardar, el navegador la bloquearía por no venir del usuario.
    const pestana = window.open('', '_blank')
    setAbriendo(true)
    try {
      const id = await guardarParaVer()
      if (!id) {
        pestana?.close()
        return
      }
      if (pestana) {
        pestana.opener = null
        pestana.location.href = urlPdfActual(id)
      } else {
        toast.info('El navegador bloqueó la pestaña nueva: permitila para ver la vista previa.')
      }
    } finally {
      setAbriendo(false)
    }
  }

  return (
    <Button type="button" variant="outline" size="lg" className={clases} onClick={abrir} disabled={abriendo}>
      <FileText aria-hidden />
      {abriendo ? 'Guardando…' : 'Vista previa'}
    </Button>
  )
}
```

Detalles que importan:
- `key={vista.url}` en el `<iframe>`: un iframe nuevo por PDF. Cambiarle el `src` agregaría entradas al historial y "Atrás" navegaría dentro del panel.
- El `Sheet` limita el ancho con `data-[side=right]:sm:max-w-sm`; para que gane el ancho de 28rem la clase tiene que llevar el mismo prefijo (`data-[side=right]:sm:max-w-[28rem]`): `cn` (tailwind-merge) reemplaza la de shadcn solo si coinciden las variantes.
- En el celular la pestaña se abre **en el clic** (`window.open('', '_blank')`) y se navega después de guardar: abierta después de un `await`, el navegador la bloquea.

```bash
npm run lint && npm run typecheck
```

Expected: sin errores (el archivo todavía no se usa).

- [ ] **Step 6: Conectar el panel al editor**

**6a. `src/app/(app)/cotizaciones/[id]/page.tsx` (Task 8).** El contexto se lee con lo demás en la rama del editor (la vista de solo lectura de cargadas y directas no cambia). Import:

```tsx
import { leerContextoEstado } from '@/lib/cotizaciones/contexto-estado'
```

Reemplazar:

```tsx
  const [catalogos, contactos] = await Promise.all([
    leerCatalogosEditor(supabase, {
      plantillaId: fila.plantilla_id,
      equipoId: fila.equipo_id,
      firmanteId: fila.firmante_id,
    }),
    leerContactos(supabase, fila.cliente_id),
  ])
```

por:

```tsx
  const [catalogos, contactos, contexto] = await Promise.all([
    leerCatalogosEditor(supabase, {
      plantillaId: fila.plantilla_id,
      equipoId: fila.equipo_id,
      firmanteId: fila.firmante_id,
    }),
    leerContactos(supabase, fila.cliente_id),
    leerContextoEstado(supabase, id),
  ])
  if (!contexto) notFound()
```

y el `<EditorCotizacion … />` del final por:

```tsx
      <EditorCotizacion
        inicial={inicial}
        catalogos={catalogos}
        contactos={contactos}
        hoy={hoyArgentina()}
        contexto={contexto}
      />
```

**6b. `src/components/cotizaciones/editor/editor-cotizacion.tsx` (Task 8).** Imports nuevos:

```tsx
import { CONTEXTO_NUEVA, type ContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import { lineaVistaPrevia } from '@/lib/cotizaciones/vista-previa'
import {
  BotonVistaPreviaCelular,
  PanelVistaPrevia,
  useEsEscritorio,
  useVistaPrevia,
  VistaPreviaLateral,
} from './panel-vista-previa'
```

Prop opcional `contexto` (la página `nueva` no la pasa). En la desestructuración, después de `hoy,`:

```tsx
  contexto = CONTEXTO_NUEVA,
```

y en el tipo, después de `hoy: string`:

```tsx
  /** Envíos, vencimiento, aprobación y anterior (leerContextoEstado). Una nueva no tiene. */
  contexto?: ContextoEstado
```

Después de `const sueltos = erroresSinCampo(errores)`:

```tsx

  // Vista previa (Task 11): un solo estado para la columna fija (≥ 72rem) y el panel lateral (md a 72rem).
  const escritorio = useEsEscritorio()
  const vista = useVistaPrevia(estado, { automatica: escritorio })
  const lineaVista = lineaVistaPrevia({
    modo: vista.modo,
    estado: estado.estado,
    origen: estado.origen,
    desactualizada: vista.desactualizada,
    ultimoEnvio: contexto.envios[0]?.enviada_at ?? null,
    fechaAprobacion: contexto.fechaAprobacion,
  })
```

Después de la función `guardar` (antes del efecto "Con errores, el foco va al primer campo marcado"). `guardar()` ya devuelve la versión actual cuando no hay cambios:

```tsx
  /** Para el celular: guarda si hace falta y devuelve el id de lo guardado (null si no se pudo). */
  async function guardarParaVer(): Promise<string | null> {
    const guardada = await guardar()
    return guardada?.id ?? null
  }
```

En el JSX, reemplazar el `<aside>` con el marco vacío:

```tsx
          <aside aria-label="Vista previa" className="sticky top-18 hidden self-start min-[72rem]:block">
            {/* Task 11: <PanelVistaPrevia …/> reemplaza este marco vacío (pozo gris con la hoja A4). */}
            <div className="rounded-xl bg-muted p-3">
              <div className="aspect-[210/297] w-full rounded-[2px] bg-white shadow-md ring-1 ring-black/5" />
            </div>
          </aside>
```

por (sin `aria-label`: el panel ya es una región con su título "Vista previa"):

```tsx
          {/* 56 px de migas + 16: la columna acompaña el scroll debajo de la barra (relev-visual §3.8). */}
          <aside className="sticky top-18 hidden self-start min-[72rem]:block">
            <PanelVistaPrevia vista={vista} linea={lineaVista} />
          </aside>
```

y sumarle a `<BarraInferior … />`, después de `alGuardar={() => void guardar()}`, el hueco que dejó la Task 8 (la barra se oculta desde 72rem, así que estos botones no aparecen en escritorio):

```tsx
        vistaPrevia={
          <>
            <VistaPreviaLateral vista={vista} linea={lineaVista} />
            <BotonVistaPreviaCelular modo={vista.modo} guardarParaVer={guardarParaVer} />
          </>
        }
```

`barra-inferior.tsx` no cambia. Con `vistaPrevia` siempre presente, la barra también se ve (debajo de 72rem) en una aprobada o rechazada, sin Guardar: es el acceso a su PDF.

```bash
npm run lint && npm run typecheck
```

Expected: sin errores ni warnings nuevos.

- [ ] **Step 7: E2E de la vista previa**

Helper compartido de base de datos para los E2E de cotizaciones (lo reutilizan las Tasks 12 y 13):

```ts
// tests/e2e/base-datos.ts
// Acceso directo a la base local para preparar y limpiar datos de los E2E (SUPABASE_DB_URL de .env.local).
import pg from 'pg'

export async function conBase<T>(fn: (db: pg.Client) => Promise<T>): Promise<T> {
  process.loadEnvFile('.env.local')
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  try {
    return await fn(db)
  } finally {
    await db.end()
  }
}

/** Todos los datos que usa la plantilla por jornada de la semilla, completos. */
export const DATOS_COMPLETOS = {
  ubicacion: 'Loma Campana, Añelo',
  horario: 'lunes a sábado de 8 a 17 hs',
  duracion_estimada: '10 jornadas',
  forma_pago: '30 días fecha de factura',
  disponibilidad: 'inmediata',
}

/**
 * Un borrador por jornada para VERTICE, completo: con equipo, firmante, todos los datos que usa la plantilla y
 * precios, así se puede enviar y aprobar sin tocar nada. `estado: 'aprobada'` lo deja aprobado (sin PDF guardado:
 * la ruta del PDF lo dibuja en el momento). Para probar lo que falta (Task 12): `datos` reemplaza los datos y
 * `precioMovilizacion: null` deja el segundo ítem sin precio.
 */
export async function crearCotizacionCompleta(
  db: pg.Client,
  {
    estado = 'borrador',
    datos = DATOS_COMPLETOS,
    precioMovilizacion = 2800000,
  }: { estado?: 'borrador' | 'aprobada'; datos?: Record<string, string>; precioMovilizacion?: number | null } = {},
): Promise<{ id: string; numero: number }> {
  const { rows } = await db.query<{ id: string; numero: string }>(
    `insert into public.cotizaciones
       (cliente_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques)
     select c.id, 'jornada', p.id, e.id, f.id, p.asunto, p.intro, $1::jsonb, p.bloques
     from public.clientes c, public.plantillas p, public.equipos e, public.firmantes f
     where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and p.nombre = 'Por jornada - Grúa con operador'
       and e.nombre = 'Grúa telescópica XCMG 70 TN' and f.nombre = 'Thomas Cravero'
     returning id, numero`,
    [JSON.stringify(datos)],
  )
  const { id, numero } = rows[0]
  await db.query(
    `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad) values
       ($1, 1, 'Precios Jornada', 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)', 1950000, 'JORNADA'),
       ($1, 2, 'Precios Jornada', 'Movilización y desmovilización de Grúa Telescópica', $2::numeric, 'VIAJE')`,
    [id, precioMovilizacion],
  )
  if (estado === 'aprobada') {
    await db.query(
      `update public.cotizaciones set estado = 'aprobada', fecha_aprobacion = fecha, presupuesto_estado = 'en_curso'
       where id = $1`,
      [id],
    )
  }
  return { id, numero: Number(numero) }
}

/** Borra las cotizaciones (con sus ítems y envíos). Los PDF que hayan quedado en Storage no se tocan. */
export async function borrarCotizaciones(db: pg.Client, ids: string[]) {
  await db.query('delete from public.cotizaciones where id = any($1::uuid[])', [ids])
}
```

`tests/e2e/cotizaciones.spec.ts` ya tiene un `conBase` local de la Task 7, idéntico a este: borralo y usá el de `./base-datos` (el `conBaseEditor` de la Task 8 puede quedar; `import pg from 'pg'` lo sigue usando). Sumá a los imports del archivo lo que falte de estos:

```ts
import { expect, test, type Page } from '@playwright/test'
import { borrarCotizaciones, conBase, crearCotizacionCompleta } from './base-datos'
import { iniciarSesion, sufijoUnico } from './helpers'
```

y agregá al final:

```ts
/** La respuesta del POST de la vista previa (el panel la pide sola al abrir y con "Actualizar vista previa"). */
function respuestaVistaPrevia(page: Page) {
  return page.waitForResponse(
    (respuesta) => respuesta.url().endsWith('/cotizaciones/vista-previa') && respuesta.request().method() === 'POST',
  )
}

test.describe('vista previa del editor', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBase((db) => borrarCotizaciones(db, creadas))
  })

  test('se genera con lo que hay en pantalla y avisa cuando quedó vieja', async ({ page }) => {
    const { id } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)

    const primera = respuestaVistaPrevia(page)
    await page.goto(`/cotizaciones/${id}`)
    const respuesta = await primera
    expect(respuesta.status()).toBe(200)
    expect(respuesta.headers()['content-type']).toBe('application/pdf')

    const panel = page.getByRole('region', { name: 'Vista previa' })
    await expect(panel.getByTitle('Vista previa del PDF', { exact: true })).toHaveAttribute(
      'src',
      /^blob:.+#toolbar=0&navpanes=0&view=FitH$/,
    )
    await expect(panel.getByText('Con lo que hay en pantalla, aunque no esté guardado')).toBeVisible()

    await page.getByLabel('Asunto', { exact: true }).fill('Alquiler de grúa para Loma Campana')
    await expect(panel.getByText('Hay cambios sin reflejar')).toBeVisible()

    const segunda = respuestaVistaPrevia(page)
    await panel.getByRole('button', { name: 'Actualizar vista previa' }).click()
    const cuerpo = JSON.parse((await segunda).request().postData() ?? '{}') as { estado: { asunto: string } }
    expect(cuerpo.estado.asunto).toBe('Alquiler de grúa para Loma Campana')
    await expect(panel.getByText('Hay cambios sin reflejar')).toBeHidden()
  })

  test('una aprobada muestra el PDF guardado y no se actualiza', async ({ page }) => {
    const { id } = await conBase((db) => crearCotizacionCompleta(db, { estado: 'aprobada' }))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const panel = page.getByRole('region', { name: 'Vista previa' })
    await expect(panel.getByTitle('Vista previa del PDF', { exact: true })).toHaveAttribute(
      'src',
      `/cotizaciones/${id}/pdf#toolbar=0&navpanes=0&view=FitH`,
    )
    await expect(panel.getByText(/^PDF aprobado el \d{2}\/\d{2}\/\d{4}$/)).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Actualizar vista previa' })).toHaveCount(0)
  })
})
```

Notas: el proyecto de Playwright es "Desktop Chrome" (1280×720), así que la columna fija está a la vista y la primera vista previa se pide sola al abrir. El Chromium sin interfaz de los E2E no dibuja el PDF dentro del iframe (puede tomarlo como una descarga): por eso el test mira la respuesta del POST y el `src` del iframe, no la hoja.

Con Supabase local levantado y sin otro `next dev` en el puerto 3000 (si quedó uno tuyo: `lsof -ti tcp:3000 | xargs kill`):

```bash
npx playwright test tests/e2e/cotizaciones.spec.ts -g "vista previa del editor"
```

Expected: 2 passed (`Asunto` es la etiqueta del campo de `tarjeta-asunto.tsx`, Task 8).

- [ ] **Step 8: Verificación visual de la columna contra la 03**

Script de captura (va en el scratchpad, **no** en el repo). Usa el Chromium completo de Playwright (`channel: 'chromium'`), que sí dibuja el PDF en el iframe:

```js
// <scratchpad>/captura-vista-previa.cjs
// Uso (desde la raíz del repo, con `npm run dev` levantado y los E2E corridos al menos una vez, que crean el usuario):
//   node <scratchpad>/captura-vista-previa.cjs <scratchpad>
const path = require('node:path')
const desdeRepo = (modulo) => require(require.resolve(modulo, { paths: [process.cwd()] }))
const { chromium } = desdeRepo('@playwright/test')
const pg = desdeRepo('pg')

const salida = process.argv[2]
if (!salida) throw new Error('Falta la carpeta de salida (el scratchpad)')
process.loadEnvFile('.env.local')

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  // Como la referencia: VERTICE, por jornada, dos secciones con precio y la ubicación sin completar.
  const { rows } = await db.query(
    `insert into public.cotizaciones (cliente_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques)
     select c.id, 'jornada', p.id, e.id, f.id, p.asunto, p.intro,
       '{"horario": "lunes a sábado de 8 a 17 hs", "duracion_estimada": "10 jornadas",
         "forma_pago": "30 días fecha de factura", "disponibilidad": "inmediata"}'::jsonb, p.bloques
     from public.clientes c, public.plantillas p, public.equipos e, public.firmantes f
     where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and p.nombre = 'Por jornada - Grúa con operador'
       and e.nombre = 'Grúa telescópica XCMG 70 TN' and f.nombre = 'Thomas Cravero'
     returning id`,
  )
  const id = rows[0].id
  await db.query(
    `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad) values
       ($1, 1, 'Precios Jornada', 'Servicio de grúa móvil telescópica XCMG 70 TN', 1950000, 'JORNADA'),
       ($1, 2, 'Precios Jornada Adicional', 'Hora adicional de grúa', 195000, 'HORA')`,
    [id],
  )
  const navegador = await chromium.launch({ channel: 'chromium' })
  try {
    const page = await navegador.newPage({
      viewport: { width: 1200, height: 805 },
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
    })
    await page.goto('http://localhost:3000/login')
    await page.getByLabel('Email').fill('e2e@equipos.test')
    await page.getByLabel('Contraseña').fill('E2e-1234-segura')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.getByRole('heading', { name: 'Inicio' }).waitFor()

    const vista = page.waitForResponse((r) => r.url().endsWith('/cotizaciones/vista-previa'))
    await page.goto(`http://localhost:3000/cotizaciones/${id}`)
    await vista
    await page.waitForTimeout(2000) // el visor termina de dibujar el PDF
    await page.screenshot({ path: path.join(salida, 'app-03-vista-previa.png') })
    await page.mouse.wheel(0, 700)
    await page.waitForTimeout(500)
    await page.screenshot({ path: path.join(salida, 'app-03-vista-previa-scroll.png') })
  } finally {
    await navegador.close()
    await db.query('delete from public.cotizaciones where id = $1', [id])
    await db.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

```bash
npm run dev   # en otra terminal, si no está levantado
node <scratchpad>/captura-vista-previa.cjs <scratchpad>
magick docs/diseno/referencias/03-editor-cotizacion.png -resize 1200x <scratchpad>/ref-03.png
```

Mirá `app-03-vista-previa.png` al lado de `ref-03.png` (solo la columna derecha; el resto del editor se ajusta en la Task 13):
- La columna va de x≈844 a x≈1164 (320 px) y su título "Vista previa" queda a la altura del título de la tarjeta Cliente; "Actualizar vista previa" (outline, chico) y el ícono de abrir a la derecha, en la misma fila.
- La hoja ocupa el ancho del pozo (≈296 px), blanca, con sombra suave y proporción A4; el PDF se ve al ancho (sin barra del visor ni miniaturas). El pozo gris (`bg-muted`) reemplaza al fondo gris de la imagen (decisión 21).
- La variable sin completar (`{{ubicacion}}`) se ve resaltada en amarillo dentro del PDF (lo hace la Task 4), y la línea gris bajo el título dice "Con lo que hay en pantalla, aunque no esté guardado".
- En `app-03-vista-previa-scroll.png` la columna sigue arriba (sticky a 72 px del borde) mientras las tarjetas se desplazaron.

Si algo no coincide, ajustá clases del panel (no de otras tarjetas) y repetí la captura. Matá el `next dev` que levantaste (`lsof -ti tcp:3000 | xargs kill`).

- [ ] **Step 9: Verificación y commit**

```bash
npm run check && npm run test:int && npm run test:e2e
```

Expected: todo en verde (unitarios nuevos, `cotizaciones-contexto.test.ts` y los E2E, incluidos los de las tareas anteriores).

```bash
git add src/lib/cotizaciones/vista-previa.ts src/lib/cotizaciones/vista-previa.test.ts \
  src/lib/cotizaciones/contexto-estado.ts tests/integration/cotizaciones-contexto.test.ts \
  src/components/cotizaciones/editor/panel-vista-previa.tsx src/components/cotizaciones/editor/editor-cotizacion.tsx \
  "src/app/(app)/cotizaciones/[id]/page.tsx" tests/e2e/base-datos.ts tests/e2e/cotizaciones.spec.ts
git commit -m "feat: vista previa del PDF en el editor de cotizaciones

- Columna fija desde 72rem con el PDF real del estado sin guardar (POST /cotizaciones/vista-previa) en un iframe
- Actualizar a pedido, aviso de cambios sin reflejar, error con reintento y blobs liberados
- Aprobadas, rechazadas y cargadas muestran el PDF guardado; panel lateral en tablet y otra pestaña en el celular
- Contexto de estado (envíos, vencimiento, aprobación y anterior) que la página pasa al editor

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 12: Editor: acciones de estado, franjas y confirmaciones

**Depende de:**
- Task 3: `EstadoEditor`, `Pendientes`, `puedeEnviar`, `MENSAJE_CONFLICTO` y la acción `reemplazar` del reducer.
- Task 5: las Server Actions `enviarCotizacion`, `aprobarCotizacion`, `finalizarPresupuesto`, `rechazarCotizacion`, `reabrirCotizacion`, `revertirAprobacion`, `borrarCotizacion` y `duplicarCotizacion` (devuelven `Resultado<…>`; el conflicto de versión llega como `mensaje`).
- Task 7: `AccionesFila` (`src/components/cotizaciones/lista/acciones-fila.tsx`), `TablaCotizaciones`, `ListaCotizacionesMovil` y `FilaCotizacion` (`estado` y `origen`, null en las de la app).
- Task 8: `EditorCotizacion` (`inicial`, `estado`/`despachar`, `guardado`/`setGuardado`, `cambios`, `pendientes`, `accion`/`setAccion`, `guardar({ navegar })`, el hueco de `FranjasEditor` y la prop `acciones` de `EncabezadoEditor`), `idCampoVariable` (`src/lib/cotizaciones/editor-pantalla.ts`), `ConfirmacionEnLugar` (`src/components/formulario/confirmacion-en-lugar.tsx`) y la página `[id]`.
- Task 9: el precio de cada ítem tiene `id="item-{clave}-precio"` y la etiqueta "Precio del ítem N".
- Task 11: `ContextoEstado` / `CONTEXTO_NUEVA` (`src/lib/cotizaciones/contexto-estado.ts`), `fechaDeMarca` (`src/lib/cotizaciones/vista-previa.ts`), la prop `contexto` de `EditorCotizacion` y `tests/e2e/base-datos.ts` (`DATOS_COMPLETOS` y `crearCotizacionCompleta` con `datos` y `precioMovilizacion`).

**Qué deja** (decisiones 11 a 17; relev-visual §1.6, §3.2 y §3.9):
- Los botones de estado a la derecha de Guardar: borrador = **Descargar y marcar enviada** · Aprobar (⋯: Duplicar, Rechazar y, si nunca se envió, Eliminar borrador); enviada o vencida = Rechazar · **Aprobar** (⋯: Descargar y marcar enviada de nuevo, Duplicar); aprobada = Descargar PDF · **Duplicar** (⋯: Revertir aprobación); rechazada = **Reabrir** · Duplicar. El ⋯ suma el historial de envíos con links `?envio=`. Con pendientes, enviar y aprobar quedan deshabilitados (el motivo, en la franja amarilla y en el `title`). Debajo de md los secundarios pasan al ⋯ del encabezado (decisión 16: la barra inferior no lleva transiciones).
- Una nueva también muestra enviar y aprobar (decisión 12): guardan sin navegar (`guardar({ navegar: false })`), hacen la transición con el id y la versión que vuelven y recién ahí van a `/cotizaciones/{id}` con `router.replace`. Una nueva nunca reemplaza a otra (`reemplaza_a` solo lo pone duplicar), así que al navegar no se pierde ninguna oferta de finalizar.
- Enviar = guardar si hay cambios + `enviarCotizacion(id, versión)` + descarga de `/cotizaciones/{id}/pdf?envio={envioId}&descargar=1`. Aprobar = confirmación con la fecha (hoy por defecto, no anterior a la cotización, aviso si se aprueba una versión que el cliente no recibió) + guardar si hay cambios + `aprobarCotizacion` + oferta en el lugar de "Finalizar el presupuesto N° X" si reemplaza a uno en curso. Rechazar, reabrir, revertir y eliminar con confirmación en el lugar (foco en Cancelar, Escape cancela), también cuando se eligen en el ⋯. Duplicar guarda si hace falta, duplica y navega. Mientras corre una acción, todos los botones de acción (Guardar y Ctrl/⌘+S incluidos) quedan deshabilitados.
- `FranjasEditor` entre el encabezado y las tarjetas: conflicto de versión con "Recargar" (con confirmación si hay cambios sin guardar), la confirmación abierta, la franja amarilla de pendientes (cada nombre lleva el foco al campo) y la de estado (enviada, vencida, aprobada, rechazada, duplicada con link a la anterior). Los campos de una aprobada o rechazada ya quedan deshabilitados por el `fieldset` de la Task 8.
- Después de una transición o de "Recargar", el editor toma la versión nueva del servidor sin remontarse.
- `?accion=aprobar|rechazar|reabrir|revertir|borrar` en `/cotizaciones/{id}` abre esa confirmación al entrar. Lo usa el ⋯ de cada fila de la lista (relev-visual §1.6): borrador → Eliminar borrador…; enviada o vencida → Aprobar… y Rechazar…; rechazada → Reabrir… (los cuatro con «…» porque abren una confirmación; solo las de la app).

**Files:**
- Create: `src/lib/cotizaciones/acciones-estado.ts`, `src/lib/cotizaciones/acciones-estado.test.ts`
- Create: `src/components/cotizaciones/editor/acciones-editor.tsx` (hook `useAccionesEstado` y `AccionesEncabezado`), `src/components/cotizaciones/editor/franjas-editor.tsx` (`FranjasEditor`)
- Modify: `src/components/formulario/confirmacion-en-lugar.tsx` (tono `exito`, `textoCancelar` y `confirmarDeshabilitado`, opcionales)
- Modify: `src/components/cotizaciones/editor/editor-cotizacion.tsx`, `src/app/(app)/cotizaciones/[id]/page.tsx` (Tasks 8 y 11)
- Modify: `src/components/cotizaciones/lista/acciones-fila.tsx`, `tabla-cotizaciones.tsx`, `lista-cotizaciones-movil.tsx` (Task 7: transiciones en el ⋯ de la fila)
- Modify: `tests/e2e/cotizaciones.spec.ts` (se suma un `describe`)
- Test: `src/lib/cotizaciones/acciones-estado.test.ts`, `tests/e2e/cotizaciones.spec.ts`, `npm run check`, `npm run test:e2e`

- [ ] **Step 1: Tests de la lógica de estado (fallan)**

La franja amarilla nombra cada variable con la etiqueta de su campo (las de `VARIABLES` que usa `TarjetaDatos`, más "Equipo", "Validez (días)" y "Próxima actualización") y lleva el foco al `id` que da `idCampoVariable` (Task 8); los ítems sin precio llevan al precio del primero (`item-{clave}-precio`, Task 9).

```ts
// src/lib/cotizaciones/acciones-estado.test.ts
import { describe, expect, it } from 'vitest'
import {
  accionDesdeParametro,
  apruebaVersionNoEnviada,
  disposicionAcciones,
  editadaDespuesDelEnvio,
  errorFechaAprobacion,
  esConflicto,
  esEditable,
  estadoAlRevertir,
  fechaHoraDeMarca,
  franjasEstado,
  idPrecioItem,
  motivoBloqueo,
  pendientesVisibles,
  transicionesDeLista,
} from './acciones-estado'
import { CONTEXTO_NUEVA } from './contexto-estado'
import type { ItemEditor, Pendientes } from './editor'

const ID = '0b6f3c1e-5a2d-4f7e-9c8b-1d2e3f4a5b6c'
const ENVIO = { id: '5c1d2e3f-4a5b-4c6d-8e9f-0a1b2c3d4e5f', enviada_at: '2026-10-20T17:35:00.123456+00:00' }
const SIN_PENDIENTES: Pendientes = { variables: [], desconocidas: [], itemsSinPrecio: 0, sinItems: false }

function item(clave: string, precio: string): ItemEditor {
  return { clave, seccion: '', descripcion: 'Jornada', cantidad: '1', precio, unidad: 'JORNADA' }
}

describe('disposicionAcciones', () => {
  const app = { id: ID, origen: 'app' } as const

  it('borrador: enviar es la principal; eliminar solo si nunca se envió', () => {
    expect(disposicionAcciones({ ...app, estado: 'borrador' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'enviar', primaria: true },
        { accion: 'aprobar', primaria: false },
      ],
      menu: ['duplicar', 'rechazar', 'borrar'],
    })
    expect(disposicionAcciones({ ...app, estado: 'borrador' }, { envios: [ENVIO] }).menu).toEqual(['duplicar', 'rechazar'])
  })

  it('enviada: aprobar es la principal y reenviar va al menú', () => {
    expect(disposicionAcciones({ ...app, estado: 'enviada' }, { envios: [ENVIO] })).toEqual({
      botones: [
        { accion: 'rechazar', primaria: false },
        { accion: 'aprobar', primaria: true },
      ],
      menu: ['reenviar', 'duplicar'],
    })
  })

  it('aprobada: descargar y duplicar; revertir en el menú', () => {
    expect(disposicionAcciones({ ...app, estado: 'aprobada' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'descargar', primaria: false },
        { accion: 'duplicar', primaria: true },
      ],
      menu: ['revertir'],
    })
  })

  it('rechazada: reabrir es la principal', () => {
    expect(disposicionAcciones({ ...app, estado: 'rechazada' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'reabrir', primaria: true },
        { accion: 'duplicar', primaria: false },
      ],
      menu: [],
    })
  })

  it('una nueva muestra enviar y aprobar (guardan primero, decisión 12) y las cargadas no usan el editor', () => {
    expect(disposicionAcciones({ id: null, origen: 'app', estado: 'borrador' }, CONTEXTO_NUEVA)).toEqual({
      botones: [
        { accion: 'enviar', primaria: true },
        { accion: 'aprobar', primaria: false },
      ],
      menu: [],
    })
    expect(disposicionAcciones({ ...app, origen: 'importada', estado: 'enviada' }, CONTEXTO_NUEVA)).toEqual({
      botones: [],
      menu: [],
    })
  })
})

describe('motivoBloqueo', () => {
  it('enviar y aprobar esperan a que no falte nada (una nueva se guarda al enviar o aprobar)', () => {
    expect(motivoBloqueo('enviar', SIN_PENDIENTES)).toBeNull()
    expect(motivoBloqueo('aprobar', { ...SIN_PENDIENTES, itemsSinPrecio: 1 })).toBe(
      'Completá lo que falta para enviarla o aprobarla',
    )
    expect(motivoBloqueo('reenviar', SIN_PENDIENTES)).toBeNull()
  })

  it('el resto no depende de lo que falta', () => {
    expect(motivoBloqueo('rechazar', { ...SIN_PENDIENTES, sinItems: true })).toBeNull()
    expect(motivoBloqueo('duplicar', { ...SIN_PENDIENTES, variables: ['ubicacion'] })).toBeNull()
  })
})

describe('transicionesDeLista', () => {
  it('las del ⋯ de una fila según el estado (relev-visual §1.6), solo en las de la app', () => {
    const app = (estado: string) => transicionesDeLista({ estado, origen: null }).map(({ accion }) => accion)
    expect(app('borrador')).toEqual(['borrar'])
    expect(app('enviada')).toEqual(['aprobar', 'rechazar'])
    expect(app('rechazada')).toEqual(['reabrir'])
    expect(app('aprobada')).toEqual([])
    expect(transicionesDeLista({ estado: 'enviada', origen: 'Cargada' })).toEqual([])
    expect(transicionesDeLista({ estado: 'enviada', origen: null })).toEqual([
      { accion: 'aprobar', etiqueta: 'Aprobar…' },
      { accion: 'rechazar', etiqueta: 'Rechazar…' },
    ])
    expect(transicionesDeLista({ estado: 'borrador', origen: null })).toEqual([
      { accion: 'borrar', etiqueta: 'Eliminar borrador…' },
    ])
  })
})

describe('estado y versiones', () => {
  it('solo se editan borradores y enviadas de la app', () => {
    expect(esEditable({ origen: 'app', estado: 'borrador' })).toBe(true)
    expect(esEditable({ origen: 'app', estado: 'enviada' })).toBe(true)
    expect(esEditable({ origen: 'app', estado: 'aprobada' })).toBe(false)
    expect(esEditable({ origen: 'app', estado: 'rechazada' })).toBe(false)
    expect(esEditable({ origen: 'importada', estado: 'enviada' })).toBe(false)
  })

  it('reconoce el conflicto de versión por su mensaje', () => {
    expect(esConflicto('La cotización cambió desde que la abriste; volvé a intentarlo')).toBe(true)
    expect(esConflicto('Hay ítems sin precio')).toBe(false)
    expect(esConflicto(null)).toBe(false)
  })

  it('editada después del envío compara instantes, con microsegundos', () => {
    expect(editadaDespuesDelEnvio(ENVIO.enviada_at, ENVIO.enviada_at)).toBe(false)
    expect(editadaDespuesDelEnvio('2026-10-20T17:35:00.123+00:00', ENVIO.enviada_at)).toBe(false)
    expect(editadaDespuesDelEnvio('2026-10-21T09:00:00+00:00', ENVIO.enviada_at)).toBe(true)
    expect(editadaDespuesDelEnvio('2026-10-21T09:00:00+00:00', null)).toBe(false)
  })

  // Limitación aceptada: revertir la aprobación de una enviada cambia updated_at sin tocar el contenido, así que al
  // volver a aprobarla también avisa. Es solo un aviso (no bloquea) y no hay en la base una marca del último guardado.
  it('avisa al aprobar una enviada con cambios que el cliente no recibió', () => {
    const enviada = { estado: 'enviada', version: ENVIO.enviada_at } as const
    expect(apruebaVersionNoEnviada(enviada, { envios: [ENVIO] }, false)).toBe(false)
    expect(apruebaVersionNoEnviada(enviada, { envios: [ENVIO] }, true)).toBe(true)
    expect(apruebaVersionNoEnviada({ ...enviada, version: '2026-10-22T12:00:00+00:00' }, { envios: [ENVIO] }, false)).toBe(
      true,
    )
    expect(apruebaVersionNoEnviada({ estado: 'borrador', version: ENVIO.enviada_at }, CONTEXTO_NUEVA, true)).toBe(false)
  })

  it('la fecha de aprobación no puede ser anterior a la cotización', () => {
    expect(errorFechaAprobacion('2026-10-25', '2026-10-22')).toBeNull()
    expect(errorFechaAprobacion('2026-10-22', '2026-10-22')).toBeNull()
    expect(errorFechaAprobacion('2026-10-21', '2026-10-22')).toBe(
      'No puede ser anterior a la fecha de la cotización (22/10/2026)',
    )
    expect(errorFechaAprobacion('', '2026-10-22')).toBe('Ingresá la fecha de aprobación')
  })

  it('al revertir vuelve a enviada si alguna vez se envió', () => {
    expect(estadoAlRevertir({ envios: [ENVIO] })).toBe('enviada')
    expect(estadoAlRevertir(CONTEXTO_NUEVA)).toBe('borrador')
  })

  it('el parámetro ?accion= solo acepta las que piden confirmación', () => {
    expect(accionDesdeParametro('aprobar')).toBe('aprobar')
    expect(accionDesdeParametro('borrar')).toBe('borrar')
    expect(accionDesdeParametro('enviar')).toBeNull()
    expect(accionDesdeParametro(['aprobar'])).toBeNull()
    expect(accionDesdeParametro(undefined)).toBeNull()
  })

  it('cada envío del historial lleva fecha y hora argentinas', () => {
    expect(fechaHoraDeMarca(ENVIO.enviada_at)).toBe('20/10/2026 14:35')
  })
})

describe('franjasEstado', () => {
  it('enviada: la fecha del último envío y el aviso de que lo editado no le llega al cliente', () => {
    expect(franjasEstado({ estado: 'enviada' }, { ...CONTEXTO_NUEVA, envios: [ENVIO] })).toEqual([
      {
        tipo: 'enviada',
        texto: 'Enviada el 20/10/2026. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.',
        envioId: ENVIO.id,
      },
    ])
  })

  it('vencida reemplaza a la de enviada', () => {
    expect(
      franjasEstado({ estado: 'enviada' }, { ...CONTEXTO_NUEVA, envios: [ENVIO], vencida: true, venceEl: '2026-10-20' }),
    ).toEqual([
      { tipo: 'vencida', texto: 'Venció el 20/10/2026. Duplicala para renegociar o aprobala si el cliente la aceptó.' },
    ])
  })

  it('aprobada, rechazada y duplicada', () => {
    const anterior = { id: ID, numero: 112706 }
    expect(franjasEstado({ estado: 'aprobada' }, { ...CONTEXTO_NUEVA, fechaAprobacion: '2026-10-25', anterior })).toEqual([
      { tipo: 'aprobada', texto: 'Aprobada el 25/10/2026: es un presupuesto y no se modifica.' },
      { tipo: 'duplicada', anterior },
    ])
    expect(franjasEstado({ estado: 'rechazada' }, CONTEXTO_NUEVA)).toEqual([
      { tipo: 'rechazada', texto: 'Rechazada. Para volver a editarla, reabrila.' },
    ])
    expect(franjasEstado({ estado: 'borrador' }, CONTEXTO_NUEVA)).toEqual([])
  })
})

describe('pendientesVisibles', () => {
  it('lista cada campo una vez, con su etiqueta y el id al que va el foco', () => {
    const { faltan } = pendientesVisibles(
      { ...SIN_PENDIENTES, variables: ['capacidad', 'equipo_descripcion', 'ubicacion', 'validez_dias'] },
      { items: [] },
    )
    expect(faltan).toEqual([
      { clave: 'variable-capacidad', texto: 'Equipo', destino: 'cotizacion-equipo' },
      { clave: 'variable-ubicacion', texto: 'Lugar del servicio', destino: 'cotizacion-dato-ubicacion' },
      { clave: 'variable-validez_dias', texto: 'Validez (días)', destino: 'cotizacion-validez' },
    ])
  })

  it('el número no tiene campo: se nombra sin llevar el foco', () => {
    expect(pendientesVisibles({ ...SIN_PENDIENTES, variables: ['numero'] }, { items: [] }).faltan).toEqual([
      { clave: 'variable-numero', texto: 'Número de cotización', destino: null },
    ])
  })

  it('los ítems sin precio llevan al primer precio vacío o ilegible', () => {
    const { faltan } = pendientesVisibles(
      { ...SIN_PENDIENTES, itemsSinPrecio: 2 },
      { items: [item('a', '1.950.000'), item('b', ''), item('c', ' ')] },
    )
    expect(faltan).toEqual([{ clave: 'items-sin-precio', texto: '2 ítems sin precio', destino: idPrecioItem('b') }])
    expect(
      pendientesVisibles({ ...SIN_PENDIENTES, itemsSinPrecio: 1 }, { items: [item('a', '1.950.000'), item('b', '19,5,0')] })
        .faltan[0].destino,
    ).toBe(idPrecioItem('b'))
    expect(pendientesVisibles({ ...SIN_PENDIENTES, itemsSinPrecio: 1 }, { items: [item('b', '')] }).faltan[0].texto).toBe(
      '1 ítem sin precio',
    )
  })

  it('sin ítems y variables mal escritas', () => {
    expect(pendientesVisibles({ ...SIN_PENDIENTES, sinItems: true, desconocidas: ['ubicación'] }, { items: [] })).toEqual({
      faltan: [{ clave: 'sin-items', texto: 'al menos un ítem', destino: null }],
      malEscritas: ['{{ubicación}}'],
    })
  })
})
```

```bash
npm test -- src/lib/cotizaciones/acciones-estado.test.ts
```

Expected: FAIL (no existe `./acciones-estado`).

- [ ] **Step 2: Implementar `acciones-estado.ts`**

```ts
// src/lib/cotizaciones/acciones-estado.ts
// Qué acciones de estado ofrece el editor, qué franjas muestra y qué falta para enviar (decisiones 11 a 17).
// Puro: lo usan los componentes de cliente del editor.
import { formatFechaCorta, ZONA_ARGENTINA } from '@/lib/format/fechas'
import { parsePrecio } from '@/lib/format/montos'
import { VARIABLES, type NombreVariable } from '@/lib/plantillas/variables'
import type { ContextoEstado } from './contexto-estado'
import { MENSAJE_CONFLICTO, puedeEnviar, type EstadoEditor, type Pendientes } from './editor'
import { idCampoVariable } from './editor-pantalla'
import { fechaDeMarca } from './vista-previa'

/** El error de private.exigir_version (MENSAJE_CONFLICTO, editor.ts): la cotización cambió desde que se abrió. */
export function esConflicto(mensaje: string | null | undefined): boolean {
  return mensaje === MENSAJE_CONFLICTO
}

export type AccionEstado =
  | 'enviar'
  | 'reenviar'
  | 'aprobar'
  | 'rechazar'
  | 'reabrir'
  | 'revertir'
  | 'borrar'
  | 'duplicar'
  | 'descargar'

export const ETIQUETA_ACCION: Record<AccionEstado, string> = {
  enviar: 'Descargar y marcar enviada',
  reenviar: 'Descargar y marcar enviada de nuevo',
  aprobar: 'Aprobar',
  rechazar: 'Rechazar',
  reabrir: 'Reabrir',
  revertir: 'Revertir aprobación',
  borrar: 'Eliminar borrador',
  duplicar: 'Duplicar',
  descargar: 'Descargar PDF',
}

/** El texto del botón mientras la acción corre. */
export const ETIQUETA_EN_CURSO: Record<AccionEstado, string> = {
  enviar: 'Generando…',
  reenviar: 'Generando…',
  aprobar: 'Aprobando…',
  rechazar: 'Rechazando…',
  reabrir: 'Reabriendo…',
  revertir: 'Revirtiendo…',
  borrar: 'Eliminando…',
  duplicar: 'Duplicando…',
  descargar: 'Descargar PDF',
}

/** Las que piden confirmación en el lugar (decisión 15). Duplicar y enviar no. */
export const CONFIRMABLES = ['aprobar', 'rechazar', 'reabrir', 'revertir', 'borrar'] as const
export type AccionConfirmable = (typeof CONFIRMABLES)[number]

export function esConfirmable(accion: AccionEstado): accion is AccionConfirmable {
  return (CONFIRMABLES as readonly string[]).includes(accion)
}

/** `?accion=aprobar` (desde el menú de una fila de la lista): abre esa confirmación al entrar. */
export function accionDesdeParametro(valor: string | string[] | undefined): AccionConfirmable | null {
  return typeof valor === 'string' && (CONFIRMABLES as readonly string[]).includes(valor)
    ? (valor as AccionConfirmable)
    : null
}

/** Una transición del ⋯ de una fila de la lista: lleva a `/cotizaciones/{id}?accion={accion}`. */
export type TransicionLista = { accion: AccionConfirmable; etiqueta: string }

/**
 * Las transiciones del ⋯ de una fila de la lista (relev-visual §1.6), solo en las armadas en la app (`origen` es el
 * de FilaCotizacion: null en las de la app). Llevan al editor con la confirmación abierta; si al entrar ya no se
 * puede (por ejemplo, un borrador que ya se envió no se elimina), el editor no la abre.
 */
export function transicionesDeLista(fila: { estado: string; origen: string | null }): TransicionLista[] {
  if (fila.origen !== null) return []
  switch (fila.estado) {
    case 'borrador':
      return [{ accion: 'borrar', etiqueta: 'Eliminar borrador…' }]
    case 'enviada':
      return [
        { accion: 'aprobar', etiqueta: 'Aprobar…' },
        { accion: 'rechazar', etiqueta: 'Rechazar…' },
      ]
    case 'rechazada':
      return [{ accion: 'reabrir', etiqueta: 'Reabrir…' }]
    default:
      return []
  }
}

/** Solo se editan los borradores y las enviadas armadas en la app (guardar_cotizacion rechaza el resto). */
export function esEditable(estado: Pick<EstadoEditor, 'origen' | 'estado'>): boolean {
  return estado.origen === 'app' && (estado.estado === 'borrador' || estado.estado === 'enviada')
}

export type BotonAccion = { accion: AccionEstado; primaria: boolean }
export type DisposicionAcciones = {
  /** Los botones del encabezado después de Guardar, de izquierda a derecha. */
  botones: BotonAccion[]
  /** Lo que va en el menú ⋯ (los envíos anteriores se agregan aparte). */
  menu: AccionEstado[]
}

/**
 * Los botones de cada estado (docs/diseno/referencias/03-editor-cotizacion.png y relev-visual §3.2). Las cargadas y
 * las directas no usan el editor (decisión 24). Eliminar solo aparece en un borrador que nunca se envió. Una nueva
 * muestra enviar y aprobar: guardan primero (decisión 12).
 */
export function disposicionAcciones(
  estado: Pick<EstadoEditor, 'id' | 'estado' | 'origen'>,
  contexto: Pick<ContextoEstado, 'envios'>,
): DisposicionAcciones {
  if (estado.origen !== 'app') return { botones: [], menu: [] }
  if (!estado.id) {
    return { botones: [{ accion: 'enviar', primaria: true }, { accion: 'aprobar', primaria: false }], menu: [] }
  }
  switch (estado.estado) {
    case 'borrador':
      return {
        botones: [
          { accion: 'enviar', primaria: true },
          { accion: 'aprobar', primaria: false },
        ],
        menu: contexto.envios.length ? ['duplicar', 'rechazar'] : ['duplicar', 'rechazar', 'borrar'],
      }
    case 'enviada':
      return {
        botones: [
          { accion: 'rechazar', primaria: false },
          { accion: 'aprobar', primaria: true },
        ],
        menu: ['reenviar', 'duplicar'],
      }
    case 'aprobada':
      return {
        botones: [
          { accion: 'descargar', primaria: false },
          { accion: 'duplicar', primaria: true },
        ],
        menu: ['revertir'],
      }
    case 'rechazada':
      return {
        botones: [
          { accion: 'reabrir', primaria: true },
          { accion: 'duplicar', primaria: false },
        ],
        menu: [],
      }
  }
}

/**
 * Por qué un botón está deshabilitado (null: se puede). El detalle de lo que falta va en la franja amarilla. Una
 * nueva no se bloquea por no estar guardada: enviar y aprobar la guardan primero (decisión 12).
 */
export function motivoBloqueo(accion: AccionEstado, pendientes: Pendientes): string | null {
  if (accion !== 'enviar' && accion !== 'reenviar' && accion !== 'aprobar') return null
  if (!puedeEnviar(pendientes)) return 'Completá lo que falta para enviarla o aprobarla'
  return null
}

/** true si la cotización se editó después del último envío (marcar_enviada deja updated_at = enviada_at). */
export function editadaDespuesDelEnvio(version: string | null, ultimoEnvio: string | null): boolean {
  if (!version || !ultimoEnvio) return false
  return new Date(version).getTime() > new Date(ultimoEnvio).getTime()
}

/**
 * Aprobar una enviada con cambios que el cliente no recibió congela una versión que no vio (decisión 14).
 * Limitación aceptada: después de revertir la aprobación de una enviada, updated_at queda posterior al último envío
 * aunque el contenido no haya cambiado, y el aviso aparece igual. Es solo un aviso; no hay en la base una marca del
 * último guardado de contenido con la que distinguirlo.
 */
export function apruebaVersionNoEnviada(
  estado: Pick<EstadoEditor, 'estado' | 'version'>,
  contexto: Pick<ContextoEstado, 'envios'>,
  hayCambiosSinGuardar: boolean,
): boolean {
  if (estado.estado !== 'enviada') return false
  return hayCambiosSinGuardar || editadaDespuesDelEnvio(estado.version, contexto.envios[0]?.enviada_at ?? null)
}

/** El mensaje de la fecha de aprobación (null si sirve). La base vuelve a controlarlo. */
export function errorFechaAprobacion(fecha: string, fechaCotizacion: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return 'Ingresá la fecha de aprobación'
  if (fecha < fechaCotizacion) {
    return `No puede ser anterior a la fecha de la cotización (${formatFechaCorta(fechaCotizacion)})`
  }
  return null
}

/** Qué pasa al revertir: vuelve a enviada si se envió alguna vez (revertir_aprobacion). */
export function estadoAlRevertir(contexto: Pick<ContextoEstado, 'envios'>): 'enviada' | 'borrador' {
  return contexto.envios.length ? 'enviada' : 'borrador'
}

const HORA = new Intl.DateTimeFormat('es-AR', {
  timeZone: ZONA_ARGENTINA,
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})

/** "20/10/2026 14:35" (hora argentina): cada envío del historial. */
export function fechaHoraDeMarca(marca: string): string {
  return `${fechaDeMarca(marca)} ${HORA.format(new Date(marca))}`
}

export type Franja =
  | { tipo: 'enviada'; texto: string; envioId: string | null }
  | { tipo: 'vencida'; texto: string }
  | { tipo: 'aprobada'; texto: string }
  | { tipo: 'rechazada'; texto: string }
  | { tipo: 'duplicada'; anterior: { id: string; numero: number } }

/** Las franjas de estado bajo el encabezado (relev-visual §3.9), en orden. */
export function franjasEstado(estado: Pick<EstadoEditor, 'estado'>, contexto: ContextoEstado): Franja[] {
  const franjas: Franja[] = []
  if (estado.estado === 'enviada') {
    if (contexto.vencida && contexto.venceEl) {
      franjas.push({
        tipo: 'vencida',
        texto: `Venció el ${formatFechaCorta(contexto.venceEl)}. Duplicala para renegociar o aprobala si el cliente la aceptó.`,
      })
    } else {
      const ultimo = contexto.envios[0] ?? null
      franjas.push({
        tipo: 'enviada',
        texto: `${ultimo ? `Enviada el ${fechaDeMarca(ultimo.enviada_at)}` : 'Enviada'}. Lo que edites no le llega al cliente hasta que la vuelvas a mandar.`,
        envioId: ultimo?.id ?? null,
      })
    }
  }
  if (estado.estado === 'aprobada') {
    const fecha = contexto.fechaAprobacion ? ` el ${formatFechaCorta(contexto.fechaAprobacion)}` : ''
    franjas.push({ tipo: 'aprobada', texto: `Aprobada${fecha}: es un presupuesto y no se modifica.` })
  }
  if (estado.estado === 'rechazada') {
    franjas.push({ tipo: 'rechazada', texto: 'Rechazada. Para volver a editarla, reabrila.' })
  }
  if (contexto.anterior) franjas.push({ tipo: 'duplicada', anterior: contexto.anterior })
  return franjas
}

/**
 * El nombre con que la franja amarilla menciona una variable: el de la etiqueta de su campo en el editor (Task 8:
 * los datos usan VARIABLES; capacidad y descripción salen del equipo elegido).
 */
export function etiquetaVariable(nombre: NombreVariable): string {
  switch (nombre) {
    case 'capacidad':
    case 'equipo_descripcion':
      return 'Equipo'
    case 'validez_dias':
      return 'Validez (días)'
    case 'proxima_actualizacion':
      return 'Próxima actualización'
    default:
      return VARIABLES[nombre]
  }
}

/** El id del precio de un ítem en la grilla (TarjetaItems, Task 9: `item-{clave}-precio`). */
export function idPrecioItem(clave: string): string {
  return `item-${clave}-precio`
}

/** Un faltante de la franja amarilla: `destino` es el id del campo que recibe el foco (null: no hay un campo). */
export type Pendiente = { clave: string; texto: string; destino: string | null }

/**
 * Lo que la franja amarilla lista como "Para enviar falta completar" (decisión 17), sin repetir el mismo campo,
 * y aparte las variables mal escritas (se corrigen en los textos: no hay un campo al que llevar el foco).
 */
export function pendientesVisibles(
  pendientes: Pendientes,
  estado: Pick<EstadoEditor, 'items'>,
): { faltan: Pendiente[]; malEscritas: string[] } {
  const faltan: Pendiente[] = []
  const vistos = new Set<string>()
  for (const variable of pendientes.variables) {
    const destino = idCampoVariable(variable)
    const texto = etiquetaVariable(variable)
    // Capacidad y descripción del equipo van al mismo campo: se nombra una vez.
    if (vistos.has(texto)) continue
    vistos.add(texto)
    faltan.push({ clave: `variable-${variable}`, texto, destino })
  }
  if (pendientes.sinItems) faltan.push({ clave: 'sin-items', texto: 'al menos un ítem', destino: null })
  if (pendientes.itemsSinPrecio > 0) {
    // El mismo criterio que pendientesEditor: un precio vacío o que no se puede leer cuenta como sin precio.
    const primero = estado.items.find((item) => parsePrecio(item.precio) === null)
    faltan.push({
      clave: 'items-sin-precio',
      texto: pendientes.itemsSinPrecio === 1 ? '1 ítem sin precio' : `${pendientes.itemsSinPrecio} ítems sin precio`,
      destino: primero ? idPrecioItem(primero.clave) : null,
    })
  }
  return { faltan, malEscritas: pendientes.desconocidas.map((nombre) => `{{${nombre}}}`) }
}
```

```bash
npm test -- src/lib/cotizaciones/acciones-estado.test.ts
```

Expected: PASS (23 tests).

- [ ] **Step 3: Hook de acciones y botones del encabezado**

Archivo `src/components/cotizaciones/editor/acciones-editor.tsx`. `useAccionesEstado` concentra lo que pasa al tocar un botón: guarda antes si hay cambios (con el `guardar()` del editor), corre la transición con la versión que vio la pantalla, muestra el error con `toast.error` o, si es el conflicto de versión, la franja con "Recargar", y le pide al editor que tome la versión nueva del servidor (`esperarServidor`, Step 6). Usa la `accion`/`setAccion` del editor (Task 8) para marcar qué corre: así Guardar y la barra inferior también se deshabilitan. `guardar()` deja la acción en `null` al terminar, por eso `versionParaSeguir` vuelve a marcar la propia. `AccionesEncabezado` dibuja los botones de la tabla de "Qué deja" y el menú ⋯ (Guardar lo sigue dibujando `EncabezadoEditor`).

Detalles:
- Una nueva (decisión 12): `versionParaSeguir` la guarda con `guardar({ navegar: false })` y devuelve el id y la versión nuevos; enviar y aprobar siguen con ese id y al final (también si la transición falla, porque ya quedó guardada) van a `/cotizaciones/{id}` con `router.replace`. La página nueva arma el editor con lo que quedó en la base.
- La descarga del envío se hace con un `<a download>` temporal: no navega (no dispara el `beforeunload` del editor) y el nombre lo pone la ruta (`COTIZACION N° 112712 VERTICE.pdf`).
- Un botón deshabilitado no recibe el puntero: el motivo ("Completá lo que falta…") va en el `title` de un `span` que lo envuelve.
- "Revertir aprobación" se ofrece siempre en una aprobada, aunque el diseño §5 solo lo permite sin documentos vinculados: decide la base. Con documentos, `revertir_aprobacion` responde "El presupuesto tiene documentos cargados; anulalos antes de revertir la aprobación" (P0001, probado en `tests/integration/presupuestos-estado.test.ts`). El servicio lo convierte en `ErrorCotizacion`, `mensajeParaUsuario` lo pasa tal cual y llega como `toast.error`; ese camino de los P0001 ya lo prueban la Task 4 y `resultado.test.ts`. Deshabilitar el ítem de antemano (contando los documentos en `ContextoEstado`) queda para el 4B, que trae los documentos del presupuesto.
- Por debajo de 72rem el primario es el Guardar de la barra inferior: en una cotización editable, el primario del encabezado se ve como outline (`max-[72rem]:…`).
- Confirmaciones que salen del menú ⋯ (decisión 15). El menú es modal: mientras está abierto, su `FocusScope` atrapa el foco (`trapFocus: context.open` en `@radix-ui/react-menu`), y `onSelect` corre dentro de un `flushSync`. Si el ítem abriera la confirmación ahí, el foco que la confirmación le da a "Cancelar" volvería al ítem; al cerrarse el menú, quedaría en `body` y Escape no llegaría al `group`. Por eso el `onSelect` de un ítem confirmable solo anota la acción (`pendiente`). La confirmación se abre en `onCloseAutoFocus`, que Radix dispara en un `setTimeout` cuando el `FocusScope` ya se desmontó (`@radix-ui/react-focus-scope`). Ahí se previene el foco por defecto, se enfoca el ⋯ (adonde vuelve el foco al cancelar) y se llama a `iniciar`, que con el render deja el foco en "Cancelar".

```tsx
'use client'

import { Ellipsis, FileText } from 'lucide-react'
import { useRouter } from 'next/navigation'
import { useEffect, useRef, useState, useTransition } from 'react'
import { toast } from 'sonner'
import * as acciones from '@/app/(app)/cotizaciones/actions'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  disposicionAcciones,
  esConfirmable,
  esConflicto,
  esEditable,
  ETIQUETA_ACCION,
  ETIQUETA_EN_CURSO,
  fechaHoraDeMarca,
  motivoBloqueo,
  type AccionConfirmable,
  type AccionEstado,
  type BotonAccion,
} from '@/lib/cotizaciones/acciones-estado'
import type { ContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import type { EstadoEditor, Pendientes } from '@/lib/cotizaciones/editor'
import { cn } from '@/lib/utils'

export type Confirmacion =
  | { tipo: AccionConfirmable }
  | { tipo: 'recargar' }
  | { tipo: 'finalizar'; anterior: { id: string; numero: number } }

/** Qué hace el editor cuando llega la versión nueva del servidor: tomarla (después de una transición) o descartar lo local (Recargar). */
export type EsperaServidor = 'adoptar' | 'descartar'

/** Lo que devuelve el guardar del editor (VersionGuardada de la Task 8). */
export type CotizacionGuardada = { id: string; version: string; numero: number }

export type AccionesEstado = {
  /** La acción que corre (la `accion` del editor: 'guardar' o una de estas). */
  enCurso: string | null
  /** Corre una acción (o una recarga): todos los botones de acción quedan deshabilitados (decisión 12). */
  ocupado: boolean
  confirmacion: Confirmacion | null
  conflicto: boolean
  iniciar: (accion: AccionEstado) => void
  cancelar: () => void
  aprobar: (fecha: string) => Promise<void>
  /** Confirma rechazar, reabrir, revertir o eliminar. */
  confirmar: () => Promise<void>
  finalizar: () => Promise<void>
  recargar: () => void
  confirmarRecarga: () => void
}

/** Descarga sin navegar (el atributo download evita salir del editor): el nombre lo pone la ruta del PDF. */
export function descargarArchivo(url: string) {
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
}

const EXITO = {
  rechazar: 'Cotización rechazada',
  reabrir: 'Cotización reabierta',
  revertir: 'Se revirtió la aprobación',
} as const

function confirmacionInicial(
  accion: AccionConfirmable | null | undefined,
  estado: EstadoEditor,
  contexto: ContextoEstado,
  pendientes: Pendientes,
): Confirmacion | null {
  if (!accion) return null
  const { botones, menu } = disposicionAcciones(estado, contexto)
  const disponible = botones.some((boton) => boton.accion === accion) || menu.includes(accion)
  return disponible && motivoBloqueo(accion, pendientes) === null ? { tipo: accion } : null
}

/**
 * Las acciones de estado del editor: guardar antes si hace falta, correr la transición con la versión que vio la
 * pantalla, confirmar en el lugar y ofrecer "Recargar" ante un conflicto de versión (decisiones 11 a 15).
 */
export function useAccionesEstado({
  estado,
  contexto,
  pendientes,
  hayCambiosSinGuardar,
  guardar,
  accion,
  setAccion,
  conflicto,
  setConflicto,
  esperarServidor,
  accionInicial,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  hayCambiosSinGuardar: boolean
  /**
   * El guardar del editor (Task 8): guarda si hay cambios y devuelve la versión (la actual si no había nada que
   * guardar); null si no se pudo (ya lo mostró) o si la cotización no se edita. Con `navegar: false`, una nueva se
   * crea sin ir a su página.
   */
  guardar: (opciones?: { navegar?: boolean }) => Promise<CotizacionGuardada | null>
  /** La acción en curso del editor (Task 8): con una en curso se deshabilitan todos los botones. */
  accion: string | null
  setAccion: (accion: string | null) => void
  conflicto: boolean
  setConflicto: (conflicto: boolean) => void
  /** Avisa al editor que tome la próxima versión del servidor (null: ya no la espera). */
  esperarServidor: (modo: EsperaServidor | null, versionLocal?: string | null) => void
  /** ?accion= de la URL: abre esa confirmación al entrar. */
  accionInicial?: AccionConfirmable | null
}): AccionesEstado {
  const router = useRouter()
  const [confirmacion, setConfirmacion] = useState<Confirmacion | null>(() =>
    confirmacionInicial(accionInicial, estado, contexto, pendientes),
  )
  const [recargando, iniciarRecarga] = useTransition()
  const disparador = useRef<HTMLElement | null>(null)

  // El ?accion= ya se usó: se saca de la URL para que recargar la página no vuelva a abrir la confirmación.
  useEffect(() => {
    if (accionInicial) window.history.replaceState(null, '', window.location.pathname)
  }, [accionInicial])

  function abrir(nueva: Confirmacion) {
    disparador.current = document.activeElement instanceof HTMLElement ? document.activeElement : null
    setConfirmacion(nueva)
  }

  function cancelar() {
    const volver = disparador.current
    disparador.current = null
    setConfirmacion(null)
    // El foco vuelve al botón que abrió la confirmación, si sigue en pantalla.
    requestAnimationFrame(() => {
      if (volver?.isConnected) volver.focus()
    })
  }

  function fallo(mensaje: string) {
    if (esConflicto(mensaje)) {
      setConfirmacion(null)
      setConflicto(true)
    } else {
      toast.error(mensaje)
    }
  }

  /**
   * Guarda lo que haya sin guardar y devuelve el id y la versión con los que seguir (null si no se pudo). Una nueva
   * se guarda sin navegar (decisión 12): la transición usa el id que vuelve y después se va a su página. `guardar()`
   * deja la acción del editor en null al terminar: se vuelve a marcar la que sigue corriendo.
   */
  async function versionParaSeguir(propia: string): Promise<{ id: string; version: string } | null> {
    if (!hayCambiosSinGuardar && estado.id && estado.version) return { id: estado.id, version: estado.version }
    const guardada = await guardar({ navegar: false })
    setAccion(propia)
    return guardada ? { id: guardada.id, version: guardada.version } : null
  }

  /**
   * Una nueva se guardó sin navegar para seguir con la transición: al terminar (también si la transición falló, ya
   * quedó guardada) va a su página, que arma el editor con lo que hay en la base. Una existente solo se refresca.
   */
  function despuesDeLaTransicion(id: string, eraNueva: boolean, salioBien: boolean) {
    if (eraNueva) router.replace(`/cotizaciones/${id}`)
    else if (salioBien) router.refresh()
  }

  async function enviar(accion: 'enviar' | 'reenviar') {
    const eraNueva = estado.id === null
    setAccion(accion)
    try {
      const guardada = await versionParaSeguir(accion)
      if (!guardada) return
      const { id, version } = guardada
      esperarServidor('adoptar', version)
      const resultado = await acciones.enviarCotizacion(id, version)
      if (!resultado.ok) {
        esperarServidor(null)
        fallo(resultado.mensaje)
        return despuesDeLaTransicion(id, eraNueva, false)
      }
      descargarArchivo(`/cotizaciones/${id}/pdf?envio=${resultado.datos.envioId}&descargar=1`)
      toast.success('Se descargó el PDF y la cotización quedó enviada')
      despuesDeLaTransicion(id, eraNueva, true)
    } finally {
      setAccion(null)
    }
  }

  async function duplicar() {
    const id = estado.id
    if (!id) return
    setAccion('duplicar')
    try {
      // Se duplica lo guardado: los cambios se guardan antes para no perderlos al salir del editor.
      if (hayCambiosSinGuardar && esEditable(estado) && !(await versionParaSeguir('duplicar'))) return
      const resultado = await acciones.duplicarCotizacion(id)
      if (!resultado.ok) return fallo(resultado.mensaje)
      toast.success('Se creó una copia en borrador')
      router.push(`/cotizaciones/${resultado.datos.id}`)
    } finally {
      setAccion(null)
    }
  }

  function iniciar(accion: AccionEstado) {
    if (esConfirmable(accion)) return abrir({ tipo: accion })
    if (accion === 'enviar' || accion === 'reenviar') return void enviar(accion)
    if (accion === 'duplicar') return void duplicar()
    if (accion === 'descargar' && estado.id) descargarArchivo(`/cotizaciones/${estado.id}/pdf?descargar=1`)
  }

  async function aprobar(fecha: string) {
    const eraNueva = estado.id === null
    setAccion('aprobar')
    try {
      const guardada = await versionParaSeguir('aprobar')
      if (!guardada) return
      const { id, version } = guardada
      esperarServidor('adoptar', version)
      const resultado = await acciones.aprobarCotizacion(id, version, fecha)
      if (!resultado.ok) {
        esperarServidor(null)
        fallo(resultado.mensaje)
        return despuesDeLaTransicion(id, eraNueva, false)
      }
      toast.success('Cotización aprobada')
      // Una renegociación: se ofrece cerrar el presupuesto que esta reemplaza (decisión 14). Una nueva no reemplaza a
      // ninguna (reemplaza_a solo lo pone duplicar), así que navegar no pierde la oferta.
      const { anterior } = resultado.datos
      setConfirmacion(anterior ? { tipo: 'finalizar', anterior } : null)
      despuesDeLaTransicion(id, eraNueva, true)
    } finally {
      setAccion(null)
    }
  }

  async function confirmar() {
    const id = estado.id
    const tipo = confirmacion?.tipo
    if (!id || (tipo !== 'rechazar' && tipo !== 'reabrir' && tipo !== 'revertir' && tipo !== 'borrar')) return
    setAccion(tipo)
    try {
      if (tipo === 'borrar') {
        const resultado = await acciones.borrarCotizacion(id)
        if (!resultado.ok) return fallo(resultado.mensaje)
        toast.success(`Se eliminó el borrador N° ${estado.numero}`)
        router.push('/cotizaciones')
        return
      }
      // Una rechazada no se edita: lo que no se guardó se guarda antes de rechazar para no perderlo.
      const version = tipo === 'rechazar' ? (await versionParaSeguir('rechazar'))?.version : estado.version
      if (!version) return
      esperarServidor('adoptar', version)
      const resultado =
        tipo === 'rechazar'
          ? await acciones.rechazarCotizacion(id)
          : tipo === 'reabrir'
            ? await acciones.reabrirCotizacion(id)
            : await acciones.revertirAprobacion(id)
      if (!resultado.ok) {
        esperarServidor(null)
        return fallo(resultado.mensaje)
      }
      setConfirmacion(null)
      toast.success(EXITO[tipo])
      router.refresh()
    } finally {
      setAccion(null)
    }
  }

  async function finalizar() {
    if (confirmacion?.tipo !== 'finalizar') return
    const { anterior } = confirmacion
    setAccion('finalizar')
    try {
      const resultado = await acciones.finalizarPresupuesto(anterior.id)
      if (!resultado.ok) return fallo(resultado.mensaje)
      setConfirmacion(null)
      toast.success(`Se finalizó el presupuesto N° ${anterior.numero}`)
    } finally {
      setAccion(null)
    }
  }

  function confirmarRecarga() {
    esperarServidor('descartar', estado.version)
    setConfirmacion(null)
    setConflicto(false)
    iniciarRecarga(() => router.refresh())
  }

  function recargar() {
    if (hayCambiosSinGuardar) return abrir({ tipo: 'recargar' })
    confirmarRecarga()
  }

  return {
    enCurso: accion,
    ocupado: accion !== null || recargando,
    confirmacion,
    conflicto,
    iniciar,
    cancelar,
    aprobar,
    confirmar,
    finalizar,
    recargar,
    confirmarRecarga,
  }
}

/** Primario de cabecera; con la barra inferior a la vista (< 72rem) se ve como outline: el primario ahí es Guardar. */
const PRIMARIO = 'shadow-md shadow-primary/20'
const PRIMARIO_CON_BARRA = cn(
  PRIMARIO,
  'max-[72rem]:border-border max-[72rem]:bg-background max-[72rem]:text-foreground max-[72rem]:shadow-none max-[72rem]:hover:bg-muted',
)

function BotonDeAccion({
  boton,
  estado,
  pendientes,
  acciones: accionesEstado,
  className,
}: {
  boton: BotonAccion
  estado: EstadoEditor
  pendientes: Pendientes
  acciones: AccionesEstado
  /** Visibilidad según el ancho (va en el elemento de afuera). */
  className?: string
}) {
  const { accion, primaria } = boton
  const variante = primaria ? 'default' : 'outline'
  const estilo = primaria ? (esEditable(estado) ? PRIMARIO_CON_BARRA : PRIMARIO) : undefined

  if (accion === 'descargar') {
    if (!estado.id) return null
    return (
      <Button asChild variant={variante} size="lg" className={cn(estilo, className)}>
        <a href={`/cotizaciones/${estado.id}/pdf?descargar=1`} download>
          {ETIQUETA_ACCION.descargar}
        </a>
      </Button>
    )
  }

  const bloqueo = motivoBloqueo(accion, pendientes)
  const elemento = (
    <Button
      type="button"
      variant={variante}
      size="lg"
      className={cn(estilo, bloqueo ? undefined : className)}
      disabled={accionesEstado.ocupado || bloqueo !== null}
      onClick={() => accionesEstado.iniciar(accion)}
    >
      {accionesEstado.enCurso === accion ? ETIQUETA_EN_CURSO[accion] : ETIQUETA_ACCION[accion]}
    </Button>
  )
  // Un botón deshabilitado no recibe el puntero: el motivo va en el title de un envoltorio.
  return bloqueo ? (
    <span title={bloqueo} className={cn('inline-flex', className)}>
      {elemento}
    </span>
  ) : (
    elemento
  )
}

/**
 * Los botones de estado del encabezado del editor, a la derecha de Guardar (que dibuja EncabezadoEditor), según el
 * estado (relev-visual §3.2), con el menú ⋯ y el historial de envíos. En el celular los secundarios pasan al menú.
 */
export function AccionesEncabezado({
  estado,
  contexto,
  pendientes,
  acciones: accionesEstado,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  acciones: AccionesEstado
}) {
  const botonMenu = useRef<HTMLButtonElement>(null)
  /** La confirmación que eligió un ítem del menú: se abre cuando el menú terminó de cerrarse (onCloseAutoFocus). */
  const pendiente = useRef<AccionEstado | null>(null)
  const { botones, menu } = disposicionAcciones(estado, contexto)
  const secundarias = botones.filter((boton) => !boton.primaria).map((boton) => boton.accion)
  const id = estado.id
  const enMenu: { accion: AccionEstado; soloCelular: boolean }[] = [
    ...secundarias.map((accion) => ({ accion, soloCelular: true })),
    ...menu.map((accion) => ({ accion, soloCelular: false })),
  ]
  // Sin acciones propias ni envíos, el menú solo tiene lo que en escritorio ya está a la vista.
  const menuSoloCelular = menu.length === 0 && contexto.envios.length === 0

  return (
    <>
      {botones.map((boton) => (
        <BotonDeAccion
          key={boton.accion}
          boton={boton}
          estado={estado}
          pendientes={pendientes}
          acciones={accionesEstado}
          className={boton.primaria ? undefined : 'hidden md:inline-flex'}
        />
      ))}
      {id && enMenu.length + contexto.envios.length > 0 ? (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              ref={botonMenu}
              type="button"
              variant="outline"
              size="icon-lg"
              aria-label="Más acciones"
              disabled={accionesEstado.ocupado}
              className={menuSoloCelular ? 'md:hidden' : undefined}
            >
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            align="end"
            className="w-auto min-w-56"
            onCloseAutoFocus={(evento) => {
              const accion = pendiente.current
              if (!accion) return
              pendiente.current = null
              // Recién acá el FocusScope del menú (modal) ya no atrapa el foco: abrir la confirmación en onSelect
              // dejaría el foco en el ítem y después en body. El foco pasa por el ⋯ (adonde vuelve al cancelar) y, con
              // el render de la confirmación, queda en su "Cancelar" (decisión 15).
              evento.preventDefault()
              botonMenu.current?.focus()
              accionesEstado.iniciar(accion)
            }}
          >
            {enMenu.map(({ accion, soloCelular }) =>
              accion === 'descargar' ? (
                <DropdownMenuItem key={accion} asChild className={soloCelular ? 'md:hidden' : undefined}>
                  <a href={`/cotizaciones/${id}/pdf?descargar=1`} download>
                    {ETIQUETA_ACCION.descargar}
                  </a>
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem
                  key={accion}
                  className={soloCelular ? 'md:hidden' : undefined}
                  variant={accion === 'borrar' ? 'destructive' : 'default'}
                  disabled={motivoBloqueo(accion, pendientes) !== null}
                  onSelect={() => {
                    // Una confirmación se abre cuando el menú se cerró del todo (ver onCloseAutoFocus).
                    if (esConfirmable(accion)) pendiente.current = accion
                    else accionesEstado.iniciar(accion)
                  }}
                >
                  {ETIQUETA_ACCION[accion]}
                </DropdownMenuItem>
              ),
            )}
            {contexto.envios.length > 0 ? (
              <>
                {enMenu.length > 0 ? <DropdownMenuSeparator /> : null}
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Envíos (lo que recibió el cliente)
                </DropdownMenuLabel>
                {contexto.envios.map((envio, indice) => (
                  <DropdownMenuItem key={envio.id} asChild>
                    <a href={`/cotizaciones/${id}/pdf?envio=${envio.id}`} target="_blank" rel="noopener">
                      <FileText aria-hidden />
                      {fechaHoraDeMarca(envio.enviada_at)}
                      {indice === 0 ? ' · último' : ''}
                    </a>
                  </DropdownMenuItem>
                ))}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      ) : null}
    </>
  )
}
```

```bash
npm run lint && npm run typecheck
```

Expected: sin errores (el archivo todavía no se usa).

- [ ] **Step 4: `ConfirmacionEnLugar` con tono de éxito, texto de cancelar y confirmar deshabilitado**

La confirmación de aprobar necesita deshabilitar solo "Aprobar" con una fecha inválida, la oferta de finalizar cancela con "Dejarlo en curso" y las dos van en verde. En `src/components/formulario/confirmacion-en-lugar.tsx` (Task 8), todo opcional (los usos de las Tasks 8 y 10 no cambian):

- En `TONOS`, primera línea:

```tsx
  exito: 'border-green-200 bg-green-50',
```

- En la desestructuración, después de `textoPendiente,`: `textoCancelar = 'Cancelar',`; y después de `pendiente = false,`: `confirmarDeshabilitado = false,`.
- En el tipo, después de `textoPendiente?: string`:

```tsx
  /** Por ejemplo "Dejarlo en curso" (Task 12). */
  textoCancelar?: string
```

  y después de `pendiente?: boolean`:

```tsx
  /** Solo el botón de confirmar, por ejemplo con una fecha inválida (Task 12). */
  confirmarDeshabilitado?: boolean
```

- El texto del primer botón pasa de `Cancelar` a `{textoCancelar}`, y el `disabled` del segundo, de `disabled={pendiente}` a `disabled={pendiente || confirmarDeshabilitado}`.

```bash
npm run lint && npm run typecheck
```

- [ ] **Step 5: Franjas y confirmaciones**

Archivo `src/components/cotizaciones/editor/franjas-editor.tsx`. Una sola forma para todas las franjas (`rounded-lg border px-4 py-3 text-sm`, como `BorrarContacto` en `src/components/clientes/contacto-form.tsx`) y las confirmaciones con `ConfirmacionEnLugar` (un `role="group"` con el nombre de su pregunta, así las encuentran los E2E; foco en Cancelar; Escape cancela). `pendiente={acciones.ocupado}` deshabilita los dos botones mientras corre cualquier acción, y `textoPendiente` solo se pasa cuando corre la de esa confirmación ("Aprobando…"). La de aprobar suma la fecha (`Label` + `Input type="date"` con `min` = fecha de la cotización, hoy por defecto con el `hoy` del servidor) y el aviso de versión no enviada. Los nombres de la franja amarilla son botones que llevan el foco al campo.

```tsx
'use client'

import { RefreshCw, TriangleAlert } from 'lucide-react'
import Link from 'next/link'
import { Fragment, useState } from 'react'
import { ConfirmacionEnLugar } from '@/components/formulario/confirmacion-en-lugar'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  apruebaVersionNoEnviada,
  errorFechaAprobacion,
  esEditable,
  estadoAlRevertir,
  ETIQUETA_EN_CURSO,
  franjasEstado,
  pendientesVisibles,
  type Franja,
  type Pendiente,
} from '@/lib/cotizaciones/acciones-estado'
import type { ContextoEstado } from '@/lib/cotizaciones/contexto-estado'
import { MENSAJE_CONFLICTO, type EstadoEditor, type Pendientes } from '@/lib/cotizaciones/editor'
import { cn } from '@/lib/utils'
import type { AccionesEstado } from './acciones-editor'

/** Forma común de las franjas (relev-visual §3.9, como BorrarContacto en contacto-form.tsx). */
const FRANJA = 'rounded-lg border px-4 py-3 text-sm'

const TONO_FRANJA: Record<Franja['tipo'], string> = {
  enviada: 'border-blue-200 bg-blue-50',
  vencida: 'border-amber-200 bg-amber-50',
  aprobada: 'border-green-200 bg-green-50',
  rechazada: 'bg-muted',
  duplicada: 'bg-muted',
}

const ENLACE = 'font-medium text-primary underline-offset-4 hover:underline'

function enfocarCampo(id: string) {
  const campo = document.getElementById(id)
  if (!campo) return
  campo.scrollIntoView({ block: 'center', behavior: 'smooth' })
  campo.focus({ preventScroll: true })
}

/** El texto del botón mientras corre esta acción (otra acción en curso solo deshabilita). */
function textoEnCurso(acciones: AccionesEstado, accion: keyof typeof ETIQUETA_EN_CURSO): string | undefined {
  return acciones.enCurso === accion ? ETIQUETA_EN_CURSO[accion] : undefined
}

function ConfirmarAprobacion({
  estado,
  contexto,
  acciones,
  hayCambiosSinGuardar,
  hoy,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  acciones: AccionesEstado
  hayCambiosSinGuardar: boolean
  hoy: string
}) {
  // Hoy por defecto; si la cotización tiene fecha futura, su fecha (no se aprueba antes de cotizar).
  const [fecha, setFecha] = useState(hoy < estado.fecha ? estado.fecha : hoy)
  const error = errorFechaAprobacion(fecha, estado.fecha)
  const aviso = apruebaVersionNoEnviada(estado, contexto, hayCambiosSinGuardar)
  // Una nueva todavía no tiene número: aprobar la guarda primero (decisión 12).
  const nueva = estado.numero === null

  return (
    <ConfirmacionEnLugar
      tono="exito"
      pregunta={nueva ? '¿Guardar y aprobar la cotización?' : `¿Aprobar la cotización N° ${estado.numero}?`}
      detalle={
        nueva
          ? 'Se guarda con un número nuevo, queda como presupuesto y ya no se modifica.'
          : 'Queda como presupuesto y ya no se modifica.'
      }
      textoConfirmar="Aprobar"
      textoPendiente={textoEnCurso(acciones, 'aprobar')}
      pendiente={acciones.ocupado}
      confirmarDeshabilitado={error !== null}
      alConfirmar={() => void acciones.aprobar(fecha)}
      alCancelar={acciones.cancelar}
    >
      <div className="basis-full space-y-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <Label htmlFor="fecha-aprobacion" className="text-[13px] font-normal text-muted-foreground">
            Fecha de aprobación
          </Label>
          <Input
            id="fecha-aprobacion"
            type="date"
            value={fecha}
            min={estado.fecha}
            onChange={(evento) => setFecha(evento.target.value)}
            aria-invalid={error !== null}
            aria-describedby={error ? 'fecha-aprobacion-error' : undefined}
            className="h-8 w-40 bg-background"
          />
        </div>
        {error ? (
          <p id="fecha-aprobacion-error" className="text-destructive">
            {error}
          </p>
        ) : null}
        {aviso ? (
          <p className="flex gap-1.5 text-amber-800">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            Se aprueba la versión actual, que el cliente no recibió.
          </p>
        ) : null}
      </div>
    </ConfirmacionEnLugar>
  )
}

function ConfirmacionAbierta({
  estado,
  contexto,
  acciones,
  hayCambiosSinGuardar,
  hoy,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  acciones: AccionesEstado
  hayCambiosSinGuardar: boolean
  hoy: string
}) {
  const { confirmacion } = acciones
  if (!confirmacion || confirmacion.tipo === 'recargar') return null
  const numero = estado.numero
  const comun = {
    pendiente: acciones.ocupado,
    alCancelar: acciones.cancelar,
    alConfirmar: () => void acciones.confirmar(),
  }

  switch (confirmacion.tipo) {
    case 'aprobar':
      return (
        <ConfirmarAprobacion
          estado={estado}
          contexto={contexto}
          acciones={acciones}
          hayCambiosSinGuardar={hayCambiosSinGuardar}
          hoy={hoy}
        />
      )
    case 'rechazar':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="aviso"
          pregunta={`¿Marcar la cotización N° ${numero} como rechazada?`}
          detalle="Se puede reabrir después."
          textoConfirmar="Rechazar"
          textoPendiente={textoEnCurso(acciones, 'rechazar')}
        />
      )
    case 'reabrir':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="neutro"
          pregunta={`¿Reabrir la cotización N° ${numero}?`}
          detalle="Vuelve a borrador y se puede editar."
          textoConfirmar="Reabrir"
          textoPendiente={textoEnCurso(acciones, 'reabrir')}
        />
      )
    case 'revertir':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="aviso"
          pregunta={`¿Revertir la aprobación de la cotización N° ${numero}?`}
          detalle={`Vuelve a ${estadoAlRevertir(contexto)} y deja de ser un presupuesto. El PDF aprobado queda guardado.`}
          textoConfirmar="Revertir"
          textoPendiente={textoEnCurso(acciones, 'revertir')}
        />
      )
    case 'borrar':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="peligro"
          pregunta={`¿Eliminar el borrador N° ${numero}?`}
          detalle="No se puede deshacer."
          textoConfirmar="Eliminar"
          textoPendiente={textoEnCurso(acciones, 'borrar')}
        />
      )
    case 'finalizar':
      return (
        <ConfirmacionEnLugar
          {...comun}
          tono="exito"
          pregunta={`Esta cotización reemplaza a la N° ${confirmacion.anterior.numero}, que sigue en curso como presupuesto.`}
          detalle="Si el trabajo sigue con esta, finalizá el anterior."
          textoConfirmar={`Finalizar el presupuesto N° ${confirmacion.anterior.numero}`}
          textoPendiente={acciones.enCurso === 'finalizar' ? 'Finalizando…' : undefined}
          textoCancelar="Dejarlo en curso"
          alConfirmar={() => void acciones.finalizar()}
        />
      )
  }
}

function FranjaConflicto({ acciones }: { acciones: AccionesEstado }) {
  if (acciones.confirmacion?.tipo === 'recargar') {
    return (
      <ConfirmacionEnLugar
        tono="aviso"
        pregunta="Se descartan los cambios que no guardaste y se carga la versión actual."
        textoConfirmar="Descartar y recargar"
        pendiente={acciones.ocupado}
        alConfirmar={acciones.confirmarRecarga}
        alCancelar={acciones.cancelar}
      />
    )
  }
  return (
    <div role="alert" className={cn(FRANJA, 'flex flex-wrap items-center gap-x-4 gap-y-2 border-amber-200 bg-amber-50')}>
      <p className="flex min-w-0 flex-1 basis-72 gap-2">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
        <span>{MENSAJE_CONFLICTO}. Lo que escribiste sigue acá: recargá para ver la versión actual.</span>
      </p>
      <Button type="button" variant="outline" size="sm" onClick={acciones.recargar} disabled={acciones.ocupado}>
        <RefreshCw aria-hidden />
        Recargar
      </Button>
    </div>
  )
}

function FranjaPendientes({ faltan, malEscritas }: { faltan: Pendiente[]; malEscritas: string[] }) {
  return (
    <div className={cn(FRANJA, 'flex items-start gap-2.5 border-brand-yellow/60 bg-brand-yellow/10')}>
      <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-brand-yellow" />
      <div className="space-y-1">
        {faltan.length > 0 ? (
          <p>
            Para enviar falta completar:{' '}
            {faltan.map((pendiente, indice) => {
              const destino = pendiente.destino
              return (
                <Fragment key={pendiente.clave}>
                  {indice > 0 ? ' · ' : null}
                  {destino ? (
                    <button
                      type="button"
                      onClick={() => enfocarCampo(destino)}
                      className="font-semibold underline-offset-4 hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {pendiente.texto}
                    </button>
                  ) : (
                    <strong className="font-semibold">{pendiente.texto}</strong>
                  )}
                </Fragment>
              )
            })}
          </p>
        ) : null}
        {malEscritas.length > 0 ? (
          <p>
            Hay variables mal escritas en los textos: <strong className="font-semibold">{malEscritas.join(', ')}</strong>
          </p>
        ) : null}
      </div>
    </div>
  )
}

function FranjaDeEstado({ franja, id }: { franja: Franja; id: string | null }) {
  return (
    <div className={cn(FRANJA, TONO_FRANJA[franja.tipo])}>
      {franja.tipo === 'duplicada' ? (
        <p>
          Duplicada de{' '}
          <Link href={`/cotizaciones/${franja.anterior.id}`} className={ENLACE}>
            N° {franja.anterior.numero}
          </Link>
        </p>
      ) : (
        <p>
          {franja.texto}
          {franja.tipo === 'enviada' && franja.envioId && id ? (
            <>
              {' '}
              <a href={`/cotizaciones/${id}/pdf?envio=${franja.envioId}`} target="_blank" rel="noopener" className={ENLACE}>
                Ver lo que recibió el cliente
              </a>
            </>
          ) : null}
        </p>
      )}
    </div>
  )
}

/**
 * Lo que va entre el encabezado y las tarjetas: el conflicto de versión, la confirmación abierta, lo que falta para
 * enviar (franja amarilla, decisión 17) y el estado (enviada, vencida, aprobada, rechazada, duplicada).
 * Una confirmación abierta reemplaza a la franja de estado (salvo la de duplicada y la oferta de finalizar).
 */
export function FranjasEditor({
  estado,
  contexto,
  pendientes,
  acciones,
  hayCambiosSinGuardar,
  hoy,
}: {
  estado: EstadoEditor
  contexto: ContextoEstado
  pendientes: Pendientes
  acciones: AccionesEstado
  hayCambiosSinGuardar: boolean
  /** Hoy en Argentina ('YYYY-MM-DD'), del servidor: la fecha de aprobación por defecto. */
  hoy: string
}) {
  const { faltan, malEscritas } = pendientesVisibles(pendientes, estado)
  const conPendientes = esEditable(estado) && (faltan.length > 0 || malEscritas.length > 0)
  const tipo = acciones.confirmacion?.tipo
  const confirmando = tipo !== undefined && tipo !== 'recargar' && tipo !== 'finalizar'
  const franjas = franjasEstado(estado, contexto).filter((franja) => !confirmando || franja.tipo === 'duplicada')

  if (!acciones.conflicto && !acciones.confirmacion && !conPendientes && franjas.length === 0) return null

  return (
    <div className="space-y-3">
      {acciones.conflicto || tipo === 'recargar' ? <FranjaConflicto acciones={acciones} /> : null}
      <ConfirmacionAbierta
        estado={estado}
        contexto={contexto}
        acciones={acciones}
        hayCambiosSinGuardar={hayCambiosSinGuardar}
        hoy={hoy}
      />
      {conPendientes ? <FranjaPendientes faltan={faltan} malEscritas={malEscritas} /> : null}
      {franjas.map((franja) => (
        <FranjaDeEstado key={franja.tipo} franja={franja} id={estado.id} />
      ))}
    </div>
  )
}
```

```bash
npm run lint && npm run typecheck
```

Expected: sin errores.

- [ ] **Step 6: Conectar al editor**

**6a. `src/app/(app)/cotizaciones/[id]/page.tsx`.** Import:

```tsx
import { accionDesdeParametro } from '@/lib/cotizaciones/acciones-estado'
```

La firma pasa a recibir `searchParams`:

```tsx
export default async function CotizacionPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
```

y el editor recibe la acción pedida en la URL (después de `contexto={contexto}`, que dejó la Task 11):

```tsx
        accionInicial={accionDesdeParametro((await searchParams).accion)}
```

**6b. `src/components/cotizaciones/editor/editor-cotizacion.tsx`.** Imports nuevos:

```tsx
import { esConflicto, type AccionConfirmable } from '@/lib/cotizaciones/acciones-estado'
import { AccionesEncabezado, useAccionesEstado, type EsperaServidor } from './acciones-editor'
import { FranjasEditor } from './franjas-editor'
```

Prop nueva: en la desestructuración, después de `contexto = CONTEXTO_NUEVA,`:

```tsx
  accionInicial = null,
```

y en el tipo, después de `contexto?: ContextoEstado`:

```tsx
  /** ?accion= de la URL: abre esa confirmación al entrar (la página la lee con accionDesdeParametro). */
  accionInicial?: AccionConfirmable | null
```

Borrar la línea `const ocupado = accion !== null` (se vuelve a declarar más abajo con el hook) y, después de `const sueltos = erroresSinCampo(errores)`, agregar el estado del conflicto y la adopción de la versión del servidor:

```tsx
  /** Otro guardó mientras tanto: franja con "Recargar" (Task 12). */
  const [conflicto, setConflicto] = useState(false)

  // Después de una transición (o de "Recargar") el servidor manda otra versión en `inicial`: el editor la toma.
  // Se ignoran la versión que había al empezar y la que dejó el guardado previo, que pueden llegar antes que la
  // nueva. Se ajusta durante el render (como recomienda React para un estado que depende de una prop), no en un efecto.
  const [espera, setEspera] = useState<{ modo: EsperaServidor; ignorar: (string | null)[] } | null>(null)
  function esperarServidor(modo: EsperaServidor | null, versionLocal: string | null = null) {
    setEspera(modo ? { modo, ignorar: [inicial.version, versionLocal] } : null)
  }
  if (espera && inicial.version && !espera.ignorar.includes(inicial.version)) {
    setEspera(null)
    setGuardado(inicial)
    despachar({
      tipo: 'reemplazar',
      // Recargar descarta lo local. Después de una transición, lo que se haya tipeado mientras corría queda encima
      // del estado y la versión nuevos.
      estado:
        espera.modo === 'descartar' || !cambios ? inicial : { ...estado, estado: inicial.estado, version: inicial.version },
    })
  }
```

Por qué así: el editor no se remonta (la Task 8 no le pone `key` con la versión, y no hay que ponérsela: se perderían la oferta de finalizar y lo tipeado). `inicial` es la prop que arma la página con `estadoDesdeFila` en el servidor: cambia de versión cuando la acción revalida la ruta o con `router.refresh()`.

En `guardar()`, reemplazar:

```tsx
      if (!resultado.ok) {
        mostrarErrores(resultado.mensaje, resultado.errores ?? {})
        return null
      }
```

por:

```tsx
      if (!resultado.ok) {
        // Otro guardó antes: no es un error de los datos, se ofrece "Recargar" (Task 12) sin tocar lo escrito.
        if (esConflicto(resultado.mensaje)) {
          setConflicto(true)
          return null
        }
        mostrarErrores(resultado.mensaje, resultado.errores ?? {})
        return null
      }
      setConflicto(false)
```

Después de `guardarParaVer` (Task 11), antes del efecto "Con errores, el foco va al primer campo marcado":

```tsx
  // Acciones de estado (Task 12): con una en curso se deshabilitan todos los botones, Guardar incluido.
  const acciones = useAccionesEstado({
    estado,
    contexto,
    pendientes,
    hayCambiosSinGuardar: cambios,
    guardar,
    accion,
    setAccion,
    conflicto,
    setConflicto,
    esperarServidor,
    accionInicial,
  })
  const ocupado = acciones.ocupado
```

`alTeclear` (Ctrl/⌘+S) no cambia: la Task 8 ya dejó `if (!ocupado) void guardar()`, y `ocupado` ahora es `acciones.ocupado`, que incluye las acciones de estado y la recarga. Con una de ellas en curso, Ctrl/⌘+S no guarda: cambiaría la versión que esa acción ya mandó. Ajustá solo el comentario de arriba de `alTeclear` para que lo diga.

En el JSX, sumarle a `<EncabezadoEditor … />`, después de `alGuardar={() => void guardar()}`:

```tsx
          acciones={<AccionesEncabezado estado={estado} contexto={contexto} pendientes={pendientes} acciones={acciones} />}
```

y reemplazar el comentario `{/* Task 12: FranjasEditor (estado, pendientes y confirmaciones) va acá, antes del aviso de errores. */}` por:

```tsx
        <FranjasEditor
          estado={estado}
          contexto={contexto}
          pendientes={pendientes}
          acciones={acciones}
          hayCambiosSinGuardar={cambios}
          hoy={hoy}
        />
```

`EncabezadoEditor` y `BarraInferior` no cambian: ya reciben `ocupado` (que ahora incluye las acciones de estado) y ocultan Guardar cuando la cotización no se edita.

```bash
npm run lint && npm run typecheck && npm test
```

Expected: sin errores; los unitarios en verde.

- [ ] **Step 7: Transiciones en el ⋯ de la lista**

relev-visual §1.6: el ⋯ de cada fila suma las transiciones según el estado y lleva al editor con la confirmación ya abierta (`?accion=`, Step 6a). Las filas de la tabla y del celular son Server Components: calculan `transicionesDeLista(fila)` y se las pasan a `AccionesFila`, que solo importa el tipo (no suma `acciones-estado.ts` al bundle de la lista).

**7a. `src/components/cotizaciones/lista/acciones-fila.tsx` (Task 7).** Imports: sumar `DropdownMenuSeparator` al import de `@/components/ui/dropdown-menu` y, después de él:

```tsx
import type { TransicionLista } from '@/lib/cotizaciones/acciones-estado'
```

Prop nueva (opcional, para no tocar otros usos): en la desestructuración, después de `tienePdf,`:

```tsx
  transiciones = [],
```

y en el tipo, después de `tienePdf: boolean`:

```tsx
  /** Las del ⋯ según el estado (transicionesDeLista, Task 12): abren el editor con la confirmación abierta. */
  transiciones?: TransicionLista[]
```

En el `DropdownMenuContent`, después del ítem "Duplicar" del celular (el último `{variante === 'movil' ? (…) : null}`):

```tsx
        {transiciones.length > 0 ? <DropdownMenuSeparator /> : null}
        {transiciones.map(({ accion, etiqueta }) => (
          <DropdownMenuItem key={accion} asChild variant={accion === 'borrar' ? 'destructive' : 'default'}>
            <Link href={`/cotizaciones/${id}?accion=${accion}`}>{etiqueta}</Link>
          </DropdownMenuItem>
        ))}
```

Y en el comentario de la función, "Las transiciones (aprobar, rechazar…) las suma la Task 12: llevan al editor con su confirmación." pasa a "Las transiciones del ⋯ llevan al editor con su confirmación abierta (`?accion=`)."

**7b. `tabla-cotizaciones.tsx` y `lista-cotizaciones-movil.tsx` (Task 7).** En los dos, sumar:

```tsx
import { transicionesDeLista } from '@/lib/cotizaciones/acciones-estado'
```

y pasarle a cada `<AccionesFila … />` la prop `transiciones={transicionesDeLista(fila)}` (después de `tienePdf={fila.tienePdf}`). `FilaCotizacion` ya trae `estado` (el guardado: una vencida es `enviada`) y `origen` (null en las de la app).

```bash
npm run lint && npm run typecheck
```

Expected: sin errores. El E2E de la lista de la Task 7 sigue pasando: el menú suma ítems al final, no cambia los que mira.

- [ ] **Step 8: E2E de las acciones de estado**

Al final de `tests/e2e/cotizaciones.spec.ts` (los imports de `./base-datos` y `./helpers` ya los dejó la Task 11; sumá `DATOS_COMPLETOS` al de `./base-datos`):

```ts
/** Hoy en Argentina, 'YYYY-MM-DD' y 'dd/mm/aaaa' (la fecha por defecto de una cotización y de su aprobación). */
function hoyArgentina() {
  const iso = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date())
  const [anio, mes, dia] = iso.split('-')
  return { iso, corta: `${dia}/${mes}/${anio}` }
}

test.describe('acciones de estado del editor', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBase((db) => borrarCotizaciones(db, creadas))
  })

  test('rechazar y reabrir se confirman en el lugar; Escape cancela', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const rechazar = page.getByRole('group', { name: `¿Marcar la cotización N° ${numero} como rechazada?` })
    const masAcciones = page.getByRole('button', { name: 'Más acciones' })
    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Rechazar' }).click()
    // Desde el menú también: el foco queda en Cancelar y Escape cierra la confirmación (decisión 15).
    await expect(rechazar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rechazar).toBeHidden()
    await expect(masAcciones).toBeFocused()

    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Rechazar' }).click()
    await rechazar.getByRole('button', { name: 'Rechazar', exact: true }).click()
    await expect(page.getByText('Rechazada. Para volver a editarla, reabrila.')).toBeVisible()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeDisabled()

    await page.getByRole('button', { name: 'Reabrir', exact: true }).click()
    await page
      .getByRole('group', { name: `¿Reabrir la cotización N° ${numero}?` })
      .getByRole('button', { name: 'Reabrir', exact: true })
      .click()
    await expect(page.getByText('Rechazada. Para volver a editarla, reabrila.')).toBeHidden()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeEnabled()
    await expect(page.getByRole('button', { name: 'Descargar y marcar enviada' })).toBeEnabled()
  })

  test('aprobar pide la fecha, no acepta una anterior a la cotización y se puede revertir', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    const hoy = hoyArgentina()
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    const aprobar = page.getByRole('group', { name: `¿Aprobar la cotización N° ${numero}?` })
    const fecha = aprobar.getByLabel('Fecha de aprobación')
    await expect(fecha).toHaveValue(hoy.iso)
    await fecha.fill('2020-01-01')
    await expect(aprobar.getByText(/^No puede ser anterior a la fecha de la cotización/)).toBeVisible()
    await expect(aprobar.getByRole('button', { name: 'Aprobar', exact: true })).toBeDisabled()

    await fecha.fill(hoy.iso)
    await aprobar.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await expect(page.getByText(`Aprobada el ${hoy.corta}: es un presupuesto y no se modifica.`)).toBeVisible()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeDisabled()
    await expect(page.getByRole('button', { name: 'Guardar', exact: true })).toHaveCount(0)

    const masAcciones = page.getByRole('button', { name: 'Más acciones' })
    const revertir = page.getByRole('group', { name: `¿Revertir la aprobación de la cotización N° ${numero}?` })
    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Revertir aprobación' }).click()
    await expect(revertir.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(revertir).toBeHidden()

    await masAcciones.click()
    await page.getByRole('menuitem', { name: 'Revertir aprobación' }).click()
    await expect(revertir.getByText('Vuelve a borrador y deja de ser un presupuesto.', { exact: false })).toBeVisible()
    await revertir.getByRole('button', { name: 'Revertir', exact: true }).click()
    await expect(page.getByLabel('Asunto', { exact: true })).toBeEnabled()
  })

  test('lo que falta completar bloquea enviar y aprobar, y cada nombre lleva al campo', async ({ page }) => {
    const { id } = await conBase((db) =>
      crearCotizacionCompleta(db, { datos: { ...DATOS_COMPLETOS, ubicacion: '' }, precioMovilizacion: null }),
    )
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const enviar = page.getByRole('button', { name: 'Descargar y marcar enviada' })
    const aprobar = page.getByRole('button', { name: 'Aprobar', exact: true })
    await expect(enviar).toBeDisabled()
    await expect(aprobar).toBeDisabled()
    const franja = page.getByText(/^Para enviar falta completar:/)
    await expect(franja).toHaveText('Para enviar falta completar: Lugar del servicio · 1 ítem sin precio')

    await franja.getByRole('button', { name: 'Lugar del servicio', exact: true }).click()
    const lugar = page.getByLabel('Lugar del servicio', { exact: true })
    await expect(lugar).toBeFocused()
    await lugar.fill('Loma Campana, Añelo')

    await franja.getByRole('button', { name: '1 ítem sin precio', exact: true }).click()
    const precio = page.getByLabel('Precio del ítem 2', { exact: true })
    await expect(precio).toBeFocused()
    await precio.fill('2.800.000')

    await expect(franja).toBeHidden()
    await expect(enviar).toBeEnabled()
    await expect(aprobar).toBeEnabled()
  })

  test('el ⋯ de la lista abre el editor con la confirmación de la transición', async ({ page }) => {
    const { id, numero } = await conBase(async (db) => {
      const creada = await crearCotizacionCompleta(db)
      await db.query(`update public.cotizaciones set estado = 'enviada' where id = $1`, [creada.id])
      return creada
    })
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones?q=${numero}`)

    await page.getByRole('table').getByRole('button', { name: `Más acciones de la ${numero}` }).click()
    await expect(page.getByRole('menuitem', { name: 'Aprobar…' })).toHaveAttribute(
      'href',
      `/cotizaciones/${id}?accion=aprobar`,
    )
    await page.getByRole('menuitem', { name: 'Rechazar…' }).click()

    // El ?accion= se saca de la URL al entrar: recargar no vuelve a abrir la confirmación.
    await expect(page).toHaveURL(new RegExp(`/cotizaciones/${id}$`))
    const rechazar = page.getByRole('group', { name: `¿Marcar la cotización N° ${numero} como rechazada?` })
    await expect(rechazar.getByRole('button', { name: 'Cancelar' })).toBeFocused()
    await page.keyboard.press('Escape')
    await expect(rechazar).toBeHidden()
  })

  test('eliminar un borrador pide confirmación y vuelve a la lista', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.getByRole('menuitem', { name: 'Eliminar borrador' }).click()
    await page
      .getByRole('group', { name: `¿Eliminar el borrador N° ${numero}?` })
      .getByRole('button', { name: 'Eliminar', exact: true })
      .click()
    await expect(page).toHaveURL(/\/cotizaciones$/)
    const quedan = await conBase((db) => db.query('select 1 from public.cotizaciones where id = $1', [id]))
    expect(quedan.rowCount).toBe(0)
  })
})
```

Notas:
- Las cotizaciones se crean por SQL con `crearCotizacionCompleta`: completas (sin pendientes, se pueden enviar y aprobar) salvo en el test de la franja amarilla, que le saca el lugar del servicio y el precio del segundo ítem.
- `exact: true` en los botones que se repiten entre el encabezado y la confirmación ("Aprobar", "Reabrir"); el `group` acota a la confirmación.
- Rechazar y revertir se abren desde el ⋯ a propósito: es el caso en que el menú modal de Radix peleaba el foco (Step 3, onCloseAutoFocus).
- El test de la lista pasa a enviada una completa por SQL (como el script de captura del Step 9) para que el ⋯ ofrezca Aprobar… y Rechazar….
- Una nueva que se envía o aprueba sin guardar antes (decisión 12) la cubre el flujo completo de la Task 13.

Con Supabase local levantado y sin otro `next dev` en el puerto 3000:

```bash
npx playwright test tests/e2e/cotizaciones.spec.ts -g "acciones de estado del editor"
```

Expected: 5 passed.

- [ ] **Step 9: Verificación visual del encabezado y las franjas**

Script de captura (va en el scratchpad, **no** en el repo):

```js
// <scratchpad>/captura-estados.cjs
// Uso (desde la raíz del repo, con `npm run dev` levantado y los E2E corridos al menos una vez, que crean el usuario):
//   node <scratchpad>/captura-estados.cjs <scratchpad>
const path = require('node:path')
const desdeRepo = (modulo) => require(require.resolve(modulo, { paths: [process.cwd()] }))
const { chromium } = desdeRepo('@playwright/test')
const pg = desdeRepo('pg')

const salida = process.argv[2]
if (!salida) throw new Error('Falta la carpeta de salida (el scratchpad)')
process.loadEnvFile('.env.local')

async function crear(db, datos) {
  const { rows } = await db.query(
    `insert into public.cotizaciones (cliente_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques)
     select c.id, 'jornada', p.id, e.id, f.id, p.asunto, p.intro, $1::jsonb, p.bloques
     from public.clientes c, public.plantillas p, public.equipos e, public.firmantes f
     where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and p.nombre = 'Por jornada - Grúa con operador'
       and e.nombre = 'Grúa telescópica XCMG 70 TN' and f.nombre = 'Thomas Cravero'
     returning id`,
    [JSON.stringify(datos)],
  )
  const id = rows[0].id
  await db.query(
    `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad) values
       ($1, 1, 'Precios Jornada', 'Servicio de grúa móvil telescópica XCMG 70 TN', 1950000, 'JORNADA'),
       ($1, 2, 'Precios Jornada Adicional', 'Hora adicional de grúa', 195000, 'HORA')`,
    [id],
  )
  return id
}

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  const completos = {
    ubicacion: 'Loma Campana, Añelo',
    horario: 'lunes a sábado de 8 a 17 hs',
    duracion_estimada: '10 jornadas',
    forma_pago: '30 días fecha de factura',
    disponibilidad: 'inmediata',
  }
  const { ubicacion: _sinUbicacion, ...sinUbicacion } = completos
  const borrador = await crear(db, sinUbicacion)
  const enviada = await crear(db, completos)
  // Un envío falso (sin PDF en Storage) alcanza para ver la franja y el historial.
  await db.query(`update public.cotizaciones set estado = 'enviada' where id = $1`, [enviada])
  await db.query(`insert into public.cotizacion_envios (cotizacion_id, pdf_path) values ($1, $2)`, [
    enviada,
    `cotizaciones/${enviada}/enviada-0.pdf`,
  ])
  const navegador = await chromium.launch({ channel: 'chromium' })
  try {
    const page = await navegador.newPage({
      viewport: { width: 1200, height: 805 },
      locale: 'es-AR',
      timezoneId: 'America/Argentina/Buenos_Aires',
    })
    await page.goto('http://localhost:3000/login')
    await page.getByLabel('Email').fill('e2e@equipos.test')
    await page.getByLabel('Contraseña').fill('E2e-1234-segura')
    await page.getByRole('button', { name: 'Ingresar' }).click()
    await page.getByRole('heading', { name: 'Inicio' }).waitFor()

    await page.goto(`http://localhost:3000/cotizaciones/${borrador}`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(salida, 'app-12-borrador.png') })

    await page.goto(`http://localhost:3000/cotizaciones/${enviada}`)
    await page.waitForLoadState('networkidle')
    await page.screenshot({ path: path.join(salida, 'app-12-enviada.png') })
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await page.screenshot({ path: path.join(salida, 'app-12-aprobar.png') })
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Más acciones' }).click()
    await page.screenshot({ path: path.join(salida, 'app-12-menu.png') })
  } finally {
    await navegador.close()
    await db.query('delete from public.cotizaciones where id = any($1::uuid[])', [[borrador, enviada]])
    await db.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

```bash
npm run dev   # en otra terminal, si no está levantado
node <scratchpad>/captura-estados.cjs <scratchpad>
magick docs/diseno/referencias/03-editor-cotizacion.png -resize 1200x <scratchpad>/ref-03.png
```

Mirá las capturas con `ref-03.png` al lado:
- `app-12-borrador.png`: título "Cotización N° …" (28 px, semibold), pastilla "Borrador" y, en la misma fila y alineados a la derecha, Guardar (outline) · Descargar y marcar enviada (primario, con sombra azul) · Aprobar (outline) · ⋯, todos de 36 px de alto, como `03-acciones` de la referencia. Los dos de transición deshabilitados (falta el lugar del servicio) y, debajo, la franja amarilla "Para enviar falta completar: **Lugar del servicio**" de ancho completo, con el punto amarillo; al tocar el nombre, el foco va al campo.
- `app-12-enviada.png`: Guardar · Rechazar (outline) · Aprobar (primario) · ⋯; franja azul "Enviada el dd/mm/aaaa. Lo que edites no le llega al cliente hasta que la vuelvas a mandar. Ver lo que recibió el cliente".
- `app-12-aprobar.png`: la confirmación verde reemplaza a la franja azul, con la pregunta en negrita, "Fecha de aprobación" con hoy y Cancelar (con el foco) · Aprobar a la derecha.
- `app-12-menu.png`: el ⋯ con "Descargar y marcar enviada de nuevo", "Duplicar", el separador y "Envíos (lo que recibió el cliente)" con la fecha y hora del envío; el menú se ensancha para que nada se corte.

Si las acciones bajan a una segunda fila a 1200, revisá anchos y espacios del encabezado (relev-visual §3.2) antes de tocar otra cosa. Ajustá clases y repetí la captura. Matá el `next dev` que levantaste (`lsof -ti tcp:3000 | xargs kill`).

- [ ] **Step 10: Verificación y commit**

```bash
npm run check && npm run test:e2e
```

Expected: todo en verde (los E2E de las tareas anteriores y los nuevos).

```bash
git add src/lib/cotizaciones/acciones-estado.ts src/lib/cotizaciones/acciones-estado.test.ts \
  src/components/cotizaciones/editor/acciones-editor.tsx src/components/cotizaciones/editor/franjas-editor.tsx \
  src/components/formulario/confirmacion-en-lugar.tsx src/components/cotizaciones/editor/editor-cotizacion.tsx \
  "src/app/(app)/cotizaciones/[id]/page.tsx" src/components/cotizaciones/lista tests/e2e/cotizaciones.spec.ts
git commit -m "feat: acciones de estado de la cotización con confirmaciones en el lugar

- Botones por estado en el encabezado y menú con el historial de envíos
- Descargar y marcar enviada y aprobar guardan antes (también una nueva) y usan la versión que vio la pantalla
- Aprobar con fecha, aviso de versión no enviada y oferta de finalizar el presupuesto anterior
- Rechazar, reabrir, revertir y eliminar con confirmación en el lugar, también desde el menú; duplicar y navegar
- Franjas de pendientes (con foco al campo), de estado y de conflicto con Recargar
- Transiciones en el menú de cada fila de la lista, que abren el editor con la confirmación

Co-Authored-By: Claude <noreply@anthropic.com>"
```

---

### Task 13: E2E del flujo completo, verificación visual contra la 02 y la 03, y README

**Depende de:** todas las anteriores. En particular: la lista (Task 7), el editor y guardar (Task 8), la grilla de ítems (Task 9), la vista previa y `tests/e2e/base-datos.ts` (Task 11) y las acciones de estado con sus franjas (Task 12).

**Qué deja:**
- Un E2E del flujo completo en `tests/e2e/cotizaciones.spec.ts`: lista → nueva por jornada → cliente VERTICE (semilla) → Atte. → equipo → datos → precios → franja de pendientes vacía → vista previa sin guardar (`POST` que responde `application/pdf`) → "Descargar y marcar enviada" sin haber guardado (decisión 12: guarda, marca enviada, descarga `COTIZACION N° … VERTICE.pdf` y pasa a `/cotizaciones/{id}`) → aprobar con fecha → franja de aprobada y campos deshabilitados → en la lista con el filtro Aprobada → duplicar → borrador nuevo con `reemplaza_a` → aprobar la copia → "Finalizar el presupuesto N° X" (decisión 14) → la original queda `finalizado`. Eliminar un borrador ya lo prueba la Task 12.
- Un E2E de conflicto de versión: otra escritura cambia `updated_at`, Guardar avisa sin perder lo escrito y "Recargar" trae la versión nueva.
- La verificación visual final de la lista (02) y el editor (03) a 1200×805, con capturas en el scratchpad y ajustes de clases si hacen falta.
- La sección "Pantallas de cotizaciones" del README.
- La verificación completa: `npm run db:reset && npm run check && npm run test:int && npm run build && npm run test:e2e`.

**Files:**
- Modify: `tests/e2e/cotizaciones.spec.ts` (dos `describe` nuevos al final)
- Modify: `README.md`
- Modify (solo si la verificación visual lo pide): clases de `src/components/cotizaciones/**` y `src/app/(app)/cotizaciones/**`
- Test: `tests/e2e/cotizaciones.spec.ts` y la suite completa

- [ ] **Step 1: Confirmar los nombres accesibles que usa el test**

Los E2E solo usan selectores accesibles, que salen de las tareas anteriores. Confirmalos contra el código antes de correr (por ejemplo `grep -rn "aria-label=\|htmlFor=\|etiqueta=" src/components/cotizaciones`). Si alguno cambió en la implementación, **cambiá el selector del test**, no la UI (salvo que falte la etiqueta: entonces agregala en el componente).

| En el test | Qué es | De dónde sale |
|---|---|---|
| `getByRole('link', { name: 'Nueva cotización' })` | botón del encabezado de la lista | Task 7 |
| `getByRole('radio', { name: 'Por jornada' })` | control segmentado de formato (la nueva arranca con la primera plantilla por nombre, la mensual) | Task 8 (`TarjetaDatos`) |
| `getByRole('combobox', { name: 'Cliente', exact: true })`, `getByRole('combobox', { name: 'Buscar cliente' })`, `getByRole('option', { name: /VERTICE…/ })` | combobox de cliente (Popover + Command) | Task 8 (`SelectorCliente`) |
| `getByLabel('Atte.', { exact: true })` | select de contacto | Task 8 (`TarjetaCliente`) |
| `getByLabel('Equipo' / 'Lugar del servicio' / 'Horario' / 'Tiempo estimado de contratación' / 'Forma de pago' / 'Disponibilidad', { exact: true })` | campos de "Datos de esta cotización" que usa la plantilla por jornada (las etiquetas de los datos son las de `VARIABLES`) | Task 8 (`TarjetaDatos`) |
| `getByLabel('Precio del ítem N', { exact: true })` | precio de cada ítem (los tres de la plantilla por jornada) | Task 9 |
| `getByLabel('Asunto', { exact: true })` | asunto | Task 8 (`TarjetaAsunto`) |
| `getByRole('button', { name: 'Guardar', exact: true })` | Guardar del encabezado (el de la barra inferior está oculto a 1280 px); lo usa el test de conflicto | Task 8 |
| `getByRole('heading', { level: 1 })` con `Cotización N° 112712` | título del editor | Task 8 (`resumenEncabezado`) |
| "Actualizar vista previa", "Descargar y marcar enviada", "Aprobar", "Duplicar", "Finalizar el presupuesto N° X", "Recargar", los `group` de confirmación y "Fecha de aprobación" | vista previa y acciones de estado | Tasks 11 y 12 |
| `getByRole('row')` + link con el número exacto; `?estado=aprobada&q=<número>` | fila de la tabla y filtros de la lista | Tasks 2 y 7 |

- [ ] **Step 2: E2E del flujo completo**

Al final de `tests/e2e/cotizaciones.spec.ts` (los imports de `./base-datos`, `./helpers` y `Page` ya los dejó la Task 11; `respuestaVistaPrevia` y `hoyArgentina` también están en el archivo, de las Tasks 11 y 12):

```ts
test.describe('flujo completo de una cotización', () => {
  const sufijo = sufijoUnico()
  const contacto = `Contacto E2E ${sufijo}`
  let contactoId: string
  const creadas: string[] = []

  test.beforeAll(async () => {
    // VERTICE no tiene contactos en la semilla: uno propio para elegir el Atte.
    contactoId = await conBase(async (db) => {
      const { rows } = await db.query<{ id: string }>(
        `insert into public.contactos (cliente_id, nombre, email)
         select id, $1, $2 from public.clientes where razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.'
         returning id`,
        [contacto, `e2e-${sufijo}@vertice.test`],
      )
      return rows[0].id
    })
  })

  test.afterAll(async () => {
    await conBase(async (db) => {
      await borrarCotizaciones(db, creadas)
      await db.query('delete from public.contactos where id = $1', [contactoId])
    })
  })

  test('de nueva a aprobada, y renegociada con el presupuesto anterior finalizado', async ({ page }) => {
    await iniciarSesion(page)
    await page.goto('/cotizaciones')
    await page.getByRole('link', { name: 'Nueva cotización' }).click()
    await expect(page).toHaveURL(/\/cotizaciones\/nueva$/)

    // Formato (la nueva arranca con la primera plantilla por nombre: la mensual), cliente y Atte.
    await page.getByRole('radio', { name: 'Por jornada' }).click()
    await expect(page.getByRole('radio', { name: 'Por jornada' })).toBeChecked()
    await page.getByRole('combobox', { name: 'Cliente', exact: true }).click()
    await page.getByRole('combobox', { name: 'Buscar cliente' }).fill('vertice')
    await page.getByRole('option', { name: /VERTICE SERVICIOS INTEGRALES S\.R\.L\./ }).click()
    await page.getByLabel('Atte.', { exact: true }).selectOption({ label: contacto })

    // Datos de esta cotización (los que usa la plantilla por jornada; las etiquetas son las de VARIABLES).
    await page.getByLabel('Equipo', { exact: true }).selectOption({ label: 'Grúa telescópica XCMG 70 TN' })
    await page.getByLabel('Lugar del servicio', { exact: true }).fill('Loma Campana, Añelo')
    await page.getByLabel('Horario', { exact: true }).fill('lunes a sábado de 8 a 17 hs')
    await page.getByLabel('Tiempo estimado de contratación', { exact: true }).fill('10 jornadas')
    await page.getByLabel('Forma de pago', { exact: true }).fill('30 días fecha de factura')
    await page.getByLabel('Disponibilidad', { exact: true }).fill('inmediata')

    // Precios de los tres ítems de la plantilla, pegados como vienen de una planilla.
    await expect(page.getByLabel(/^Precio del ítem \d+$/)).toHaveCount(3)
    await page.getByLabel('Precio del ítem 1', { exact: true }).fill('1.950.000')
    await page.getByLabel('Precio del ítem 2', { exact: true }).fill('2800000')
    await page.getByLabel('Precio del ítem 3', { exact: true }).fill('2.530.000,00')

    // Sin guardar todavía: no falta nada (el número se asigna al guardar, decisión 8).
    await expect(page.getByText('Para enviar falta completar')).toBeHidden()

    // Vista previa: el PDF real de lo que hay en pantalla, aunque no esté guardado.
    const vista = respuestaVistaPrevia(page)
    await page.getByRole('button', { name: 'Actualizar vista previa' }).click()
    expect((await vista).headers()['content-type']).toBe('application/pdf')

    // Descargar y marcar enviada sin haber guardado (decisión 12): guarda, marca enviada, baja el PDF del envío con
    // el nombre de siempre y recién ahí pasa a /cotizaciones/{id}.
    const descarga = page.waitForEvent('download', {
      predicate: (archivo) => archivo.suggestedFilename().startsWith('COTIZACION'),
    })
    await page.getByRole('button', { name: 'Descargar y marcar enviada' }).click()
    const nombreArchivo = (await descarga).suggestedFilename()
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    const id = page.url().split('/').at(-1)!
    creadas.push(id)
    const titulo = page.getByRole('heading', { level: 1 })
    await expect(titulo).toHaveText(/^Cotización N° \d+$/)
    const numero = Number((await titulo.textContent())!.replace(/\D/g, ''))
    expect(nombreArchivo).toBe(`COTIZACION N° ${numero} VERTICE.pdf`)
    await expect(page.getByText(/^Enviada el \d{2}\/\d{2}\/\d{4}\. Lo que edites/)).toBeVisible()

    // Aprobar con fecha: queda congelada.
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    const aprobar = page.getByRole('group', { name: `¿Aprobar la cotización N° ${numero}?` })
    await expect(aprobar.getByLabel('Fecha de aprobación')).toHaveValue(hoyArgentina().iso)
    await aprobar.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await expect(page.getByText(/^Aprobada el \d{2}\/\d{2}\/\d{4}: es un presupuesto y no se modifica\.$/)).toBeVisible()
    await expect(page.getByLabel('Lugar del servicio', { exact: true })).toBeDisabled()

    // En la lista, con el filtro Aprobada.
    await page.goto(`/cotizaciones?estado=aprobada&q=${numero}`)
    const fila = page.getByRole('row').filter({ hasText: String(numero) })
    await expect(fila.getByText('Aprobada', { exact: true })).toBeVisible()
    await fila.getByRole('link', { name: String(numero), exact: true }).click()
    await expect(page).toHaveURL(new RegExp(`/cotizaciones/${id}$`))

    // Duplicar: un borrador nuevo que reemplaza a la aprobada.
    await page.getByRole('button', { name: 'Duplicar', exact: true }).click()
    await expect(page).not.toHaveURL(new RegExp(`/cotizaciones/${id}$`))
    await expect(page).toHaveURL(/\/cotizaciones\/[0-9a-f-]{36}$/)
    const copia = page.url().split('/').at(-1)!
    creadas.push(copia)
    await expect(page.getByText(`Duplicada de N° ${numero}`)).toBeVisible()
    await expect(page.getByRole('link', { name: `N° ${numero}`, exact: true })).toHaveAttribute('href', `/cotizaciones/${id}`)
    const reemplaza = await conBase((db) =>
      db.query<{ reemplaza_a: string }>('select reemplaza_a from public.cotizaciones where id = $1', [copia]),
    )
    expect(reemplaza.rows[0].reemplaza_a).toBe(id)

    // Aprobar la copia (trae precios y datos, con fecha de hoy) ofrece finalizar el presupuesto que reemplaza.
    await expect(titulo).not.toHaveText(`Cotización N° ${numero}`)
    const numeroCopia = Number((await titulo.textContent())!.replace(/\D/g, ''))
    await page.getByRole('button', { name: 'Aprobar', exact: true }).click()
    await page
      .getByRole('group', { name: `¿Aprobar la cotización N° ${numeroCopia}?` })
      .getByRole('button', { name: 'Aprobar', exact: true })
      .click()
    const finalizar = page.getByRole('group', {
      name: `Esta cotización reemplaza a la N° ${numero}, que sigue en curso como presupuesto.`,
    })
    await finalizar.getByRole('button', { name: `Finalizar el presupuesto N° ${numero}` }).click()
    await expect(page.getByText(`Se finalizó el presupuesto N° ${numero}`)).toBeVisible()
    await expect(finalizar).toBeHidden()
    const original = await conBase((db) =>
      db.query<{ presupuesto_estado: string }>('select presupuesto_estado from public.cotizaciones where id = $1', [id]),
    )
    expect(original.rows[0].presupuesto_estado).toBe('finalizado')
  })
})
```

Por qué así:
- VERTICE no tiene contactos en la semilla: el `beforeAll` le crea uno con nombre único y el `afterAll` lo borra (las cotizaciones que lo usan quedan sin Atte., cosa que el trigger permite incluso en una aprobada).
- No se toca "Guardar": la nueva se envía directo (decisión 12), así el test cubre el guardado previo de una nueva, la navegación a `/cotizaciones/{id}` y la descarga con el número recién asignado. Guardar una nueva con el botón ya lo prueba la Task 8.
- La descarga se espera con un `predicate` por nombre: el Chromium sin interfaz de los E2E puede tomar como descarga el PDF del iframe de la vista previa (un blob, sin ese nombre).
- El nombre del archivo lo arma la ruta del PDF (`nombreArchivoCotizacion`): `COTIZACION N° <número> VERTICE.pdf`.
- La oferta de finalizar (decisión 14) aparece después de aprobar la copia, porque la original es un presupuesto en curso. Eliminar un borrador ya lo prueba la Task 12.
- Lo que crea el test se borra en el `afterAll` por id (las aprobadas también: como superusuario no hay trigger que lo impida; `reemplaza_a` es `on delete set null`). Los PDF que quedan en Storage local no molestan.

```bash
npx playwright test tests/e2e/cotizaciones.spec.ts -g "flujo completo de una cotización"
```

Expected: 1 passed. Si falla una aserción de comportamiento (no de nombre), es un error de la tarea que hizo esa parte: corregilo en el componente o en la lógica (con su test unitario si es lógica pura), no relajes el E2E.

- [ ] **Step 3: E2E del conflicto de versión**

Sigue en el mismo archivo:

```ts
test.describe('conflicto de versión', () => {
  const creadas: string[] = []

  test.afterAll(async () => {
    await conBase((db) => borrarCotizaciones(db, creadas))
  })

  test('si otro guardó antes, avisa sin perder lo escrito y Recargar trae la versión nueva', async ({ page }) => {
    const { id, numero } = await conBase((db) => crearCotizacionCompleta(db))
    creadas.push(id)
    await iniciarSesion(page)
    await page.goto(`/cotizaciones/${id}`)

    const asunto = page.getByLabel('Asunto', { exact: true })
    const original = await asunto.inputValue()
    await asunto.fill('Asunto cambiado en esta pestaña')

    // Otra pestaña (u otra persona) guarda: cambia la versión en la base.
    await conBase((db) => db.query('update public.cotizaciones set updated_at = now() where id = $1', [id]))

    await page.getByRole('button', { name: 'Guardar', exact: true }).click()
    await expect(page.getByText('La cotización cambió desde que la abriste; volvé a intentarlo').first()).toBeVisible()
    await expect(asunto).toHaveValue('Asunto cambiado en esta pestaña')

    await page.getByRole('button', { name: 'Recargar' }).click()
    await page
      .getByRole('group', { name: 'Se descartan los cambios que no guardaste y se carga la versión actual.' })
      .getByRole('button', { name: 'Descartar y recargar' })
      .click()
    await expect(asunto).toHaveValue(original)

    // Con la versión nueva se vuelve a operar.
    const descarga = page.waitForEvent('download', {
      predicate: (archivo) => archivo.suggestedFilename().startsWith('COTIZACION'),
    })
    await page.getByRole('button', { name: 'Descargar y marcar enviada' }).click()
    expect((await descarga).suggestedFilename()).toBe(`COTIZACION N° ${numero} VERTICE.pdf`)
  })
})
```

El `update … set updated_at = now()` alcanza: el trigger `cotizaciones_set_updated_at` pone `now()` de esa transacción, distinto de la versión que leyó la pantalla. El mensaje se busca con `.first()` porque, además de la franja con "Recargar", puede haber un toast con el mismo texto.

```bash
npx playwright test tests/e2e/cotizaciones.spec.ts -g "conflicto de versión"
```

Expected: 1 passed.

- [ ] **Step 4: Verificación visual de la lista y el editor contra la 02 y la 03**

Script de captura (va en el scratchpad, **no** en el repo). Usa el Chromium completo de Playwright (`channel: 'chromium'`), que dibuja el PDF dentro del iframe (el liviano de los E2E no). Crea una cotización como la de la imagen 03 (VERTICE, por jornada, dos secciones con precio, ubicación sin completar), saca las capturas y la borra.

```js
// <scratchpad>/capturas-3b.cjs
// Uso (desde la raíz del repo, con `npm run dev` levantado y los E2E corridos al menos una vez, que crean el usuario):
//   node <scratchpad>/capturas-3b.cjs <scratchpad>
const path = require('node:path')
const desdeRepo = (modulo) => require(require.resolve(modulo, { paths: [process.cwd()] }))
const { chromium } = desdeRepo('@playwright/test')
const pg = desdeRepo('pg')

const salida = process.argv[2]
if (!salida) throw new Error('Falta la carpeta de salida (el scratchpad)')
process.loadEnvFile('.env.local')
const APP = 'http://localhost:3000'

async function crearComoLaReferencia(db) {
  const { rows } = await db.query(
    `insert into public.cotizaciones (cliente_id, formato, plantilla_id, equipo_id, firmante_id, asunto, intro, datos, bloques)
     select c.id, 'jornada', p.id, e.id, f.id, p.asunto, p.intro,
       '{"horario": "lunes a sábado de 8 a 17 hs", "duracion_estimada": "10 jornadas",
         "forma_pago": "30 días fecha de factura", "disponibilidad": "inmediata"}'::jsonb, p.bloques
     from public.clientes c, public.plantillas p, public.equipos e, public.firmantes f
     where c.razon_social = 'VERTICE SERVICIOS INTEGRALES S.R.L.' and p.nombre = 'Por jornada - Grúa con operador'
       and e.nombre = 'Grúa telescópica XCMG 70 TN' and f.nombre = 'Thomas Cravero'
     returning id`,
  )
  const id = rows[0].id
  await db.query(
    `insert into public.cotizacion_items (cotizacion_id, orden, seccion, descripcion, precio_unitario, unidad) values
       ($1, 1, 'Precios Jornada', 'Servicio de grúa móvil telescópica XCMG 70 TN', 1950000, 'JORNADA'),
       ($1, 2, 'Precios Jornada Adicional', 'Hora adicional de grúa', 195000, 'HORA')`,
    [id],
  )
  return id
}

async function capturar(navegador, ancho, alto, ruta, archivo, { esperarVista = false } = {}) {
  const contexto = await navegador.newContext({
    viewport: { width: ancho, height: alto },
    locale: 'es-AR',
    timezoneId: 'America/Argentina/Buenos_Aires',
  })
  const page = await contexto.newPage()
  await page.goto(`${APP}/login`)
  await page.getByLabel('Email').fill('e2e@equipos.test')
  await page.getByLabel('Contraseña').fill('E2e-1234-segura')
  await page.getByRole('button', { name: 'Ingresar' }).click()
  await page.getByRole('heading', { name: 'Inicio' }).waitFor()
  const vista = esperarVista ? page.waitForResponse((r) => r.url().endsWith('/cotizaciones/vista-previa')) : null
  await page.goto(`${APP}${ruta}`)
  await page.waitForLoadState('networkidle')
  if (vista) {
    await vista
    await page.waitForTimeout(2000) // el visor termina de dibujar el PDF
  }
  await page.screenshot({ path: path.join(salida, archivo) })
  await contexto.close()
}

async function main() {
  const db = new pg.Client({ connectionString: process.env.SUPABASE_DB_URL })
  await db.connect()
  const id = await crearComoLaReferencia(db)
  const navegador = await chromium.launch({ channel: 'chromium' })
  try {
    await capturar(navegador, 1200, 805, '/cotizaciones', 'app-02-cotizaciones.png')
    await capturar(navegador, 1200, 805, `/cotizaciones/${id}`, 'app-03-editor.png', { esperarVista: true })
    // Sin columna de vista previa: barra inferior con Guardar y "Vista previa" (Sheet en tablet, pestaña en el celular).
    await capturar(navegador, 1024, 768, `/cotizaciones/${id}`, 'app-03-editor-1024.png')
    await capturar(navegador, 390, 844, `/cotizaciones/${id}`, 'app-03-editor-390.png')
    await capturar(navegador, 390, 844, '/cotizaciones', 'app-02-cotizaciones-390.png')
  } finally {
    await navegador.close()
    await db.query('delete from public.cotizaciones where id = $1', [id])
    await db.end()
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
```

```bash
npm run dev   # en otra terminal, si no está levantado
node <scratchpad>/capturas-3b.cjs <scratchpad>
magick docs/diseno/referencias/02-cotizaciones.png -resize 1200x <scratchpad>/ref-02.png
magick docs/diseno/referencias/03-editor-cotizacion.png -resize 1200x <scratchpad>/ref-03.png
```

Mirá cada captura al lado de su referencia (abrí las dos imágenes). Lo que tiene que coincidir, salvo lo que las decisiones cambian a propósito:

**Lista (`app-02-cotizaciones.png` contra `ref-02.png`):**
- Encabezado: "Cotizaciones" grande y fino con el chip gris del total al lado; "+ Nueva cotización" primario (`h-10`, sombra azul) arriba a la derecha. "Cargar existente" y "Presupuesto directo" no están: son del plan 3C.
- Filtros en una fila de `h-9` (y≈139–173): buscador ≈304 px, Estado ≈160, Cliente ≈184, Fechas ≈216, con `gap-2`. Sin rango de fechas por defecto ("Cualquier fecha").
- Tabla en tarjeta (`rounded-xl border shadow-tarjeta`) desde y≈200: encabezado gris claro de ~41–44 px, filas de ~48 px, columnas N°, Fecha, Cliente, Trabajo, Formato, Estado, Vence el y las acciones (íconos `ghost`, sin el fondo gris de la imagen). **Sin "Importe"** (decisión 1): ese ancho lo toman Cliente y Trabajo.
- Pastillas con punto y esquinas `rounded-md` (no las redondas de la imagen): Borrador gris, Enviada azul, Vencida ámbar, Aprobada verde, Rechazada roja. "Vence el" solo en enviadas, en ámbar si está vencida; el resto "—".
- Fondo blanco (decisión 21); el sidebar sin tilde ni punto de más (defectos del README).
- Con más de 25 cotizaciones, el pie "Mostrando 1–25 de N" con las páginas; con una sola página no hay pie.

**Editor (`app-03-editor.png` contra `ref-03.png`):**
- Migas "Cotizaciones / N° …". Título "Cotización N° …" de 28 px en semibold, la pastilla Borrador al lado y, en la **misma fila**, Guardar (outline) · Descargar y marcar enviada (primario) · Aprobar (outline) · ⋯, todos de `h-9`. Si las acciones bajan a otra fila a 1200, revisá anchos (relev-visual §3.2): el ⋯ es lo único que la imagen no tiene.
- Debajo del encabezado, la franja amarilla "Para enviar falta completar: **Lugar del servicio**" (no está en la imagen: es la decisión 17).
- Dos columnas: la izquierda de x≈276 a x≈824 (548 px) con Cliente, Datos de esta cotización, Asunto e introducción, Ítems y Textos separadas 16 px; la derecha de x≈844 a x≈1164 (320 px) con "Vista previa".
- Tarjetas sin ícono ni bajada, título `text-lg`. Cliente: razón social y "Atte." lado a lado (≈3:2). Datos en dos columnas, con "Lugar del servicio" vacío y la marca `{{ubicacion}}` amarilla superpuesta (no escrita en el campo).
- Ítems a sangre dentro de la tarjeta: secciones en filas grises con el nombre en negrita, montos sin "$" alineados a la derecha, unidad en select chico, "+ Agregar ítem" en azul abajo a la izquierda.
- Vista previa: título, "Actualizar vista previa" chico a la derecha, la hoja A4 de ≈296 px con el PDF real (no la hoja genérica de la imagen) y `{{ubicacion}}` resaltado en amarillo dentro del PDF, sobre el pozo gris.
- Diferencias aceptadas: fondo blanco, título más chico que en la imagen, barra de formato de los textos solo con negrita y viñetas (decisión 5), un solo ojo por bloque.

**Anchos sin columna (`app-03-editor-1024.png`, `app-03-editor-390.png`, `app-02-cotizaciones-390.png`):**
- 1024: una sola columna y la barra fija abajo con "Vista previa" y Guardar (primario); las transiciones del encabezado en outline.
- 390: tarjetas apiladas, Cliente y Atte. uno debajo del otro, ítems en dos líneas, el título hace wrap con la pastilla; en el encabezado queda el primario y el ⋯ (los secundarios van al menú); sin scroll horizontal. La lista muestra la lista de celular, no la tabla.

Si algo no coincide, ajustá clases en el componente que corresponde (sin cambiar comportamiento), volvé a capturar y repetí hasta que coincidan layout, jerarquía, espaciado y colores. Dejá las capturas finales en el scratchpad. Matá el `next dev` que levantaste (`lsof -ti tcp:3000 | xargs kill`).

- [ ] **Step 5: README**

En `README.md`, después de la sección "## Cotizaciones y PDF" (y antes de "## Presupuestos y documentos"), agregar:

```markdown
## Pantallas de cotizaciones

- **Lista** (`/cotizaciones`): búsqueda sin acentos por número, cliente o asunto (`buscar_cotizaciones`) y filtros por estado, cliente y fechas, todo en la URL, de a 25 por página. "Vencida" no es un estado guardado: es una enviada fuera de validez, y el filtro "Enviada" muestra solo las que siguen vigentes. Las listas no muestran montos.
- **Editor** (`/cotizaciones/nueva` y `/cotizaciones/<id>`): cliente con alta rápida, datos que completan las variables de la plantilla, ítems con teclado y precios pegados, textos con formato mínimo (negrita y viñetas de dos niveles) y bloques que se ocultan o se restauran desde la plantilla. El número se asigna al primer guardado; Ctrl/⌘+S guarda. Se editan los borradores y las enviadas; una aprobada o rechazada queda de solo lectura. Las cotizaciones cargadas y los presupuestos directos se ven en una vista mínima de solo lectura.
- **Lo que falta para enviar:** una franja amarilla lista las variables sin completar y los ítems sin precio, y cada nombre lleva al campo. Mientras falte algo, "Descargar y marcar enviada" y "Aprobar" quedan deshabilitados.
- **Vista previa:** el PDF real de lo que hay en pantalla, aunque no esté guardado (`POST /cotizaciones/vista-previa`), con las variables pendientes en amarillo; se actualiza con el botón. En el celular se guarda y se abre `GET /cotizaciones/<id>/pdf?actual=1` en otra pestaña. Una aprobada muestra su PDF congelado.
- **Estados:** "Descargar y marcar enviada" guarda si hace falta (también una nueva, que recibe su número ahí), registra el envío y baja ese PDF (`COTIZACION N° 112712 VERTICE.pdf`); los envíos anteriores están en el menú ⋯. Aprobar pide la fecha (no anterior a la de la cotización) y, si la cotización reemplaza a un presupuesto en curso, ofrece finalizarlo. Rechazar, reabrir, revertir y eliminar se confirman en el lugar, sin ventanas; el ⋯ de cada fila de la lista también las ofrece y abre el editor con la confirmación (`?accion=`). Duplicar crea un borrador que reemplaza a la original (renegociación).
- **Control de versión:** guardar, enviar y aprobar mandan la versión que vio la pantalla. Si alguien la cambió mientras tanto, el editor avisa sin perder lo escrito y ofrece "Recargar".
```

- [ ] **Step 6: Verificación completa y commit**

Con Supabase local levantado y sin otro `next dev` tuyo en el puerto 3000:

```bash
npm run db:reset && npm run check && npm run test:int && npm run build && npm run test:e2e
```

Expected: todo en verde. `db:reset` borra el usuario de los E2E; el `globalSetup` de Playwright lo vuelve a crear. Si `npm run build` falla por algo que `typecheck` no vio (por ejemplo, una página que usa `useSearchParams` sin `Suspense`), corregilo en el archivo que corresponde y volvé a correr todo.

```bash
git add tests/e2e/cotizaciones.spec.ts README.md
git add src/components/cotizaciones "src/app/(app)/cotizaciones"   # solo si la verificación visual cambió clases
git status --short
git commit -m "test: flujo completo y conflicto de versión de cotizaciones, y README de las pantallas

- E2E de punta a punta: nueva por jornada, vista previa, descargar y marcar enviada sin guardar antes, aprobar, filtrar, duplicar, aprobar la copia y finalizar el presupuesto anterior
- E2E de conflicto de versión con Recargar
- Ajustes de la verificación visual contra las referencias 02 y 03
- Sección Pantallas de cotizaciones en el README

Co-Authored-By: Claude <noreply@anthropic.com>"
```

Expected (`git status` antes del commit): nada sin agregar salvo lo que no es de esta tarea. Si la verificación visual no cambió nada, el segundo `git add` no agrega nada y el cuerpo del commit no lleva la tercera viñeta.

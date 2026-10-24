# Referencias de UI generadas

Imágenes de referencia para el skill `frontend-from-generated-image`. Son el objetivo visual de las pantallas: se copian layout, jerarquía, espaciado, tipografía y color.

| Archivo | Pantalla | Plan |
|---|---|---|
| `01-inicio.png` | Inicio con colas de trabajo | 3B |
| `02-cotizaciones.png` | Lista de cotizaciones | 3B |
| `03-editor-cotizacion.png` | Editor de cotización con vista previa del PDF | 3B |
| `04-presupuesto.png` | Detalle de presupuesto | 3B / 4 |
| `05-subir-documento-movil.png` | Subir documento desde el celular (390×844) | 4 |
| `06-cliente.png` | Ficha de cliente | 2 (rediseño) |
| `07-configuracion.png` | Índice de configuración | 2 (rediseño) |
| `07b-configuracion-equipos.png` | Configuración › Equipos (pantalla de ejemplo) | 2 (rediseño) |
| `08-login.png` | Login: panel de marca a la izquierda, formulario a la derecha | 1 (rediseño) |

## Dirección visual: "SaaS premium"

Elegida por Guido el 2026-10-24 entre cuatro direcciones generadas sobre la ficha de cliente: marca fuerte con sidebar azul, industrial con sidebar carbón y franja de seguridad, SaaS premium y ficha tipo CRM. Una primera tanda que mantenía el shell anterior quedó descartada por "simplona".

Rasgos que se repiten en todas las pantallas:

- **Shell:** sidebar gris muy claro con el logo arriba; ítems con íconos de línea; activo como fila teñida de azul con texto azul (no pastilla llena); menú de usuario "UE · Usuario E2E" con chevron al pie del sidebar; barra superior blanca y fina con el breadcrumb.
- **Banda de portada:** degradé azul real → índigo con una trama tenue de ganchos de grúa. Se usa en fichas (cliente, presupuesto) con un recuadro blanco superpuesto al borde inferior, y en versión baja como encabezado de Inicio y Configuración. Las listas y el editor no la llevan.
- **Superficies y tipografía:** tarjetas blancas con borde fino, radio de 12 px y sombras muy suaves; títulos grandes y finos; texto secundario gris.
- **Color:** botón primario azul #3D47CC y secundarios con contorno; estados como pastillas con punto de color; el amarillo #E6DC1F solo como acento mínimo (variables sin completar).

## Piezas ya implementadas (plan 2)

La pasada de clientes y configuración dejó el shell y estas piezas listas para reutilizar en las pantallas del 3B:

- `src/components/app-shell/encabezado.tsx`:
  - `BarraMigas`: la barra superior con el breadcrumb. Cada página la renderiza, porque el shell ya no tiene barra en escritorio.
  - `Portada`: la banda con la trama `public/portada-ganchos.svg`.
  - `EncabezadoFicha`: banda, recuadro superpuesto, título, estado, datos clave y acciones (como en 06 y 04).
  - `EncabezadoSeccion`: banda baja con título blanco (como en 07 y 01).
  - `EncabezadoPagina`: título sin banda, bajada y acciones (como en 07b y 02).
  - `Contenido`: márgenes y espaciado de la página.
- `src/components/ui/pastilla.tsx`: estados con punto. Tonos `exito`, `info`, `aviso`, `peligro` y `neutro`.
- Tokens de `globals.css`: `from-portada-desde` y `to-portada-hasta`, `shadow-tarjeta`, y la paleta fría de bordes, sidebar y muted.
- Medida de comparación: las referencias equivalen a una ventana de ~1200 px de ancho. Para compararlas, escalarlas a 1200 de ancho y capturar la app a 1200×805.

## Cómo se generaron

- Modelo: fal.ai `google/nano-banana-2.1/edit`, resolución 2K, `thinking_level: high`, relación 3:2 (9:16 la de celular).
- La 06 se generó con el logo (`public/logo-equipos-patagonicos.png`) como única imagen de entrada. Las demás recibieron el logo y la 06 como referencia de estilo, para que todas sean hermanas.
- Salida comprimida a PNG de 256 colores (PSNR ≈ 45–48 dB contra el original).
- El contenido de cada pantalla sale de `scratchpad/referencias-ui/prompts.md` (sesión del plan 3A), ampliado con datos realistas.

### Prompt de la 06 (define el estilo)

> Image 1 is the brand logo: reproduce it exactly. Screen: "Ficha de cliente" (client detail) of an internal admin web app for Equipos Patagónicos, a crane-rental company in Neuquén, Argentina. All UI text in Argentine Spanish. Desktop 1440×900, full-screen flat UI mockup. App shell: left sidebar with the logo and nav items Inicio, Cotizaciones, Presupuestos, Clientes (active), Configuración; user menu "UE" / "Usuario E2E". Content: breadcrumb, client header (name, CUIT, IVA, ubicación, status "Activo", secondary action "Desactivar"), a "Datos" editable form with "Guardar cambios", a "Contactos" section with "+ Agregar contacto" and 3 contacts with edit/delete. No quote history, no charts, no KPIs.
>
> Visual direction — PREMIUM SAAS / EDITORIAL (in the spirit of Linear, Attio, Stripe Dashboard): a quiet light sidebar that blends with the canvas, compact nav with the active item as a subtle tinted row. The client page opens with a soft cover band (royal-blue to indigo mesh gradient with a very faint crane-hook line pattern at low opacity) and a large rounded-square company avatar overlapping its bottom edge; name in a refined display sans at ~30px, meta as quiet dot-separated text, status as a small green dot + "Activo". Below, a two-column grid: "Datos" as a clean form and "Contactos" as elegant person cards with initial avatars. 12px radii, very soft shadows, precise alignment, airy whitespace, yellow used only as a tiny accent.

### Prefijo común del resto (01–05, 07, 07b)

> Image 1 is the brand logo: reproduce it exactly (yellow crane hook on blue + the words EQUIPOS PATAGÓNICOS in bold italic blue) at the top-left of the sidebar. Image 2 is the APPROVED design reference of this same product (its client detail page). Render a DIFFERENT screen of the same app in exactly the same visual language and app shell as image 2: quiet very light gray sidebar with the logo at the top, nav items Inicio, Cotizaciones, Presupuestos, Clientes, Configuración (exactly these five) with thin line icons and the active item as a subtle blue-tinted rounded row with blue text (not a filled pill), the user menu "UE · Usuario E2E" with a chevron at the bottom of the sidebar; a thin white top bar with the breadcrumb; Inter-like typography with refined display headings and muted gray secondary text; white surfaces, hairline borders, 12px radii, very soft shadows, royal-blue #3D47CC primary buttons, outline secondary buttons, green-dot status pills, airy but efficient spacing. Yellow #E6DC1F only as a tiny accent. The screen must feel like a sibling of image 2.
>
> Desktop web app 1440×900 for "Equipos Patagónicos", a crane-rental company in Neuquén, Argentina; internal admin & logistics tool; all UI text in Argentine Spanish; realistic data in pesos argentinos ($ 1.950.000,00); tabular numbers. No lorem ipsum, no stock photos, no 3D. Full-screen flat UI mockup, straight-on, no device frame, no floating developer badge.

### Parte específica de cada pantalla

**01 — Inicio.** Slim cover band with "Inicio", the date and the buttons "Subir documento" / "Nueva cotización". Five queue cards (3 + 2): "Seguimiento" (cotizaciones enviadas sin respuesta y por vencer: cliente, N°, días desde el envío, vencimiento en ámbar, teléfono del contacto, "Registrar respuesta"), "Falta OC" (presupuestos en curso sin OC, "Cargar OC"), "Para facturar" (remitos sin factura, período y equipo, "Facturar"), "Cobranzas" (total pendiente grande, facturas con saldo y antigüedad "30 d" / "45 d" / "60+ d", "Registrar pago"), "Actualización de tarifa" (presupuestos con ajuste ICTF en 30 días, "Actualizar").

**02 — Cotizaciones.** No band. Title with count; "Nueva cotización", "Cargar existente", "Presupuesto directo". Filters: search, Estado, Cliente, date range. Table: N°, Fecha, Cliente, Asunto, Formato, Importe, Estado (dot pills), Vence el, actions (PDF, duplicar, ⋯). Pagination.

**03 — Editor de cotización.** No band. Title with "Borrador"; "Guardar", "Descargar y marcar enviada", "Aprobar". Left: cards Cliente (cliente + "Atte."), Datos de esta cotización, Ítems (secciones Precios Jornada / Precios Jornada Adicional, unidad JORNADA/HORA/VIAJE), Textos (toolbar, reordenar, ocultar). Right: sticky "Vista previa" with a static A4 page; unfilled variables like "{{ubicacion}}" highlighted in yellow.

**04 — Detalle de presupuesto.** Cover band with a document tile, "Presupuesto N° 112711", "En curso", cliente · equipo; "Finalizar" / "Anular". Stat tiles OC, Remitos, Facturas, OP, Saldo a cobrar. Stacked cards Órdenes de compra, Remitos ("Sin facturar"), Facturas (Pendiente / Parcial / Cobrada), Órdenes de pago, each with "+ Agregar", thumbnails and ⋯.

**05 — Subir documento (celular).** Top bar with back arrow, title and logo. Numbered steps: Presupuesto (search + selectable list), Tipo (segmented Remito/OC/Factura/OP), Archivo ("Sacar foto", "Elegir archivo", page thumbnails, "+ página"), Datos opcionales (Número, Fecha). Upload progress and fixed "Guardar".

**07 — Configuración.** Slim cover band with "Configuración" and "Datos que usan las cotizaciones y sus PDF." 2×2 grid of clickable cards with a light-blue icon tile, title, description and chevron: Empresa, Firmantes, Equipos, Plantillas.

**08 — Login.** Prefix like the others but "No sidebar (the user is not logged in)". Split screen: left ~50% full-height brand panel with the gradient and the crane-hook pattern, the logo on a small white rounded plate at the top-left, a large white headline "Administración y logística", a white/80 subtitle "Cotizaciones, presupuestos y cobranzas de Equipos Patagónicos." and "Neuquén · Argentina" at the bottom. Right: white, centered narrow column with "Ingresar", "Usá tu email y contraseña de la empresa.", Email, Contraseña and one full-width "Ingresar" button. No forgot-password, sign-up, social login or remember-me. Elegida entre tres composiciones (dividida, tarjeta sobre la banda y panel con gancho grande).

**07b — Configuración › Equipos.** No band. Title, subtitle and "+ Nuevo equipo". A card listing cranes: icon tile, name, chips (capacidad, marca · modelo, patente), 2-line description, "Activo"/"Inactivo" pill, pencil button and "Desactivar"/"Activar"; inactive rows dimmed.

## Defectos conocidos de la generación

No copiarlos al implementar:

- 02: tilde junto al ítem activo del sidebar; "UE · Usuario E2E" con un punto que sobra (también en 07b).
- 03: el bloque de Textos repite el ícono de ocultar.
- 06: cada contacto repite los íconos de editar y borrar (van una sola vez, arriba a la derecha).
- 05: el porcentaje de subida sale en amarillo (usar texto común).

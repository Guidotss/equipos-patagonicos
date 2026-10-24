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

## Cómo se generaron (2026-10-24)

- Modelo: fal.ai `google/nano-banana-2.1/edit`, resolución 2K, `thinking_level: high`, relación 3:2 (9:16 la de celular).
- Entradas: el logo (`public/logo-equipos-patagonicos.png`) y una captura de la pantalla actual de Clientes, para mantener el sidebar, el logo y el encabezado existentes.
- Salida comprimida a PNG de 256 colores (PSNR ≈ 48 dB contra el original).
- Prompts de origen: `scratchpad/referencias-ui/prompts.md` de la sesión del plan 3A, ampliados con datos realistas.

### Prefijo común (todas menos la 05)

> Image 1 is the brand logo: reproduce it exactly (yellow crane hook on blue + the words EQUIPOS PATAGONICOS in bold italic blue) at the top-left of the sidebar. Image 2 is a screenshot of the CURRENT app: keep its app shell (white left sidebar with the logo, nav items Inicio, Cotizaciones, Presupuestos, Clientes, Configuración with thin line icons, active item as a filled royal-blue rounded pill with white text; thin top header bar with a round blue avatar 'UE' and 'Usuario E2E' at the right) but redesign the content area into a more polished, refined version. Do not draw any floating developer badge or round 'N' button in the bottom-left corner.
>
> Polished product UI screenshot of a desktop web app (1440×900) for "Equipos Patagónicos", a crane-rental company in Neuquén, Argentina. Internal admin & logistics tool, all UI text in Argentine Spanish. Brand: royal blue #3D47CC as primary, crane-hook yellow #E6DC1F as a small accent, neutral light gray surfaces, white cards. Clean, dense but calm, shadcn/ui-like components, 8px radius, subtle borders, Geist-like sans font, tabular numbers. Realistic data in pesos argentinos ($ 1.950.000,00). No lorem ipsum, no stock photos, no 3D. Full-screen flat UI mockup, straight-on, no device frame.

(La 06 se generó primero, como prueba, sin la frase del botón "N", y por eso lo muestra abajo a la izquierda: es el indicador de `next dev` y no forma parte del diseño.)

### Parte específica de cada pantalla

**01 — Inicio.** Screen: "Inicio" — work queues dashboard. Active nav item: Inicio. Header: title "Inicio" with a muted subtitle "Viernes 24 de octubre de 2026"; at the right a primary button "Nueva cotización" and an outline button "Subir documento" (upload icon). Five queue cards in a grid (3 cards on the first row, 2 wider cards on the second row). Each white card has a title, a count badge, 3–5 compact rows and a small action per row: "Seguimiento" (6): quotes sent without answer and about to expire — client, "N° 112711", "enviada hace 9 días", "vence en 2 días" in amber, contact phone with a phone icon, action "Registrar respuesta". "Falta OC" (3): presupuestos en curso sin orden de compra — number, client, amount, action "Cargar OC". "Para facturar" (4): remitos sin factura — "R 0001-00000456", period "01/10 – 15/10", equipo "XCMG 70 TN", amount, action "Facturar". "Cobranzas": big total "Pendiente $ 12.480.000,00"; invoices "FCE A 0003-00001245" with client and saldo, aging chips "30 d" gray, "45 d" amber, "60+ d" red; action "Registrar pago". "Actualización de tarifa" (2): presupuestos with ICTF adjustment in the next 30 days — client, presupuesto N°, "actualiza el 15/11/2026", action "Actualizar". Yellow accent used sparingly.

**02 — Cotizaciones.** Screen: "Cotizaciones" list. Header actions: primary "Nueva cotización", outline "Cargar existente", outline "Presupuesto directo". Filter bar: search "Buscar por N°, cliente o asunto", select "Estado" (Borrador, Enviada, Vencida, Aprobada, Rechazada), select "Cliente", date range. Table of ~10 rows: N°, Fecha, Cliente, Asunto, Formato (Mensual / Por jornada), Estado badges (Borrador gray, Enviada blue, Vencida amber, Aprobada green, Rechazada red), Vence el (amber when close), Acciones (ver PDF, duplicar, ⋯). Footer "Mostrando 1–10 de 48".

**03 — Editor de cotización.** Two columns. Breadcrumb "Cotizaciones / 112712", title "Cotización N° 112712" with gray "Borrador" badge; actions "Guardar", primary "Descargar y marcar enviada", "Aprobar". Left (~55%): section cards "Cliente" (client combobox + "Atte.: Yanina Colman"), "Datos de esta cotización" (Equipo, Ubicación, Horario, Plazo, Forma de pago, Próxima actualización), "Ítems" (Descripción, Cantidad, Precio, Unidad JORNADA/HORA/VIAJE, Total; sections "Precios Jornada" / "Precios Jornada Adicional"; drag handles; "+ Agregar ítem"), "Textos" (blocks with bold/bullet toolbar, up/down arrows, eye toggle). Right (~45%): sticky A4 PDF preview with the logo top-right, "Actualizar vista previa" button. Unfilled variables like "{{ubicacion}}" highlighted in yellow #E6DC1F.

**04 — Detalle de presupuesto.** Breadcrumb "Presupuestos / 112711". Header "Presupuesto N° 112711 · VERTICE SERVICIOS INTEGRALES S.R.L." with blue "En curso" badge; actions "Finalizar", destructive ghost "Anular". Indicator tiles "OC 1", "Remitos 3", "Facturas 2", "OP 1" and "Saldo a cobrar $ 4.330.000,00". Four stacked section cards (Órdenes de compra, Remitos with "sin facturar" tag, Facturas with Pendiente/Parcial/Cobrada, Órdenes de pago with the invoice it cancels), each with "+" button, rows with number, date, amount, file thumbnail and ⋯ menu.

**05 — Subir documento (celular).** Prefix adapted: image 2 only for visual language, mobile 390×844 without sidebar. Top bar with back arrow, logo and "Subir documento". Steps: 1 "Presupuesto" (search + selectable list, one selected with a blue ring), 2 "Tipo" (segmented Remito/OC/Factura/OP), 3 "Archivo" ("Sacar foto" primary, "Elegir archivo" outline, page thumbnails and dashed "+ página"), 4 "Datos (opcional)" (Número, Fecha). Upload progress "Subiendo 2 de 3 páginas · 67 %". Fixed full-width "Guardar".

**06 — Ficha de cliente.** Breadcrumb "Clientes / VERTICE SERVICIOS INTEGRALES S.R.L.". Header with large company name, muted line "CUIT 30-71952967-0 · Responsable Inscripto · Neuquén, Neuquén", green "Activo" badge; at the right primary "Nueva cotización" and outline "Desactivar". Left (~60%): card "Datos" with a 2-column form (Razón social, CUIT, Condición frente al IVA, Email, Teléfono, Dirección, Localidad, Provincia, Condición de pago habitual, Notas) and "Guardar cambios" at the bottom right. Right (~40%): card "Contactos" with "+ Agregar", rows with name, cargo, email and phone with icons, edit/delete ghost buttons. Below, full width: card with tabs "Cotizaciones 8" / "Presupuestos 3" and a compact table (N°, Fecha, Asunto, Formato, Estado, Total) with "Ver todas".

**07 — Configuración.** Title "Configuración" with subtitle "Datos que usan las cotizaciones y sus PDF." 2×2 grid of large clickable white cards with a blue-tinted icon tile, title, one-line description and a chevron: Empresa, Firmantes, Equipos, Plantillas.

**07b — Configuración › Equipos.** Breadcrumb "Configuración / Equipos", title "Equipos" with subtitle and primary "+ Nuevo equipo". A card with a list of cranes: blue-tinted icon tile, name, chips (capacidad, marca · modelo, patente), 2-line description, "Activo"/"Inactivo" badge, pencil button and "Desactivar"/"Activar" text button; inactive rows dimmed.

## Defectos conocidos de la generación

No copiarlos al implementar:

- 01: la etiqueta de antigüedad dice "Chip 45 d" (debería ser "45 d").
- 03: la vista previa del PDF muestra selects editables dentro de la hoja y "Ctandidad".
- 04: el sidebar repite "Presupuestos" (el segundo con el ícono de Clientes).
- 06: el botón "N" abajo a la izquierda es el indicador de `next dev`.

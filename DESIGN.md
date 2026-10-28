---
"name": "Equipos Patagónicos"
"description": "Interfaz clara con marca índigo, navegación lateral y hojas de formulario por tareas."
"colors":
  "primary": "oklch(0.478 0.202 272.6)"
  "primary-foreground": "oklch(0.985 0 0)"
  "background": "oklch(1 0 0)"
  "foreground": "oklch(0.249 0.008 240.2)"
  "muted": "oklch(0.97 0.006 264.5)"
  "muted-foreground": "oklch(0.544 0.035 265.1)"
  "accent": "oklch(0.95 0.021 271.2)"
  "border": "oklch(0.923 0.011 256.7)"
  "input": "oklch(0.86 0.008 250)"
  "destructive": "oklch(0.577 0.245 27.325)"
  "sidebar": "oklch(0.962 0.008 241.7)"
  "sidebar-accent": "oklch(0.917 0.031 271.7)"
  "sidebar-border": "oklch(0.886 0.006 239.8)"
  "brand-yellow": "oklch(0.875 0.181 106.2)"
  "portada-desde": "oklch(0.485 0.184 267.8)"
  "portada-hasta": "oklch(0.441 0.169 282.4)"
  "status-success-bg": "oklch(96.2% 0.044 156.743)"
  "status-success-text": "oklch(44.8% 0.119 151.328)"
  "status-info-bg": "oklch(93.2% 0.032 255.585)"
  "status-info-text": "oklch(42.4% 0.199 265.638)"
  "status-warning-bg": "oklch(96.2% 0.059 95.617)"
  "status-warning-text": "oklch(47.3% 0.137 46.201)"
  "status-danger-bg": "oklch(93.6% 0.032 17.717)"
  "status-danger-text": "oklch(44.4% 0.177 26.899)"
  "status-neutral-bg": "oklch(96.8% 0.007 247.896)"
  "status-neutral-text": "oklch(44.6% 0.043 257.281)"
"typography":
  "display":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "2.1875rem"
    "fontWeight": 400
    "lineHeight": 1.25
    "letterSpacing": "-0.025em"
  "headline":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "1.75rem"
    "fontWeight": 600
    "lineHeight": 1.25
    "letterSpacing": "-0.025em"
  "headline-section":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "2rem"
    "fontWeight": 600
    "lineHeight": 1.25
    "letterSpacing": "-0.025em"
  "headline-detail":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "1.5rem"
    "fontWeight": 600
    "lineHeight": "2rem"
    "letterSpacing": "-0.025em"
  "title":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "1rem"
    "fontWeight": 600
    "lineHeight": "1.5rem"
    "letterSpacing": "-0.025em"
  "body":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "1rem"
    "fontWeight": 400
    "lineHeight": "1.5rem"
  "body-small":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "0.875rem"
    "fontWeight": 400
    "lineHeight": "1.25rem"
  "label":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "0.875rem"
    "fontWeight": 500
    "lineHeight": 1
  "button":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "0.875rem"
    "fontWeight": 500
    "lineHeight": "1.25rem"
  "help":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "0.75rem"
    "fontWeight": 400
    "lineHeight": "1rem"
  "section-help":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "13px"
    "fontWeight": 400
    "lineHeight": "1.25rem"
  "navigation":
    "fontFamily": "Inter, sans-serif"
    "fontSize": "15px"
    "fontWeight": 400
    "lineHeight": "1.5"
"rounded":
  "sm": "6px"
  "md": "8px"
  "lg": "10px"
  "xl": "14px"
  "2xl": "18px"
  "full": "9999px"
"spacing":
  "1": "4px"
  "1.5": "6px"
  "2": "8px"
  "3": "12px"
  "4": "16px"
  "5": "20px"
  "6": "24px"
  "7": "28px"
  "8": "32px"
  "9": "36px"
"components":
  "button-primary":
    "backgroundColor": "{colors.primary}"
    "textColor": "{colors.primary-foreground}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "32px"
  "button-primary-hover":
    "backgroundColor": "color-mix(in oklab, var(--primary) 80%, transparent)"
  "button-outline":
    "backgroundColor": "{colors.background}"
    "textColor": "{colors.foreground}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "32px"
  "button-secondary":
    "backgroundColor": "{colors.muted}"
    "textColor": "{colors.foreground}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "32px"
  "button-ghost":
    "backgroundColor": "transparent"
    "textColor": "{colors.foreground}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "32px"
  "button-destructive":
    "backgroundColor": "color-mix(in oklab, var(--destructive) 10%, transparent)"
    "textColor": "{colors.destructive}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "32px"
  "button-link":
    "backgroundColor": "transparent"
    "textColor": "{colors.primary}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "32px"
  "button-form-primary":
    "backgroundColor": "{colors.primary}"
    "textColor": "{colors.primary-foreground}"
    "typography": "{typography.button}"
    "rounded": "{rounded.lg}"
    "padding": "4px 20px"
    "height": "40px"
  "input-form":
    "backgroundColor": "transparent"
    "textColor": "{colors.foreground}"
    "typography": "{typography.body-small}"
    "rounded": "{rounded.lg}"
    "padding": "4px 10px"
    "height": "40px"
    "width": "100%"
  "input-form-mobile":
    "typography": "{typography.body}"
    "height": "44px"
  "form-sheet":
    "backgroundColor": "{colors.background}"
    "textColor": "{colors.foreground}"
    "rounded": "{rounded.xl}"
    "width": "100%"
  "card-group":
    "backgroundColor": "{colors.background}"
    "textColor": "{colors.foreground}"
    "rounded": "{rounded.xl}"
    "padding": "24px"
  "nav-item":
    "textColor": "{colors.foreground}"
    "typography": "{typography.navigation}"
    "rounded": "{rounded.lg}"
    "padding": "8px 12px"
  "nav-item-active":
    "backgroundColor": "{colors.sidebar-accent}"
    "textColor": "{colors.primary}"
  "status-success":
    "backgroundColor": "{colors.status-success-bg}"
    "textColor": "{colors.status-success-text}"
    "rounded": "{rounded.md}"
    "padding": "0 8px"
    "height": "24px"
  "list-frame":
    "backgroundColor": "{colors.background}"
    "textColor": "{colors.foreground}"
    "rounded": "{rounded.xl}"
---

# Design System: Equipos Patagónicos

## Overview

**Creative North Star: "SaaS premium"**

La dirección visual confirmada mantiene la marca de Equipos Patagónicos, Inter y una paleta fría con índigo como acento de acción. El logo y la trama de ganchos son activos de identidad existentes. La navegación lateral clara, los bordes finos y el texto secundario gris sostienen una interfaz sobria, de densidad controlada.

Los formularios de negocio se organizan en una hoja continua, dividida por tareas. El propósito de cada sección acompaña a los campos cuando el contenedor tiene espacio y se apila cuando se estrecha. Las fichas y los encabezados de sección conservan su banda de marca; listas, altas y ediciones usan el encabezado que corresponde a su función.

**Key Characteristics:**

- Índigo para acciones principales, foco y navegación activa; amarillo como acento mínimo.
- Inter con jerarquías compactas y texto secundario de menor contraste.
- Una hoja plana para formularios; tarjetas con sombra suave donde el sistema existente las usa.
- Respuesta al ancho real del contenedor, con controles táctiles más altos en móvil.

Este documento registra el tema claro implementado. Los valores de color conservan el OKLCH de las fuentes; el frontmatter es la capa normativa. Los nombres de rol describen usos existentes, sin incorporar promesas de producto.

## Colors

El índigo nítido se apoya en superficies blancas y grises fríos; el color adicional comunica estados concretos.

### Primary

- **Índigo de acción** (`primary`): botones principales, enlaces, foco y texto de navegación activa. El fondo teñido de la fila activa usa `sidebar-accent`.
- **Blanco de acción** (`primary-foreground`): texto sobre el botón primario.
- **Azul de portada** (`portada-desde`) e **índigo de portada** (`portada-hasta`): extremos del degradé de las bandas y del panel de marca existente.

### Secondary

- **Amarillo de marca** (`brand-yellow`): acento mínimo ligado a la identidad y a variables pendientes en las vistas previas; no reemplaza el índigo de acción.
- **Rojo de error** (`destructive`): errores de campo y acciones destructivas. Las acciones destructivas usan un fondo teñido, no un bloque rojo sólido.
- **Estados semánticos** (`status-success-*`, `status-info-*`, `status-warning-*`, `status-danger-*`, `status-neutral-*`): pares de fondo tenue y texto más oscuro para las pastillas de éxito, información, aviso, peligro y estado neutro. Los nombres provienen del uso del componente de estado; sus valores corresponden a la escala Tailwind existente.

### Neutral

- **Blanco de superficie** (`background`): lienzo, hoja, tarjetas y barra de acciones.
- **Carbón frío** (`foreground`): texto principal y etiquetas en las hojas.
- **Gris frío suave** (`muted`): botones secundarios, hover y franjas de vista en vivo.
- **Gris de apoyo** (`muted-foreground`): descripciones, ayudas y metadatos.
- **Lavanda tenue** (`accent`): superficies pequeñas de apoyo e íconos en los componentes que ya las usan.
- **Borde de superficie** (`border`) y **borde de control** (`input`): el control tiene un contorno más marcado que el divisor de la hoja.
- **Gris lateral** (`sidebar`) y **borde lateral** (`sidebar-border`): separan la navegación del lienzo sin crear una columna de color dominante.

**The Brand Continuity Rule.** Conservar el logo, la trama de ganchos y la relación entre índigo, blanco y sidebar claro al extender la interfaz.

## Typography

**Display Font:** Inter, con fallback sans-serif.
**Body Font:** Inter, con fallback sans-serif.

**Character:** una sola familia mantiene la continuidad entre navegación, datos y edición. Los títulos ajustan ligeramente el espaciado entre letras; los campos y el texto de apoyo conservan una lectura directa.

### Hierarchy

- **Display** (`display`): títulos de páginas y listas sin banda; peso regular.
- **Headline** (`headline`): altas, edición y encabezados compactos; peso semibold. `headline-section` corresponde al título de las bandas principales en escritorio; `headline-detail`, a la ficha.
- **Title** (`title`): encabezados de sección dentro de la hoja, con peso semibold.
- **Body** (`body`): texto base y campos móviles. `body-small` mantiene la densidad de los controles y textos breves de escritorio; las descripciones del encabezado y las franjas de vista usan interlínea más abierta.
- **Label** (`label`): etiquetas de campo en la hoja; peso medio e interlínea compacta. `button` conserva el mismo tamaño y peso con la interlínea del botón, sin mayúsculas forzadas.
- **Help** (`help`, `section-help`): ayudas de campo y descripciones del propósito de sección.
- **Navigation** (`navigation`): filas del sidebar; el estado activo sube a peso medio.

## Layout

El shell de escritorio comienza en el breakpoint de ventana `md` (48rem). La columna lateral ocupa 15rem y permanece fija en el flujo mientras su contenido puede desplazarse. La barra de migas mide 3.5rem y se pega arriba en escritorio; en móvil la sustituye como elemento persistente la barra de navegación con menú lateral. Las migas largas pueden truncarse dentro del ancho disponible, conservando el texto completo en su título accesible.

El contenido general tiene un máximo de 90rem, con márgenes interiores de la escala `4` en móvil y `9` en escritorio. Las páginas de formulario habituales limitan su ancho a 72rem y dejan 7rem de espacio inferior para la barra fija. El editor comercial reserva una segunda columna para la vista previa desde 90rem de ventana (1440px); sus secciones compactas conservan el propósito encima de los campos. Por debajo, la vista previa sigue accesible desde las acciones: panel lateral desde `md` y PDF en otra pestaña en móvil.

La hoja es un contenedor de tamaño: al alcanzar 48rem de ancho propio, la sección no compacta forma una columna de propósito de 11rem y otra flexible para campos, con separación de la escala `7` y un divisor vertical. Por debajo de ese ancho, el propósito y el contenido se apilan. El relleno de sección pasa de la escala `4` a `6` en `sm` (40rem de ventana). La grilla de campos usa dos columnas desde 28rem del contenedor de campos; por debajo usa una. Campos largos y áreas de texto pueden ocupar ambas columnas.

Las separaciones comunes siguen la escala del frontmatter. La barra de acciones comunes está fija al borde inferior, respeta el área segura del dispositivo y se desplaza a la derecha del sidebar en escritorio. Alinea las acciones al final; en móvil los botones comparten el ancho disponible. El editor de cotizaciones mantiene su distribución específica de acciones y vista previa.

**The Form Sheet Rule.** Agrupar la edición de negocio en una hoja continua con divisores entre tareas; el encabezado de cada tarea explica su propósito y acompaña a sus campos.

## Elevation & Depth

Los formularios son planos: una superficie blanca, un borde exterior y divisores entre secciones. Las franjas de vista en vivo usan un tono suave dentro del contenido. Fuera de la hoja, las tarjetas existentes conservan la sombra tenue `tarjeta`; el recuadro de identidad superpuesto a la banda de ficha conserva una elevación mayor. La barra de migas combina transparencia y desenfoque cuando queda pegada arriba.

### Shadow Vocabulary

- **Tarjeta** (`tarjeta`, registrado en el sidecar): sombra suave de agrupaciones fuera de la hoja.
- **Identidad de ficha** (`detail-identity`, registrado en el sidecar): elevación del recuadro superpuesto a la banda; no se aplica a las secciones de formulario.
- **Foco de control** (`focus-ring`, registrado en el sidecar): anillo de foco, no elevación estructural.

**The Flat Form Rule.** La hoja de formulario se delimita con borde y divisores, sin sombra. Las tarjetas y los recuadros superpuestos de las fichas conservan su profundidad existente.

## Shapes

El token `lg` define la curva de los controles y de las filas de navegación. `xl` define la hoja y las tarjetas de agrupación. `2xl` aparece en el recuadro de identidad de ficha; `md`, en las pastillas de estado. El punto de estado y los avatares circulares usan `full`.

Los bordes son finos y continuos. La hoja no contiene una tarjeta elevada por cada tarea: sus secciones comparten el mismo contorno exterior y se separan mediante reglas. Las franjas de vista en vivo tienen una curva de control, un fondo tenue y texto de lectura común.

## Components

### Buttons

Botones compactos, de peso medio y curva `lg`. La acción principal usa índigo y texto claro; la alternativa de cancelar usa contorno. El hover primario reduce la opacidad del fondo a un 80%; el secundario y el ghost se tiñen con el neutro suave. Las variantes destructiva y enlace conservan sus usos existentes.

El botón base mantiene su densidad de escritorio; las acciones de formulario usan la variante de altura y relleno `button-form-primary`. Todos los botones establecen un mínimo táctil de 44px por debajo de `md`; los botones de ícono mantienen también ese mínimo de ancho. El foco visible usa borde índigo y anillo; el estado deshabilitado reduce la opacidad e impide la interacción. El estado activo tiene un desplazamiento vertical mínimo, salvo botones que abren un popup.

### Chips

Las pastillas de estado tienen fondo tenue, texto de color semántico y un punto del mismo color. El texto explica el estado; el punto lo acompaña. No tienen apariencia de botón ni requieren un borde para diferenciar sus tonos. La altura y la curva están registradas en `status-success`, representativo de la familia.

### Cards / Containers

La hoja (`form-sheet`) es la agrupación principal de formularios de negocio. Cada sección presenta título, descripción opcional, campos, acciones locales opcionales y una franja de vista en vivo cuando corresponde. En la hoja, el componente de agrupación heredado se traduce a una sección y omite su medallón de ícono.

Las tarjetas fuera de la hoja (`card-group`) conservan fondo blanco, borde, curva `xl` y sombra `tarjeta`; pueden mostrar el ícono y la franja de pie existentes. La banda con trama de ganchos sigue siendo la firma de las fichas y de los encabezados de sección que ya la usan.

### Inputs / Fields

Los campos de la hoja usan `input-form`: fondo transparente sobre blanco, borde de control y curva `lg`. `input-form-mobile` fija el mínimo táctil y el texto móvil. El input y el selector nativo comparten altura, borde y foco; las áreas de texto crecen según su contenido y conservan el mismo tratamiento visual.

Las etiquetas se colocan encima del control, con color principal y peso medio dentro de la hoja. El foco visible cambia el borde al color de foco y agrega un anillo de 3px con 50% de opacidad. Un error usa borde rojo y anillo rojo tenue, acompañado por un mensaje textual. Las ayudas aparecen debajo en el rol `help`. Los controles deshabilitados se distinguen por el tono y la opacidad; las vistas de solo lectura del editor mantienen su legibilidad existente.

### Navigation

El sidebar claro muestra íconos de línea y filas de navegación curvas. La fila activa usa fondo teñido y texto índigo, con peso medio; el hover de una fila inactiva usa ese mismo fondo a menor opacidad. El logo se mantiene arriba y el menú de usuario abajo. En móvil, la navegación se abre en un panel desde el borde izquierdo y reutiliza las mismas filas.

### Form Structure

`EncabezadoFormulario` usa el rol `headline`, una descripción de ancho acotado y acciones o estado cuando corresponde; admite títulos largos con corte de palabra para evitar desbordes. `HojaFormulario` y `SeccionFormulario` controlan la agrupación y la adaptación al contenedor. `AccionesFormulario` mantiene cancelar y guardar en una barra inferior común; mientras guarda, la acción principal muestra su estado pendiente. Las acciones de negocio específicas conservan su ubicación y comportamiento propio.

### Listados

El registro operativo usa un marco plano (`list-frame`): filtros, tabla y pie comparten borde y curva, sin sombra. La tabla desplaza sus resultados con el encabezado adherido; filtros y paginación quedan fuera del desplazamiento. Los filtros activos se reconocen y se pueden limpiar; el pie comunica rangos reales. Las columnas agrupan metadatos según cada contexto y, al estrecharse el contenedor, se convierten en filas apiladas con la misma prioridad de lectura.

La fila amplía el área de apertura, conserva enlaces reales para el teclado y no intercepta controles, acciones de menús o diálogos en portales, selección de texto ni clics modificados. Hover y foco dentro de la fila comparten un tinte suave. En Presupuestos, los conteos de documentos tienen etiquetas: la columna comparativa de escritorio admite `OC` y `OP` como abreviaturas con `title`; móvil y la presentación junto al cliente usan los nombres completos.

La grilla editable de ítems mantiene contorno y bordes de campo visibles. El precio es un input; el total es un `output` calculado, alineado a la derecha con cifras tabulares. Desde 44rem de ancho propio, los ítems forman una línea; por debajo se apilan con etiquetas visibles. Los filtros y campos de ítem conservan la altura de escritorio (40px) y el mínimo táctil móvil (44px), con los estados de foco, error y falta de precio existentes.

## Do's and Don'ts

### Do:

- **Do** conservar la marca, Inter y el shell claro al añadir pantallas.
- **Do** reutilizar el encabezado, la hoja, las secciones y la barra de acciones comunes para altas y ediciones de negocio.
- **Do** decidir el apilado de las secciones por el ancho del contenedor y mantener apilados los editores compactos.
- **Do** reservar espacio inferior para que las acciones fijas no tapen campos ni mensajes.
- **Do** mantener etiquetas visibles, ayudas y errores asociados a cada campo; conservar el texto de estado junto al punto de color.
- **Do** conservar la banda y las tarjetas de las fichas donde ya son parte de la identidad.

### Don't:

- **Don't** reintroducir una pila de tarjetas con sombra como agrupación principal de los formularios que usan la hoja.
- **Don't** trasladar la banda de portada a todos los encabezados: las listas y los formularios tienen una composición propia.
- **Don't** convertir el amarillo de marca en el color de la acción principal.
- **Don't** reducir los controles móviles por debajo del tamaño táctil establecido ni usar texto pequeño en sus campos.
- **Don't** sustituir los íconos de línea por caracteres de texto ni agregar medallones de íconos a las secciones de la hoja.

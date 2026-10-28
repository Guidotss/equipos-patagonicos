# Reemplazo de formularios Implementation Plan

> **For agentic workers:** Use executing-plans to implement this plan task-by-task in this session.

**Goal:** Reemplazar la composición fragmentada de formularios por una hoja de secciones clara y consistente.

**Architecture:** Componentes compartidos de encabezado, hoja, sección y barra de acciones. Se preservan las acciones, validaciones y estados de cada formulario. El contexto de la hoja permite reutilizar las tarjetas complejas del editor como secciones, sin duplicar su lógica.

**Tech Stack:** Next.js 16, React 19, Tailwind 4, shadcn/Radix, Playwright.

---

## 1. Patrón compartido
- [x] Crear `src/components/formulario/estructura-formulario.tsx` con `EncabezadoFormulario`, `HojaFormulario`, `SeccionFormulario` y `AccionesFormulario`. `HojaFormulario` provee un contexto booleano; `Tarjeta` lo consume y renderiza `SeccionFormulario` cuando corresponde. La barra recibe `volver`, `textoBoton`, `pendiente`, `soloLectura` y `detalle`, y conserva el envío del formulario contenedor.
- [x] Adaptar `src/components/formulario/tarjeta.tsx` para conservar su aspecto fuera de las hojas y usar la sección dentro de ellas.

## 2. Clientes y contactos
- [x] Dividir `campos-cliente.tsx` en Identificación, Contacto y domicilio, Gestión comercial; conservar ids, names y valores recuperados tras errores. Envolver en hoja desde `cliente-form.tsx` y colocar allí la barra de acciones. Retirar el contenedor anterior de la página de alta y usar el ancho completo para el formulario en la ficha.
- [x] Reemplazar la composición de `contacto-form.tsx`; conservar vista en vivo y confirmación de borrado y usar barra con regreso al cliente.

## 3. Configuración
- [x] Sustituir cabeceras de ficha por `EncabezadoFormulario` en Empresa, Equipos, Firmantes y Plantillas. Agrupar las secciones en una hoja, conservar sus vistas en vivo y botones de estado; reemplazar botones de guardado duplicados por una barra común.
- [x] Aplicar la hoja y acciones al editor completo de plantillas; conservar borradores de sección y eliminación.

## 4. Operación comercial
- [x] Aplicar la hoja a los formularios especiales y al editor de cotización. Mantener las acciones de estado, el PDF, atajos y control de concurrencia.
- [x] Aplicar la hoja al formulario de documentos, con encabezados por Presupuesto y tipo, Archivos, Datos y Vinculaciones. Mantener subida, compresión y aplicaciones de pagos.

## 5. Verificación y cierre
- [x] Ejecutar `npm run check` y las pruebas E2E de las áreas modificadas; las pruebas existentes verifican persistencia y validación y se conservan.
- [x] Capturar escritorio y móvil en una tanda, corregir los hallazgos materiales juntos y confirmar como máximo una vez.
- [x] Solicitar revisión independiente conforme a Impeccable, documentar resultado y guardar los cambios.

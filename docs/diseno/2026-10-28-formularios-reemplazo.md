# Formularios: reemplazo de estructura

Los formularios de negocio ahora comparten una hoja continua dividida por tarea. Cada sección presenta su propósito junto a los campos en escritorio ancho y encima de ellos en móvil. Las páginas de edición de configuración usan encabezados compactos; las acciones de guardar y cancelar se ubican en una barra persistente.

## Cobertura

Clientes separa Identificación, Contacto y domicilio, y Gestión comercial. Contactos, Empresa, Equipos, Firmantes y Plantillas conservan sus campos y vistas en vivo dentro del patrón común. Cotizaciones y documentos usan la misma hoja, manteniendo grillas, reordenamiento, vista previa, adjuntos y aplicaciones de pagos.

La [referencia 13](referencias/13-formularios-estructura.png) reemplaza las composiciones de formularios de las referencias 09, 10 y 12. Se conserva la identidad del shell y de las fichas generales. Los controles de la referencia que contradicen los datos reales se adaptaron: condición de pago continúa como texto libre.

## Verificación

- `npm run check`: ESLint, TypeScript y 479 pruebas unitarias aprobadas.
- 56 pruebas de navegador validadas. La primera tanda de 55 obtuvo 51 aprobadas y cuatro tiempos de espera durante navegaciones con compilación y capturas concurrentes. Esas cuatro pasaron secuencialmente sin modificar su código. Se agregó una prueba adicional de nombres largos en la navegación móvil: reproduce el desborde antes del arreglo y pasa después.
- Dos tandas de 60 capturas, con escritorio de 1200 × 805 y móvil de 390 × 844. La confirmación no detecta desbordes ni campos de texto pequeños en móvil. Un checkbox auxiliar de Radix, marcado `aria-hidden` y fuera del orden de foco, se excluye de la evaluación de nombres de controles accesibles.
- Revisión independiente: la composición coincide con el reemplazo solicitado. Su único hallazgo material fue el breadcrumb de contacto con razones sociales largas; la corrección quedó confirmada y la revisión cerró con disposición `ship`.
- Detector de diseño sobre los componentes modificados: sin hallazgos determinísticos. La revisión se realizó en Chromium; no equivale a una auditoría completa de accesibilidad ni a una prueba manual en Safari.

## Capturas finales

- [Cliente en escritorio](verificaciones/2026-10-28-formularios/cliente-escritorio.png).
- [Cliente en móvil](verificaciones/2026-10-28-formularios/cliente-movil.png).
- [Empresa en escritorio](verificaciones/2026-10-28-formularios/empresa-escritorio.png).
- [Contacto en móvil con razón social larga](verificaciones/2026-10-28-formularios/contacto-movil.png).

Las capturas de página completa muestran la barra fija en el borde del viewport inicial; el contenido continúa al desplazarse y cuenta con espacio inferior para acceder a sus últimos campos.

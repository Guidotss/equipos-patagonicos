# Archivos con nombres largos en móvil

Modo: Operate. Corrección puntual descubierta por la suite de Playwright. Se conserva `DESIGN.md`, su sidecar, componentes y composición vigentes.

## Dirección y límite

El usuario debe adjuntar un archivo con un nombre válido largo y enviar el remito sin que cambie el ancho del formulario ni se pierda el acceso a la acción fija. La miniatura, el estado y las acciones existentes conservan su apariencia; el nombre sigue disponible completo en su atributo title y su nombre accesible.

El ajuste se limita al tamaño mínimo de cada fila de adjunto en `UploadFiles`. No se reemplazan la hoja, la barra de acciones, los colores, la tipografía ni la lógica de subida. No se agregan recursos gráficos.

## Evidencia

La primera prueba con `isMobile: true` reprodujo el paso de 390 × 844 a 569 × 1232 después de adjuntar un PDF con UUID en el nombre. El contenido del formulario interceptaba el clic en «Enviar remito». Se conserva ese archivo como regresión.

La reproducción posterior precisó la causa: una fila medía 540,3125px dentro de una grilla de 324px; ventana y documento llegaban a 573px pese al ancho configurado de 390px. El tamaño mínimo intrínseco de la fila permitía el desborde. En `UploadFiles`, el commit `298b959` agrega únicamente `min-w-0` al `li` existente; el texto ya tenía truncado y tamaño mínimo cero. Se conservan el nombre completo en `title` y en el enlace accesible de previsualización.

## Verificación y cierre

Los dos escenarios de aceptación conservan el nombre largo y pasan con clic normal en «Enviar remito» (27,8s, dos workers). La medición corregida mantiene ventana, viewport visual y documento en 390px, y contenedor de adjuntos, lista y fila en 324px. La regresión controla el ancho y el envío sin clic forzado. Lint, comprobación de tipos y build pasan; el detector sobre el archivo modificado devolvió `[]` en `/tmp/playwright-upload-overflow-detector.json`. La suite completa pasó sus 89 pruebas en 3,3 minutos, sin fallos, intermitencias ni omisiones; también pasaron 616 pruebas unitarias y 20 históricas.

Se contrastaron `src/app/globals.css`, la carga de Inter, `UploadFiles`, los botones y contenedores con `DESIGN.md`, `.impeccable/design.json` y estas capturas locales no versionadas:

- `.impeccable/review/mobile-upload-long-name-mobile.png` (390 × 844).
- `.impeccable/review/mobile-upload-long-name-desktop.png` (1200 × 805).

Las capturas muestran el componente tras desplazar el formulario. La de 1200px verifica CSS adaptable en el mismo contexto `isMobile: true` redimensionado; no acredita un dispositivo de escritorio independiente. En móvil, el borde inferior del adjunto queda parcialmente detrás de la barra fija, con los controles relevantes visibles; la revisión no lo considera un defecto material de este ajuste.

Dictamen independiente: **SHIP**, limitado al desborde de `UploadFiles`. Persistencia verificada; fidelidad de tipografía, material y superficie mantenida; techo de revisión alcanzado; sin correcciones materiales pendientes. Se conservan elipsis, miniatura, estado, eliminación, nombre accesible completo y envío normal. El sistema global y sus archivos quedan intactos: no hay cambio de identidad ni aprobación visual general del MVP. La ausencia previa de `PRODUCT.md` queda fuera del alcance y no se repara.

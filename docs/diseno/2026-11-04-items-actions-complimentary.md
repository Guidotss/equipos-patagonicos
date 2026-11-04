# Ítems: eliminación y bonificación

Modo: Operate. Refinamiento del editor existente, sin reemplazar la identidad de `DESIGN.md`.

Referencia generada con imagegen el 2026-11-04: `referencias/18-items-actions-complimentary.png`. Fuentes visuales: capturas verificadas del editor de escritorio y móvil de 2026-10-28. El prompt solicitó mantener estructura, tokens, jerarquía, orden y densidad; agregar eliminación visible y checkbox Bonificada, sin decoración.

La grilla conserva descripción, cantidad, precio unitario, unidad y total. La acción de eliminar queda en el extremo derecho; cada fila móvil mantiene etiquetas y objetivo táctil de 44 px. El encabezado de sección conserva el nombre editable y agrega «Eliminar sección». El checkbox queda inmediatamente debajo del precio. En bonificadas el input deshabilitado muestra BONIFICADA y el total muestra 0,00. El pie mantiene agregar ítem/sección y total en PDF. Iconos del sistema vigente; borde suave, superficies blancas, jerarquía de texto existente y acento violeta.

La imagen es referencia de implementación; no se sirve como recurso del producto. Los textos legibles y valores deben respetar el contrato funcional aunque la generación tenga pequeñas diferencias de formato.

## Resultado verificado

Veredicto visual final: **SHIP**, dentro del techo de refinamiento Operate; sin bloqueantes. Se conserva el orden de columnas y encabezados del editor existente —Descripción, Cantidad, Precio unitario, Unidad, Total— aunque la referencia generada presente diferencias. La referencia orienta este cambio acotado; no reemplaza el contrato funcional ni el sistema canónico.

La eliminación de fila permanece visible, con icono Lucide y nombre accesible; en móvil su objetivo mide 44 px. Eliminar sección abre una confirmación que congela las claves de los ítems afectados antes de aplicar el borrador del nombre. El foco entra en Cancelar; Escape cancela y se restaura el foco. Bonificada es un checkbox nativo asociado a su etiqueta: deshabilita el precio, muestra BONIFICADA y calcula cero. En móvil las filas se reorganizan con etiquetas; en plantillas se conserva el estado sin introducir precios.

Se mantienen Inter y la jerarquía compacta, superficies blancas, neutros fríos, bordes suaves y acento índigo. Es una extensión del mundo vigente; no requiere cambios en `DESIGN.md` ni en `.impeccable/design.json`.

## Evidencia final

Capturas sintéticas del resultado, revisadas sobre el código integrado `99a360f`:

- [Editor a 1440 px](verificaciones/2026-11-04-forms-quotes/quote-controls-1440.png) y [editor a 390 px](verificaciones/2026-11-04-forms-quotes/quote-controls-390.png): eliminación visible, secciones, bonificación y reflujo.
- [Plantilla con ítem bonificado](verificaciones/2026-11-04-forms-quotes/template-complimentary.png): estado conservado en ítems precargados.
- [PDF mensual](verificaciones/2026-11-04-forms-quotes/pdf-monthly.png) y [PDF por jornada](verificaciones/2026-11-04-forms-quotes/pdf-daily.png): BONIFICADA se distingue de un precio normal igual a cero; el total conserva únicamente los importes cobrados.

Son capturas de regiones para inspección, no pantallas completas; en algunas se ocultó la barra fija solamente durante la captura. Los PNG de PDF son evidencia visual sintética, sin afirmar emisión ni publicación en producción.

## Comprobaciones y alcance

El cierre integrado informado por los ejecutores incluye 643 pruebas unitarias, 20 históricas y build; 432 integraciones; 5 casos finales de PDF canónico; y 101/101 E2E del recorrido completo. Las tres tareas recibieron aprobación de especificación y calidad; el código integrado fue aprobado. La preparación de fuentes se limita a los componentes LETTER canónicos mediante API pública y promesa compartida, con cobertura de Unicode, ligaduras, cuatro variantes y generación secuencial/paralela. Los stacks descartables fueron destruidos.

Este registro documenta el cierre visual y funcional local. La migración y el despliegue se registran por separado; no se afirma publicación en producción. No se canonizan artefactos de captura ni se abre un ciclo adicional de pulido.

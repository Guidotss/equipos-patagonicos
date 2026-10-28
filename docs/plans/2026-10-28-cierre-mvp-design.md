# Cierre del MVP de Equipos Patagónicos

Fecha: 2026-10-28. Alcance: continuar el diseño del 23/10 y los planes 3A, 3B y 4A, según la autorización de terminar las implementaciones pendientes. Se conserva la identidad visual existente.

## Resultado esperado

Una persona puede crear una cotización o cargar una existente, aprobarla, registrar OC, remitos, facturas y pagos, consultar su saldo y seguir los pendientes desde Inicio. También puede crear un presupuesto directo y reutilizar contenido mediante plantillas o la última cotización de un cliente.

## Arquitectura y decisiones

- Mantener Server Components para lecturas y Server Actions autenticadas para mutaciones. Todas las invariantes y operaciones con varias tablas permanecen en RPC transaccionales con RLS.
- Presupuestos usa `v_presupuestos`; documentos usa las RPC de 4A y `v_facturas`. Un documento puede vincular varios presupuestos del mismo cliente. Los saldos globales se calculan por factura para evitar duplicarlos.
- Archivos privados PDF/JPEG/PNG, hasta 10 MB, subida directa a Storage mediante token firmado, compresión de fotos en el navegador, previsualización y reintento. Anular/restaurar conserva archivos.
- Cotizaciones existentes requieren un PDF real en Storage, cliente, número y fecha; se cargan enviadas o aprobadas. Presupuestos directos requieren cliente y descripción del trabajo.
- Plantillas se guardan desde el editor con textos, bloques e ítems sin tarifas; su contenido puede editarse reutilizando el mismo editor. Se conserva el histórico de las cotizaciones.
- Notas y próxima actualización pueden cambiar en aprobadas mediante RPC específica sin modificar contenido comercial ni PDF. Duplicar permite otro cliente; basar en la última no crea un vínculo de renegociación.
- Inicio reúne seguimiento, falta OC, remitos por facturar, cobranzas y actualización de tarifas con enlaces accionables. Búsqueda global por cliente/CUIT, cotización y número de documento.
- Diseño: shell, tipografía, tokens y encabezados existentes; referencias 01, 04 y 05 de `docs/diseno/referencias`, con una referencia adicional generada para el cierre. Formularios accesibles, estados vacíos, errores y navegación móvil funcionales.
- El guardado devolverá id, número y versión en la misma transacción para eliminar la carrera entre RPC y SELECT.

## Operación y límites

Preparar build standalone, Docker, CI y scripts de backup/restauración documentados. No crear infraestructura remota ni contratar servicios. El lanzamiento necesita las credenciales de producción y el último número real; las pruebas locales no fijarán esa numeración.

## Validación

Unitarios para validación y colas; integración para RLS, versiones, plantillas y documentos; E2E para importar, presupuesto directo y circuito completo hasta saldo cero. Verificación visual a 1200×805 y móvil. Compilación de producción y ejecución del servidor compilado.

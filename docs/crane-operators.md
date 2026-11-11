# Gruistas y recepción de remitos

El rol técnico `crane_operator` se muestra como **Gruista**. Permite cargar y consultar los remitos propios. El gruista elige la grúa en cada envío. Funciona desde un celular o una computadora.

## Crear y administrar gruistas

Thomas, Administración y J. Rojas pueden abrir **Gruistas** desde el menú lateral con sus cuentas actuales. También puede ingresar un administrador.

1. Elegir **Nuevo gruista**.
2. Completar nombre, email y contraseña.
3. Crear la cuenta. Queda habilitada como **Gruista** y se abre su ficha.

La contraseña se usa únicamente para crear la cuenta; no se muestra en la ficha. Si el email ya existe, el alta conserva la cuenta y su contraseña anteriores. No se envía una invitación por correo.

El listado permite buscar por nombre o email y filtrar por acceso activo o inactivo. Incluye a quienes todavía no enviaron remitos. En la ficha se puede activar o desactivar el acceso. Este módulo solo administra gruistas; no cambia los permisos de las cuentas de personal.

## Consultar la actividad

Abrir **Gruistas → Ver actividad**. La ficha reúne todos los remitos enviados por esa persona, incluso los correspondientes a una grúa anterior, y los ordena por fecha de envío. Cada entrada distingue el envío de la fecha del servicio y muestra la grúa del trabajo, su descripción y el estado de vinculación. Desde allí se abre la revisión del remito y sus adjuntos.

Desactivar el acceso impide que la persona siga usando el portal y conserva su actividad para el personal administrativo.

## Cambiar el rol de una cuenta existente

1. Ingresar con un usuario administrador.
2. Abrir **Configuración → Usuarios**.
3. Elegir **Gruista** y habilitar el usuario.
4. Guardar. En su próximo acceso, la persona entra a **Mis remitos**.

Esta pantalla genérica continúa reservada a administradores. Las cuentas de personal gestionan los gruistas desde el módulo específico.

## Alta alternativa por consola

También está disponible el comando administrativo existente. Los nombres canónicos de las opciones están en inglés; `--nombre` y `--rol` siguen disponibles como alias.

```bash
node --env-file=.env.production.local scripts/create-user.mjs \
  --email persona@equipospatagonicos.com.ar \
  --password 'CONTRASEÑA' \
  --name 'Nombre y apellido' \
  --role crane_operator
```

La configuración de producción es privada y no se guarda en Git. El comando habilita la cuenta al configurar el perfil. La opción legada `--equipment-id` sigue disponible para invocaciones existentes. Si falla el proceso, elimina la cuenta recién creada; si esa limpieza también falla, informa el identificador que debe revisarse.

## Cargar un remito

1. En **Mis remitos**, elegir en **Grúas disponibles** la que se usó para el trabajo.
2. Informar la fecha del servicio y adjuntar uno o más archivos PDF, JPG o PNG mediante la cámara o el selector. Se admiten hasta 50 archivos de 10 MB cada uno. Las fotos se comprimen antes de subirlas.
3. Si hace falta, desplegar **Datos opcionales** y completar número, cliente o lugar, descripción y observaciones.
4. Enviar el remito. Queda **Pendiente de vincular** y se puede consultar en el historial con sus adjuntos.

El menú lista las grúas activas. Si el catálogo queda vacío, el historial sigue disponible. Informar un cliente o lugar no crea una ficha comercial.

## Revisar y vincular

El personal administrativo abre **Remitos → Pendientes**, revisa la grúa, autor, fecha, trabajo y adjuntos, y selecciona el presupuesto real al que corresponde. Puede elegir un presupuesto aprobado que no esté anulado, incluso finalizado o sin grúa en la cotización original.

La vinculación crea el remito dentro del presupuesto, conserva la grúa y el autor de la carga, y utiliza la fecha informada. No modifica la cotización aprobada. Si todavía no existe un presupuesto, la recepción permanece pendiente mientras se crea por el circuito habitual.

**Vinculados** reúne las recepciones ya procesadas. Reintentar un envío idéntico o su vinculación no duplica el remito.

## Permisos y verificación

Los roles `admin` y `operador` conservan la gestión comercial y pueden crear gruistas, gestionar su acceso, y consultar su actividad. Solo `admin` gestiona los roles y las cuentas de personal desde la configuración genérica. El gruista ve las grúas activas y sus propios remitos. La información comercial está reservada al personal.

El alta desde la aplicación requiere `SUPABASE_SECRET_KEY` en el servidor. Esa credencial es privada, no se publica en el navegador ni se guarda en Git. Si falla la finalización de un alta, el servidor elimina únicamente la cuenta recién creada. Si esa compensación falla, el mensaje informa el identificador pendiente para su revisión administrativa.

Los permisos se aplican en el servidor, las RPC, las políticas de base y Storage. Las pruebas de integración y navegador se ejecutan mediante `scripts/test-runner.mjs` con bases y archivos descartables; no crean datos de prueba en desarrollo o producción.

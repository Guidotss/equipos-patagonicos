-- supabase/migrations/20261024100100_datos_iniciales.sql
-- Datos reales de Equipos Patagónicos tomados de las cotizaciones 112523 (mensual) y 112711 (por jornada).

insert into public.empresa_config
  (razon_social, direccion, ciudad, provincia, telefono, email, web, indice_base, proxima_actualizacion)
values
  ('Equipos Patagónicos', 'T. Planas 5168', 'Neuquén', 'Neuquén', '0299 - 6019931',
   'equipos@equipospatagonicos.com.ar', 'www.equipospatagonicos.com.ar', 'junio 2026', 'noviembre de 2026');

insert into public.firmantes (nombre, cargo, telefono, email) values
  ('Julio Rojas', 'Contrataciones / Logística', '299-6019931', ''),
  ('Thomas Cravero', 'Contrataciones / Logística', '299 418 3985', 'tcravero@equipospatagonicos.com.ar');

insert into public.equipos (nombre, capacidad_tn, marca, modelo, descripcion) values
  ('Grúa telescópica XCMG 70 TN', 70, 'XCMG', '70 TN',
   'Grúa Telescópica marca XCMG modelo 70 TN, sobre camión con 60,5 m de pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.'),
  ('Grúa telescópica XCMG QY70K-1 40 TN', 40, 'XCMG', 'QY70K-1',
   'Grúa Telescópica marca XCMG modelo QY70K-1 de 40 TN, sobre camión con pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.');

insert into public.plantillas (nombre, formato, asunto, intro, bloques, items, validez_dias) values
(
  'Mensual - Grúa con operador',
  'mensual',
  '',
  '',
  $json$[
    {
      "titulo": "CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR",
      "contenido": "- El precio corresponde a una jornada de {{horario}}, grúa de {{capacidad}} TN con operador calificado para realizar servicios en {{ubicacion}}.\n- Contratación mensual / semanal / jornada.\n- Equipo ofrecido:\n  - {{equipo_descripcion}}\n- Las tarifas no contemplan personal de supervisión ni de eslingado.\n- El servicio contempla el equipo, elementos de izaje y mantenimiento preventivo para el equipo.\n- El estado del suelo tiene que encontrarse en buenas condiciones para que las grúas puedan desplazarse, como así también estar lo suficientemente compactado y nivelado para que estas unidades puedan maniobrar, posicionarse y estacionarse.\n- Las piezas deberán estar situadas bajo el gancho.\n- Elementos de izaje: se deberá enviar con 48 hs de anticipación al inicio del servicio un listado con el detalle de los elementos requeridos.\n- Unidades sujetas a disponibilidad.\n- Plazo de entrega: {{plazo_entrega}}.\n- Tarifas sin IVA.\n- Condiciones de pago: {{forma_pago}}."
    },
    {
      "titulo": "CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS",
      "contenido": "- **Coordinación operativa:** para coordinar el servicio comunicarse con la Coordinación Operativa con 72 hs de anticipación a los siguientes contactos: Tel. 299 601 9931; mail: equipos@equipospatagonicos.com.ar\n- **Documentación:** el Cliente deberá proveer un listado de la documentación requerida con 72 hs de anticipación al servicio al siguiente contacto: Tel. 299 418 3985; mail: tcravero@equipospatagonicos.com.ar\n- Los caminos de acceso y el acondicionamiento del lugar donde se realizará el servicio son responsabilidad del Cliente."
    },
    {
      "titulo": "RENEGOCIACIÓN DE TARIFAS",
      "contenido": "La presente cotización es válida por {{validez_dias}} días. El servicio tendrá una actualización con frecuencia cuatrimestral, manteniendo monitoreada de todas formas la evolución de los costos e índices.\nComo base de las tarifas se utilizará el índice de Costos de Transporte de Cargas FADEEAC (ICTF), con base en {{indice_base}}.\nLa próxima actualización se realizará en {{proxima_actualizacion}}."
    }
  ]$json$::jsonb,
  $json$[
    {"seccion": "", "descripcion": "Alquiler mensual Grúa {{capacidad}} TN", "unidad": "UNIDAD", "cantidad": 1},
    {"seccion": "", "descripcion": "Alquiler semanal Grúa {{capacidad}} TN", "unidad": "UNIDAD", "cantidad": 1},
    {"seccion": "", "descripcion": "Jornada (lunes a sábado)", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "", "descripcion": "Jornada adicional (feriado y domingo)", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "", "descripcion": "Hora adicional (lunes a viernes)", "unidad": "HORA", "cantidad": 1},
    {"seccion": "", "descripcion": "Hora adicional (feriado y domingo)", "unidad": "HORA", "cantidad": 1},
    {"seccion": "", "descripcion": "Servicio pick up – movilización gruista por jornada", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "", "descripcion": "Movilización", "unidad": "VIAJE", "cantidad": 1},
    {"seccion": "", "descripcion": "Desmovilización", "unidad": "VIAJE", "cantidad": 1}
  ]$json$::jsonb,
  30
),
(
  'Por jornada - Grúa con operador',
  'jornada',
  'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
  'Por medio del presente cotizamos el servicio de alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para prestar servicios de izajes en {{ubicacion}}.',
  $json$[
    {"titulo": "Equipo ofrecido", "contenido": "{{equipo_descripcion}}"},
    {
      "titulo": "Alcance",
      "contenido": "El servicio contempla el equipo, elementos de izajes, mantenimiento preventivo para el equipo y toda la documentación necesaria para realizar el trabajo.\nHorario de {{horario}}. Prestación mínima 8 hs.\nTiempo estimado de contratación: {{duracion_estimada}}."
    },
    {
      "titulo": "",
      "contenido": "**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.\nSaludos cordiales."
    }
  ]$json$::jsonb,
  $json$[
    {"seccion": "Precios Jornada", "descripcion": "Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)", "unidad": "JORNADA", "cantidad": 1},
    {"seccion": "Precios Jornada", "descripcion": "Movilización y desmovilización de Grúa Telescópica", "unidad": "VIAJE", "cantidad": 1},
    {"seccion": "Precios Jornada Adicional", "descripcion": "Jornadas diarias (8 hs) adicionales, domingos y feriados", "unidad": "JORNADA", "cantidad": 1}
  ]$json$::jsonb,
  30
);

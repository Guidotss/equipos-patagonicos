// Las cotizaciones reales 112523 (mensual) y 112711 (por jornada), como filas de la base.
// Se usan en los tests de documento y de PDF.
import type { SourceDocument } from './document'

const EMPRESA = {
  razon_social: 'Equipos Patagónicos',
  direccion: 'T. Planas 5168',
  ciudad: 'Neuquén',
  telefono: '0299 - 6019931',
  email: 'equipos@equipospatagonicos.com.ar',
  web: 'www.equipospatagonicos.com.ar',
  indice_base: 'junio 2026',
  proxima_actualizacion: 'noviembre de 2026',
}

export const EXAMPLE_MONTHLY: SourceDocument = {
  cotizacion: {
    numero: 112523,
    fecha: '2026-07-15',
    formato: 'mensual',
    asunto: '',
    intro: '',
    validez_dias: 30,
    mostrar_total: false,
    datos: {
      ubicacion: 'Sargento Vidal Ruta Nacional 151 km 41',
      horario: 'lunes a sábado de 8 a 18 hs',
      plazo_entrega: '24/07/2026',
      forma_pago: '30 – 45 – 60 días fecha factura',
    },
    bloques: [
      {
        titulo: 'CONDICIONES PARTICULARES DEL SERVICIO DE GRÚAS CON OPERADOR',
        contenido:
          '- El precio corresponde a una jornada de {{horario}}, grúa de {{capacidad}} TN con operador calificado para realizar servicios en {{ubicacion}}.\n- Contratación mensual / semanal / jornada.\n- Equipo ofrecido:\n  - {{equipo_descripcion}}\n- Tarifas sin IVA.\n- Plazo de entrega: {{plazo_entrega}}.\n- Condiciones de pago: {{forma_pago}}.',
      },
      {
        titulo: 'CONDICIONES PARA LA CONTRATACIÓN DE SERVICIOS',
        contenido:
          '- **Documentación:** el Cliente deberá proveer un listado de la documentación requerida con 72 hs de anticipación.',
      },
      {
        titulo: 'RENEGOCIACIÓN DE TARIFAS',
        contenido:
          'La presente cotización es válida por {{validez_dias}} días.\nComo base de las tarifas se utilizará el índice de Costos de Transporte de Cargas FADEEAC (ICTF), con base en {{indice_base}}.\nLa próxima actualización se realizará en {{proxima_actualizacion}}.',
      },
    ],
  },
  items: [
    { orden: 1, seccion: '', descripcion: 'Alquiler mensual Grúa {{capacidad}} TN', cantidad: 1, precio_unitario: 39_000_000, unidad: 'UNIDAD' },
    { orden: 2, seccion: '', descripcion: 'Alquiler semanal Grúa {{capacidad}} TN (24-07 al 30/07)', cantidad: 1, precio_unitario: 14_600_000, unidad: 'UNIDAD' },
    { orden: 3, seccion: '', descripcion: 'Jornada (lunes a sábado)', cantidad: 1, precio_unitario: 2_100_000, unidad: 'JORNADA' },
    { orden: 4, seccion: '', descripcion: 'Jornada adicional (feriado y domingo)', cantidad: 1, precio_unitario: 2_500_000, unidad: 'JORNADA' },
    { orden: 5, seccion: '', descripcion: 'Hora adicional (lunes a viernes)', cantidad: 1, precio_unitario: 260_000, unidad: 'HORA' },
    { orden: 6, seccion: '', descripcion: 'Hora adicional (feriado y domingo)', cantidad: 1, precio_unitario: 315_000, unidad: 'HORA' },
    { orden: 7, seccion: '', descripcion: 'Servicio pick up – movilización gruista por jornada', cantidad: 1, precio_unitario: 280_000, unidad: 'JORNADA' },
    { orden: 8, seccion: '', descripcion: 'Movilización', cantidad: 1, precio_unitario: 2_500_000, unidad: 'VIAJE' },
    { orden: 9, seccion: '', descripcion: 'Desmovilización', cantidad: 1, precio_unitario: 2_500_000, unidad: 'VIAJE' },
  ],
  cliente: { razon_social: 'Milicic S.A.', cuit: null },
  contacto: { nombre: 'Yanina Colman', email: 'yanina.colman@milicic.com.ar' },
  equipo: {
    capacidad_tn: 70,
    descripcion:
      'Grúa Telescópica marca XCMG modelo 70 TN, sobre camión con 60,5 m de pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.',
  },
  firmante: { nombre: 'Julio Rojas', cargo: 'Contrataciones / Logística', telefono: '299-6019931' },
  empresa: EMPRESA,
}

export const EXAMPLE_DAILY: SourceDocument = {
  cotizacion: {
    numero: 112711,
    fecha: '2026-10-22',
    formato: 'jornada',
    asunto: 'Cotización N° {{numero}} alquiler de 1 (una) Grúa Telescópica capacidad {{capacidad}} TN con operador.',
    intro:
      'Por medio del presente cotizamos el servicio de alquiler de 1 (una) Grúa Telescópica de {{capacidad}} TN para prestar servicios de izajes en {{ubicacion}}.',
    validez_dias: 30,
    mostrar_total: false,
    datos: {
      ubicacion: 'Ruta 7 y Ruta 5, Neuquén',
      horario: '08:30 hs a 17:30 hs',
      duracion_estimada: '1 jornada',
      forma_pago: 'a 30 - 45 días F.F.',
      disponibilidad: 'a confirmar según fecha de solicitud',
    },
    bloques: [
      { titulo: 'Equipo ofrecido', contenido: '{{equipo_descripcion}}' },
      {
        titulo: 'Alcance',
        contenido:
          'El servicio contempla el equipo, elementos de izajes, mantenimiento preventivo para el equipo y toda la documentación necesaria para realizar el trabajo.\nHorario de {{horario}}. Prestación mínima 8 hs.\nTiempo estimado de contratación: {{duracion_estimada}}.',
      },
      { titulo: '', contenido: '**Forma de pago:** {{forma_pago}}.\n**Disponibilidad:** {{disponibilidad}}.\nSaludos cordiales.' },
    ],
  },
  items: [
    { orden: 1, seccion: 'Precios Jornada', descripcion: 'Alquiler jornada de Grúa Telescópica de {{capacidad}} TN (lunes a sábado)', cantidad: 1, precio_unitario: 1_950_000, unidad: 'JORNADA' },
    { orden: 2, seccion: 'Precios Jornada', descripcion: 'Movilización y desmovilización de Grúa Telescópica', cantidad: 1, precio_unitario: 2_800_000, unidad: 'VIAJE' },
    { orden: 3, seccion: 'Precios Jornada Adicional', descripcion: 'Jornadas diarias (8 hs) adicionales, domingos y feriados', cantidad: 1, precio_unitario: 2_530_000, unidad: 'JORNADA' },
  ],
  cliente: { razon_social: 'VERTICE SERVICIOS INTEGRALES S.R.L.', cuit: '30719529670' },
  contacto: null,
  equipo: {
    capacidad_tn: 40,
    descripcion:
      'Grúa Telescópica marca XCMG modelo QY70K-1 de 40 TN, sobre camión con pluma telescópica, control computarizado, certificada por Normas OAA, en buen estado.',
  },
  firmante: { nombre: 'Thomas Cravero', cargo: 'Contrataciones / Logística', telefono: '' },
  empresa: EMPRESA,
}

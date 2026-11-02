/** Error de negocio cuyo mensaje se puede mostrar al usuario. */
export class CraneOperatorError extends Error {}

const businessMessages = new Set([
  'Solo un administrador puede gestionar usuarios',
  'Revisá el rol y el estado del usuario',
  'El usuario no existe',
  'Asigná una grúa activa para habilitar al gruista',
  'La grúa no existe o está inactiva',
  'Solo un gruista puede tener una grúa asignada',
  'Tu usuario no está habilitado',
  'No tenés permiso para acceder a la gestión comercial',
  'Tu usuario no está habilitado como gruista',
  'No tenés una grúa activa asignada',
  'Subí un PDF, JPG o PNG de hasta 10 MB',
  'Los datos del remito tienen que ser un objeto',
  'El remito contiene campos no permitidos',
  'Los campos del remito tienen que ser texto',
  'Ingresá una fecha válida',
  'El presupuesto no es válido',
  'Revisá el cliente, el trabajo realizado y los límites de texto',
  'Subí entre 1 y 50 archivos',
  'El archivo no es válido',
  'Revisá la ruta y el nombre original del archivo',
  'Un archivo aparece dos veces',
  'El remito recibido no existe',
  'El remito ya está vinculado a otro presupuesto',
  'Elegí un presupuesto aprobado que no esté anulado',
  'El identificador del remito no es válido',
  'El identificador ya se usó con otros datos',
  'El presupuesto no está disponible para tu grúa',
  'La carga no te pertenece, venció o ya se utilizó',
  'Subí el archivo con el tipo y el tamaño reservados',
  'El tamaño del archivo no coincide con la carga reservada',
])

/** No convierte mensajes internos de PostgreSQL ni de Storage en errores visibles. */
export function mapCraneOperatorRpcError(error: { code?: string; message: string }) {
  const isProtectedAdminError = error.code === 'P0001' && error.message === 'No podés desactivarte ni quitarte el rol de administrador'
  return isProtectedAdminError || (['22023', '42501', '23505'].includes(error.code ?? '') && businessMessages.has(error.message))
    ? new CraneOperatorError(error.message)
    : error
}

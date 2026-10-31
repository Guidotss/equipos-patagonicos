import { ErrorQuote } from './contracts'

type ErrorRpc = { code?: string; message: string }

/** Los errores de negocio de la base (P0001) llegan como ErrorCotizacion; el resto, tal cual. */
export function mapRpcError(error: ErrorRpc) {
  return error.code === 'P0001' ? new ErrorQuote(error.message) : error
}

/** Ejecuta una RPC que no devuelve nada y tira su error (ver errorDeRpc). */
export async function executeRpc(rpc: PromiseLike<{ error: ErrorRpc | null }>): Promise<void> {
  const { error } = await rpc
  if (error) throw mapRpcError(error)
}

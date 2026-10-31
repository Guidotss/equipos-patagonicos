let keysWithoutCrypto = 0

/** Clave estable de una fila o un bloque (para React y para arrastrar); no se guarda. */
export function newKey(): string {
  // crypto.randomUUID solo existe en un contexto seguro (HTTPS o localhost): el dev server abierto desde el celular
  // por la IP de la red no lo tiene. La clave no se guarda: alcanza con que no se repita en la página.
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  keysWithoutCrypto += 1
  return `clave-${keysWithoutCrypto}-${Math.random().toString(36).slice(2)}`
}

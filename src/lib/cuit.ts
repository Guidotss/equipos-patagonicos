const PESOS = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const
const PREFIJOS_VALIDOS = new Set(['20', '23', '24', '25', '26', '27', '30', '33', '34'])

export function normalizarCuit(entrada: string): string {
  return entrada.replace(/\D/g, '')
}

export function validarCuit(entrada: string): boolean {
  const cuit = normalizarCuit(entrada)
  if (cuit.length !== 11 || !PREFIJOS_VALIDOS.has(cuit.slice(0, 2))) return false

  const suma = PESOS.reduce((acc, peso, i) => acc + peso * Number(cuit[i]), 0)
  const resto = suma % 11
  if (resto === 1) return false
  const verificador = resto === 0 ? 0 : 11 - resto
  return verificador === Number(cuit[10])
}

/** "30-71952967-0". Si no tiene 11 dígitos devuelve la entrada sin cambios. */
export function formatCuit(entrada: string): string {
  const cuit = normalizarCuit(entrada)
  if (cuit.length !== 11) return entrada
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`
}

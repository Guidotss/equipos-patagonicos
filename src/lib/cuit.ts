/** Conserva el texto informado; solo quita separadores cuando la entrada es numérica. */
export function normalizeCuit(entrada: string): string {
  const texto = entrada.trim()
  return /^[\d\s.-]*$/.test(texto) ? texto.replace(/\D/g, '') : texto
}

/** "30-71952967-0". Si no tiene 11 dígitos devuelve la entrada sin cambios. */
export function formatCuit(entrada: string): string {
  const cuit = normalizeCuit(entrada)
  if (!/^\d{11}$/.test(cuit)) return entrada
  return `${cuit.slice(0, 2)}-${cuit.slice(2, 10)}-${cuit.slice(10)}`
}

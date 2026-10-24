/** Iniciales para avatares: "Yanina Colman" → "YC"; con maximo 1, "Milicic S.A." → "M". */
export function iniciales(nombre: string, maximo = 2): string {
  return nombre
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, maximo)
    .map((parte) => parte[0]?.toUpperCase())
    .join('')
}

/** Descarga sin navegar (el atributo download evita salir del editor): el nombre lo pone la ruta del PDF. */
export function downloadFile(url: string) {
  const link = document.createElement('a')
  link.href = url
  link.download = ''
  document.body.append(link)
  link.click()
  link.remove()
}

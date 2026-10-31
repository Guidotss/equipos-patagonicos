/** Descarga sin navegar (el atributo download evita salir del editor): el nombre lo pone la ruta del PDF. */
export function downloadFile(url: string) {
  const enlace = document.createElement('a')
  enlace.href = url
  enlace.download = ''
  document.body.append(enlace)
  enlace.click()
  enlace.remove()
}

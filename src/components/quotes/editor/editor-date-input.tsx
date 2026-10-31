import { Input } from '@/components/ui/input'
import { isDateIso, type Despachar } from '@/lib/quotes/editor-screen'
import { useState } from 'react'

/** Una fecha que se puede despachar: existe y su año tiene cuatro cifras (0202 es "2027" a medio escribir). */
function dateComplete(value: string): boolean {
  return isDateIso(value) && !value.startsWith('0')
}

type PropsInputDate = Omit<React.ComponentProps<'input'>, 'type' | 'value' | 'onChange' | 'onBlur'> & {
  value: string
  despachar: Despachar
}

/**
 * La fecha, con un borrador propio. Al tipear el año, Chrome pasa por 0002, 0020 y 0202: como esas fechas a medio
 * escribir no se despachan (el documento no se puede armar sin fecha), un input atado al estado volvería a la fecha
 * anterior en cada tecla y el año no se podría tipear. El input muestra el borrador; se despacha solo una fecha
 * completa y, al salir del campo, lo que no llegó a serlo vuelve a la fecha del estado.
 */
export function InputDate({ value, despachar, ...props }: PropsInputDate) {
  const [draft, setDraft] = useState({ de: value, texto: value })
  // Si la fecha cambia desde afuera (recargar, la fecha recién despachada), el borrador la sigue.
  if (draft.de !== value) setDraft({ de: value, texto: value })

  return (
    <Input
      {...props}
      type="date"
      value={draft.texto}
      onChange={(evento) => {
        const texto = evento.target.value
        setDraft({ de: value, texto })
        if (dateComplete(texto) && texto !== value) despachar({ tipo: 'campo', campo: 'fecha', value: texto })
      }}
      onBlur={() => {
        if (draft.texto !== value) setDraft({ de: value, texto: value })
      }}
    />
  )
}

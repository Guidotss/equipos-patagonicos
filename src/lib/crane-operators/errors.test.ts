import { describe, expect, it } from 'vitest'
import { CraneOperatorError, mapCraneOperatorRpcError } from './errors'

describe('errores de gruistas', () => {
  it.each([
    ['22023', 'La grúa no existe o está inactiva'],
    ['42501', 'El presupuesto no está disponible para tu grúa'],
    ['23505', 'El identificador ya se usó con otros datos'],
    ['P0001', 'No podés desactivarte ni quitarte el rol de administrador'],
  ])('permite mostrar el mensaje de negocio %s', (code, message) => {
    const error = mapCraneOperatorRpcError({ code, message })
    expect(error).toBeInstanceOf(CraneOperatorError)
    expect(error.message).toBe(message)
  })

  it.each([
    {
      code: '23505',
      message: 'duplicate key value violates unique constraint secret_index',
    },
    { code: '42501', message: 'permission denied for table internal_table' },
    { code: 'P0001', message: 'Error interno inesperado' },
    { code: 'XX000', message: 'La grúa no existe o está inactiva' },
    { message: 'Storage devolvió un error interno' },
  ])(
    'conserva el error inesperado para que la acción responda genéricamente',
    (error) => {
      expect(mapCraneOperatorRpcError(error)).toBe(error)
      expect(mapCraneOperatorRpcError(error)).not.toBeInstanceOf(
        CraneOperatorError,
      )
    },
  )
})

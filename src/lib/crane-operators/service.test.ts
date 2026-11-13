import { createClient } from '@supabase/supabase-js'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Database } from '@/lib/supabase/database.types'
import { CraneOperatorError, prepareCraneDeliveryNoteUpload } from './service'

const userId = '11111111-1111-4111-8111-111111111111'
const equipmentId = '33333333-3333-4333-8333-333333333333'
const uploadId = '22222222-2222-4222-8222-222222222222'
const path = `documentos/crane-operators/${userId}/${uploadId}.pdf`
const origin = 'https://supabase.example.test'

function sessionClient(fetch: typeof globalThis.fetch) {
  return createClient<Database>(origin, 'clave-publicable-ficticia', {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
    global: {
      fetch,
      headers: { Authorization: 'Bearer sesion-ficticia-del-usuario' },
    },
  })
}

afterEach(() => vi.restoreAllMocks())

describe('preparación de cargas del gruista', () => {
  it('reserva con la sesión y firma después sin habilitar reemplazos', async () => {
    const requests: Request[] = []
    const fetch = vi
      .spyOn(globalThis, 'fetch')
      .mockImplementation(async (input, init) => {
        const request = new Request(input, init)
        const url = new URL(request.url)
        requests.push(request)
        expect(url.origin).toBe(origin)
        expect(request.headers.get('authorization')).toBe(
          'Bearer sesion-ficticia-del-usuario',
        )
        expect(request.method).toBe('POST')
        if (
          requests.length === 1 &&
          url.pathname === '/rest/v1/rpc/create_crane_delivery_note_upload'
        ) {
          expect(await request.clone().json()).toEqual({
            p_equipment_id: equipmentId,
            p_mime: 'application/pdf',
            p_size: 100,
          })
          return Response.json([{ upload_id: uploadId, path }])
        }
        if (
          requests.length === 2 &&
          url.pathname === `/storage/v1/object/upload/sign/documentos/${path}`
        ) {
          expect(request.headers.get('x-upsert')).not.toBe('true')
          expect(await request.clone().json()).toEqual({})
          return Response.json({
            url: `/object/upload/sign/documentos/${path}?token=token-ficticio`,
          })
        }
        throw new Error(`Pedido inesperado: ${request.method} ${url.pathname}`)
      })
    const upload = await prepareCraneDeliveryNoteUpload(sessionClient(fetch), {
      equipmentId,
      mime: 'application/pdf',
      size: 100,
    })
    expect(requests).toHaveLength(2)
    expect(upload).toEqual({
      uploadId,
      path,
      token: 'token-ficticio',
      signedUrl: `${origin}/storage/v1/object/upload/sign/documentos/${path}?token=token-ficticio`,
    })
  })

  it('no firma una URL si la base rechaza la reserva', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      Response.json(
        {
          code: '42501',
          message: 'La grúa no existe o está inactiva',
        },
        { status: 403 },
      ),
    )
    await expect(
      prepareCraneDeliveryNoteUpload(sessionClient(fetch), {
        equipmentId,
        mime: 'application/pdf',
        size: 100,
      }),
    ).rejects.toBeInstanceOf(CraneOperatorError)
    expect(fetch).toHaveBeenCalledTimes(1)
  })
})

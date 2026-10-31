'use client'

import { useActionState } from 'react'
import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { iniciarSession, type StatusLogin } from './actions'

const statusInitial: StatusLogin = { error: null }

export function LoginForm({ next }: { next?: string }) {
  const [estado, accion, pending] = useActionState(iniciarSession, statusInitial)

  return (
    <form action={accion} className="space-y-5">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <div className="space-y-2">
        <Label htmlFor="email" className="text-[17px] font-normal">
          Email
        </Label>
        <Input id="email" name="email" type="email" autoComplete="email" required className="h-11 px-3 text-base shadow-xs md:text-base" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password" className="text-[17px] font-normal">
          Contraseña
        </Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 px-3 text-base shadow-xs md:text-base"
        />
      </div>
      {estado.error ? (
        <Alert variant="destructive">
          <AlertDescription>{estado.error}</AlertDescription>
        </Alert>
      ) : null}
      <Button
        type="submit"
        size="lg"
        className="mt-2 h-12 w-full text-base font-semibold shadow-lg shadow-primary/25"
        disabled={pending}
      >
        {pending ? 'Ingresando…' : 'Ingresar'}
      </Button>
    </form>
  )
}

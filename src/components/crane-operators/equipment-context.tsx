import { Alert, AlertDescription } from '@/components/ui/alert'
import { IconCrane } from '@/components/settings/icon-crane'
import type { CraneOperatorContext } from '@/lib/crane-operators/schemas'

export function EquipmentContext({ equipment }: Pick<CraneOperatorContext, 'equipment'>) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-4 border-b pb-5">
        <IconCrane className="size-9 shrink-0 text-muted-foreground" aria-hidden />
        <div className="min-w-0">
          <p className="text-sm text-muted-foreground">Grúa asignada</p>
          <p className="break-words text-lg font-medium">{equipment?.name ?? 'Sin grúa asignada'}</p>
        </div>
      </div>
      {!equipment?.active ? (
        <Alert><AlertDescription>
          {equipment ? 'Tu grúa asignada está inactiva.' : 'Todavía no tenés una grúa asignada.'} Pedile a administración que te asigne una grúa activa para cargar remitos. Podés consultar tu historial.
        </AlertDescription></Alert>
      ) : null}
    </div>
  )
}

-- Borra una cotización según sus vínculos y estado.
create or replace function public.borrar_cotizacion(p_id uuid) returns void language plpgsql security definer
set search_path = '' as $$
declare client_id uuid;
begin perform private.exigir_usuario_activo();
select cliente_id into client_id
from public.cotizaciones
where id = p_id;
if client_id is not null then perform private.lock_financial_client(client_id);
perform private.lock_financial_rows(client_id);
perform private.require_budget_without_finances(p_id);
end if;
delete from public.cotizaciones c
where c.id = p_id
  and (
    (
      c.origen = 'app'
      and c.estado = 'borrador'
      and not exists (
        select 1
        from public.cotizacion_envios e
        where e.cotizacion_id = c.id
      )
    )
    or (
      c.origen = 'importada'
      and c.estado <> 'aprobada'
    )
  );
if not found then if exists (
  select 1
  from public.cotizaciones
  where id = p_id
    and origen = 'importada'
) then raise exception 'Una cotización cargada aprobada no se puede borrar; primero revertí la aprobación' using errcode = 'P0001';
end if;
if exists (
  select 1
  from public.cotizaciones
  where id = p_id
    and estado = 'borrador'
) then raise exception 'Una cotización que ya se envió no se puede borrar; rechazala' using errcode = 'P0001';
end if;
raise exception 'Solo se pueden borrar cotizaciones en borrador' using errcode = 'P0001';
end if;
end;
$$;
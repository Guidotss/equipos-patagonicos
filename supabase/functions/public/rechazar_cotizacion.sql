-- Rechaza una cotización.
create or replace function public.rechazar_cotizacion(p_id uuid) returns void language plpgsql security definer
set search_path = '' as $$ begin perform private.exigir_usuario_activo();
update public.cotizaciones
set estado = 'rechazada'
where id = p_id
  and estado in ('borrador', 'enviada');
if not found then raise exception 'Solo se puede rechazar una cotización en borrador o enviada' using errcode = 'P0001';
end if;
end;
$$;
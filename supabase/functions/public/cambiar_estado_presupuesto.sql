-- Cambia el estado de un presupuesto.
create or replace function public.cambiar_estado_presupuesto(
    p_id uuid,
    p_estado text,
    p_motivo text default ''
  ) returns void language plpgsql security definer
set search_path = '' as $$ begin perform private.exigir_usuario_activo();
if p_estado is null
or p_estado not in ('en_curso', 'finalizado', 'anulado') then raise exception 'Estado de presupuesto inválido' using errcode = 'P0001';
end if;
if p_estado = 'anulado'
and coalesce(btrim(p_motivo), '') = '' then raise exception 'Indicá el motivo de la anulación' using errcode = 'P0001';
end if;
if char_length(coalesce(p_motivo, '')) > 2000 then raise exception 'El motivo puede tener hasta 2000 caracteres' using errcode = 'P0001';
end if;
-- El motivo es de la anulación: al finalizar o volver a en curso queda vacío.
update public.cotizaciones
set presupuesto_estado = p_estado,
  presupuesto_motivo = case
    when p_estado = 'anulado' then btrim(p_motivo)
    else ''
  end
where id = p_id
  and estado = 'aprobada';
if not found then raise exception 'El presupuesto no existe' using errcode = 'P0001';
end if;
end;
$$;
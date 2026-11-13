-- Filtra el listado de cotizaciones.
create function public.buscar_cotizaciones(
  texto text default '',
  estado text default '',
  cliente uuid default null,
  desde date default null,
  hasta date default null
) returns setof public.v_cotizaciones language sql stable security invoker
set search_path = '' as $$ with consulta as (
    select extensions.unaccent(
        lower(btrim(coalesce(buscar_cotizaciones.texto, '')))
      ) as normalizado
  ),
  patron as (
    select normalizado,
      case
        when normalizado ~ '^(n[°º.]?|nro\.?|#)?\s*\d+$' then regexp_replace(normalizado, '\D', '', 'g')
        else ''
      end as digitos,
      '%' || replace(
        replace(
          replace(
            normalizado,
            '\', ' \ \ '), ' %', ' \ %'), ' _ ', ' \ _ ') || ' %' as como
    from consulta
  )
  select v.*
  from public.v_cotizaciones v, patron p
  where (
      p.normalizado = ''
      or extensions.unaccent(lower(v.cliente_razon_social)) like p.como
      or extensions.unaccent(lower(v.asunto)) like p.como
      or extensions.unaccent(lower(coalesce(v.datos ->> ' ubicacion ', ''))) like p.como
      or exists (
        select 1 from public.equipos e
        where e.id = v.equipo_id and extensions.unaccent(lower(e.nombre)) like p.como
      )
      or (p.digitos <> '' and v.numero::text like p.digitos || ' %')
    )
    and case coalesce(buscar_cotizaciones.estado, '')
      when '' then true
      when ' enviada ' then v.estado = ' enviada ' and not v.vencida
      when ' vencida ' then v.vencida
      else v.estado = buscar_cotizaciones.estado
    end
    and (buscar_cotizaciones.cliente is null or v.cliente_id = buscar_cotizaciones.cliente)
    and (buscar_cotizaciones.desde is null or v.fecha >= buscar_cotizaciones.desde)
    and (buscar_cotizaciones.hasta is null or v.fecha <= buscar_cotizaciones.hasta)
  order by v.numero desc;
$$;
-- Busca registros en varios módulos.
create function public.buscar_global(
  texto text,
  p_grupo text default null,
  p_limite integer default 5,
  p_desde integer default 0
) returns table (
  grupo text,
  id uuid,
  numero text,
  cliente_razon_social text,
  descripcion text,
  href text,
  cantidad bigint
) language plpgsql stable security invoker
set search_path = '' as $$
declare normalizado text := extensions.unaccent(lower(btrim(coalesce(texto, ''))));
compacto text := regexp_replace(normalizado, '[^a-z0-9]', '', 'g');
digitos text := regexp_replace(normalizado, '[^0-9]', '', 'g');
patron text;
patron_compacto text;
begin if char_length(coalesce(texto, '')) > 200 then raise exception 'La búsqueda admite hasta 200 caracteres' using errcode = '22023';
end if;
if p_grupo is not null
and p_grupo not in (
  'clientes',
  'cotizaciones',
  'orden_compra',
  'remito',
  'factura',
  'orden_pago'
) then raise exception 'Grupo inválido' using errcode = '22023';
end if;
if normalizado = '' then return;
end if;
patron := '%' || replace(
  replace(
    replace(
      normalizado,
      '\', ' \ \ '), ' %', ' \ %'), ' _ ', ' \ _ ') || ' %';
  patron_compacto := ' %' || compacto || ' %';
  return query
    with coincidencias as (
      select ' clientes '::text as grupo, c.id, coalesce(c.cuit, '') as numero,
        c.razon_social as cliente_razon_social, c.localidad as descripcion, ' / clientes / ' || c.id as href
      from public.clientes c
      where (p_grupo is null or p_grupo = ' clientes ') and (
        extensions.unaccent(lower(c.razon_social)) like patron
        or (length(digitos) >= 3 and normalizado ~ ' ^ [0-9 .-] + $' and c.cuit like ' %' || digitos || ' %')
      )
      union all
      select ' cotizaciones ', c.id, c.numero::text, cl.razon_social, c.asunto, ' / cotizaciones / ' || c.id
      from public.cotizaciones c join public.clientes cl on cl.id = c.cliente_id
      where (p_grupo is null or p_grupo = ' cotizaciones ') and (
        c.numero::text like patron or extensions.unaccent(lower(cl.razon_social)) like patron
        or (length(digitos) >= 3 and normalizado ~ ' ^ [0-9 .-] + $' and cl.cuit like ' %' || digitos || ' %')
      )
      union all
      select d.tipo, d.id, d.numero, cl.razon_social,
        coalesce(d.tipo_comprobante || ' · ', '') || to_char(d.fecha, ' DD / MM / YYYY '), ' / documentos / ' || d.id
      from public.documentos d join public.clientes cl on cl.id = d.cliente_id
      where d.deleted_at is null and (p_grupo is null or p_grupo = d.tipo) and (
        extensions.unaccent(lower(d.numero)) like patron
        or (compacto <> '' and normalizado ~ ' ^ [a-z0-9 ./-] + $'
          and d.numero_normalizado like ' %' || ltrim(compacto, ' 0 ') || ' %' and ltrim(compacto, ' 0 ') <> '')
        or (compacto <> '' and normalizado ~ ' ^ [a-z0-9 ./-] + $'
          and regexp_replace(extensions.unaccent(lower(d.numero)), ' [^a-z0-9] ', '', ' g ') like patron_compacto)
        or extensions.unaccent(lower(cl.razon_social)) like patron
        or (length(digitos) >= 3 and normalizado ~ ' ^ [0-9 .-] + $' and cl.cuit like ' %' || digitos || ' %')
      )
    ), numeradas as (
      select c.*, count(*) over (partition by c.grupo) as cantidad,
        row_number() over (partition by c.grupo order by c.cliente_razon_social, c.numero, c.id) as posicion
      from coincidencias c
    )
    select n.grupo, n.id, n.numero, n.cliente_razon_social, n.descripcion, n.href, n.cantidad
    from numeradas n
    where n.posicion > greatest(coalesce(p_desde, 0), 0)
      and n.posicion <= greatest(coalesce(p_desde, 0), 0) + least(greatest(coalesce(p_limite, 5), 1), 50)
    order by n.grupo, n.posicion;
end;
$$;
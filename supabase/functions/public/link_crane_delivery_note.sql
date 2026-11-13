-- Vincula un remito de obra con un presupuesto.
create function public.link_crane_delivery_note(p_note_id uuid, p_budget_id uuid) returns uuid language plpgsql security definer
set search_path = '' as $$ begin perform private.exigir_usuario_activo();
return private.finalize_crane_delivery_note(p_note_id, p_budget_id, auth.uid());
end;
$$;
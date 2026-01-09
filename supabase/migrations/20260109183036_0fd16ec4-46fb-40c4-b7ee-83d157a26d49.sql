-- Expor apenas nomes de usuários internos do chat de uma seleção, com validação por código de acesso quando não houver login
create or replace function public.get_selecao_internal_user_names(
  p_selecao_id uuid,
  p_codigo_acesso text default null
)
returns table (
  usuario_id uuid,
  nome_completo text
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- Se não há usuário autenticado, exige código de acesso válido para esta seleção
  if auth.uid() is null then
    if p_codigo_acesso is null then
      raise exception 'unauthorized';
    end if;

    if not exists (
      select 1
      from public.selecao_propostas_fornecedor spf
      where spf.selecao_id = p_selecao_id
        and spf.codigo_acesso = p_codigo_acesso
    ) then
      raise exception 'unauthorized';
    end if;
  end if;

  return query
  select distinct ms.usuario_id, p.nome_completo
  from public.mensagens_selecao ms
  join public.profiles p on p.id = ms.usuario_id
  where ms.selecao_id = p_selecao_id
    and ms.tipo_usuario = 'interno'
    and ms.usuario_id is not null;
end;
$$;

-- Restringir execução a clientes (anon/autenticados)
revoke all on function public.get_selecao_internal_user_names(uuid, text) from public;
grant execute on function public.get_selecao_internal_user_names(uuid, text) to anon;
grant execute on function public.get_selecao_internal_user_names(uuid, text) to authenticated;

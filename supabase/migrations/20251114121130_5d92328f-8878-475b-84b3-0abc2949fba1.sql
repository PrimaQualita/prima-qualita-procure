-- Criar função para deletar análise de compliance
CREATE OR REPLACE FUNCTION public.delete_analise_compliance(p_cotacao_id uuid)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  DELETE FROM analises_compliance WHERE cotacao_id = p_cotacao_id;
$$;
-- Criar função security definer para verificar se fornecedor tem proposta na cotação
CREATE OR REPLACE FUNCTION public.fornecedor_has_proposta_cotacao(_user_id uuid, _cotacao_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN fornecedores f ON f.id = crf.fornecedor_id
    WHERE crf.cotacao_id = _cotacao_id
    AND f.user_id = _user_id
  )
$$;

-- Criar política usando a função security definer
CREATE POLICY "Fornecedores can view cotacoes where they have proposta"
ON cotacoes_precos
FOR SELECT
USING (public.fornecedor_has_proposta_cotacao(auth.uid(), id));
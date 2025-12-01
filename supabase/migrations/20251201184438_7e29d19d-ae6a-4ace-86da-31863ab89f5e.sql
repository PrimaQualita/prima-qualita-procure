-- Criar função security definer para verificar se fornecedor tem resposta na cotação
CREATE OR REPLACE FUNCTION public.fornecedor_has_resposta_cotacao(_user_id uuid, _cotacao_id uuid)
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

-- Criar política permitindo fornecedores verem itens de cotações onde enviaram proposta
CREATE POLICY "Fornecedores can view itens where they have resposta"
ON itens_cotacao
FOR SELECT
USING (public.fornecedor_has_resposta_cotacao(auth.uid(), cotacao_id));
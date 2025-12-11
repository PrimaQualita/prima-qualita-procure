-- Criar função SECURITY DEFINER para verificar se pode inserir resposta de item
-- Isso resolve o problema de políticas aninhadas para usuários anônimos

CREATE OR REPLACE FUNCTION public.pode_inserir_resposta_item(p_resposta_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = p_resposta_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
$$;

-- Dropar políticas antigas de INSERT em respostas_itens_fornecedor
DROP POLICY IF EXISTS "Fornecedor can insert own respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Anyone can insert respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;

-- Criar nova política usando a função SECURITY DEFINER
CREATE POLICY "Public can insert respostas itens for open cotacoes"
ON public.respostas_itens_fornecedor
FOR INSERT
WITH CHECK (
  public.pode_inserir_resposta_item(cotacao_resposta_fornecedor_id)
);
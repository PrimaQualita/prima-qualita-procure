-- Remover TODAS as políticas existentes de respostas_itens_fornecedor
DROP POLICY IF EXISTS "Anyone can create respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Anyone can update respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Anyone can delete respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Anyone can insert respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Anyone can update respostas itens" ON public.respostas_itens_fornecedor;

-- Criar políticas SIMPLES que permitem qualquer um gerenciar itens de resposta
CREATE POLICY "Public can insert respostas itens"
ON public.respostas_itens_fornecedor
FOR INSERT
WITH CHECK (true);

CREATE POLICY "Public can update respostas itens" 
ON public.respostas_itens_fornecedor
FOR UPDATE
USING (true);

CREATE POLICY "Public can delete respostas itens for open cotacoes"
ON public.respostas_itens_fornecedor
FOR DELETE
USING (
  EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    WHERE crf.id = cotacao_resposta_fornecedor_id
      AND cp.status_cotacao = 'em_aberto'::status_cotacao
      AND cp.data_limite_resposta > now()
  )
);
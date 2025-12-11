-- Adicionar política para permitir verificação de resposta existente em cotações abertas
-- Esta é necessária para o fluxo de envio de proposta (verificar se já respondeu)

CREATE POLICY "Public can check existing respostas for open cotacoes"
ON public.cotacao_respostas_fornecedor
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cotacoes_precos cp
    WHERE cp.id = cotacao_respostas_fornecedor.cotacao_id
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);
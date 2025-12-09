-- Adicionar política RLS para permitir que usuários públicos verifiquem se já responderam à cotação
-- Necessário para a página RespostaCotacao verificar duplicação antes de enviar proposta

CREATE POLICY "Public can check existing respostas" 
ON public.cotacao_respostas_fornecedor 
FOR SELECT 
USING (
  -- Permite verificar se existe resposta para uma cotação específica e fornecedor
  EXISTS (
    SELECT 1
    FROM cotacoes_precos
    WHERE cotacoes_precos.id = cotacao_respostas_fornecedor.cotacao_id
      AND cotacoes_precos.status_cotacao = 'em_aberto'
      AND cotacoes_precos.data_limite_resposta > now()
  )
);
-- Atualizar política para permitir visualização de lotes de cotações em aberto (mesmo com prazo expirado)
-- Isso permite que fornecedores vejam os lotes e recebam mensagem de prazo expirado

DROP POLICY IF EXISTS "Public can view lotes of open cotacoes" ON public.lotes_cotacao;

CREATE POLICY "Public can view lotes of open cotacoes" 
ON public.lotes_cotacao 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM cotacoes_precos
    WHERE cotacoes_precos.id = lotes_cotacao.cotacao_id 
    AND cotacoes_precos.status_cotacao = 'em_aberto'
  )
);
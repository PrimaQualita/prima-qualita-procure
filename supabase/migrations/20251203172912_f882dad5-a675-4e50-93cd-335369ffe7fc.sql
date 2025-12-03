-- Atualizar política para permitir visualização de itens de cotações em aberto (mesmo com prazo expirado)
-- Isso permite que fornecedores vejam os itens e recebam mensagem de prazo expirado

DROP POLICY IF EXISTS "Public can view itens of open cotacoes" ON public.itens_cotacao;

CREATE POLICY "Public can view itens of open cotacoes" 
ON public.itens_cotacao 
FOR SELECT 
USING (
  EXISTS (
    SELECT 1 FROM cotacoes_precos
    WHERE cotacoes_precos.id = itens_cotacao.cotacao_id 
    AND cotacoes_precos.status_cotacao = 'em_aberto'
  )
);
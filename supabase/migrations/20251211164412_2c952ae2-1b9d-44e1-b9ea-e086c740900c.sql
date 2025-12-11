
-- Permitir usuários públicos criarem propostas para seleções abertas
CREATE POLICY "Public can create propostas for open selecoes"
ON public.selecao_propostas_fornecedor
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM selecoes_fornecedores sf
    WHERE sf.id = selecao_id
    AND sf.status_selecao IN ('planejada', 'em_disputa')
  )
);

-- Permitir usuários públicos criarem respostas de itens para propostas abertas
CREATE POLICY "Public can create respostas itens for open selecoes"
ON public.selecao_respostas_itens_fornecedor
FOR INSERT
WITH CHECK (
  EXISTS (
    SELECT 1 FROM selecao_propostas_fornecedor spf
    JOIN selecoes_fornecedores sf ON sf.id = spf.selecao_id
    WHERE spf.id = proposta_id
    AND sf.status_selecao IN ('planejada', 'em_disputa')
  )
);

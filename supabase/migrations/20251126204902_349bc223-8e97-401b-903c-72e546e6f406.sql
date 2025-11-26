-- Permitir fornecedores atualizarem itens onde eles são o fornecedor em negociação
CREATE POLICY "Fornecedores can update itens em negociacao"
ON public.itens_abertos_lances
FOR UPDATE
USING (
  em_negociacao = true 
  AND fornecedor_negociacao_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  fornecedor_negociacao_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);
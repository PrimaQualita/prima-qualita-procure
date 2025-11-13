-- Permitir que fornecedores vejam cotações nas quais foram rejeitados
CREATE POLICY "Fornecedores can view cotacoes where they were rejected"
ON public.cotacoes_precos
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM fornecedores_rejeitados_cotacao fr
    JOIN fornecedores f ON f.id = fr.fornecedor_id
    WHERE fr.cotacao_id = cotacoes_precos.id
    AND f.user_id = auth.uid()
    AND fr.revertido = false
  )
);

-- Permitir que fornecedores vejam processos de compras relacionados às cotações em que foram rejeitados
CREATE POLICY "Fornecedores can view processos where they were rejected"
ON public.processos_compras
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM cotacoes_precos cp
    JOIN fornecedores_rejeitados_cotacao fr ON fr.cotacao_id = cp.id
    JOIN fornecedores f ON f.id = fr.fornecedor_id
    WHERE cp.processo_compra_id = processos_compras.id
    AND f.user_id = auth.uid()
    AND fr.revertido = false
  )
);
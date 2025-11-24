-- Permitir fornecedores visualizarem seleções onde foram convidados
CREATE POLICY "Fornecedores can view selecoes where invited"
ON public.selecoes_fornecedores
FOR SELECT
USING (
  EXISTS (
    SELECT 1 
    FROM selecao_fornecedor_convites sfc
    JOIN fornecedores f ON f.id = sfc.fornecedor_id
    WHERE sfc.selecao_id = selecoes_fornecedores.id
    AND f.user_id = auth.uid()
  )
);
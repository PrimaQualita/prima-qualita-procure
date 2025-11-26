-- Criar política para permitir que fornecedores participantes vejam todos os inabilitados de suas seleções
CREATE POLICY "Fornecedores podem ver todos inabilitados da selecao" 
ON public.fornecedores_inabilitados_selecao 
FOR SELECT 
USING (
  selecao_id IN (
    SELECT selecao_propostas_fornecedor.selecao_id 
    FROM selecao_propostas_fornecedor 
    INNER JOIN fornecedores ON fornecedores.id = selecao_propostas_fornecedor.fornecedor_id
    WHERE fornecedores.user_id = auth.uid()
  )
);
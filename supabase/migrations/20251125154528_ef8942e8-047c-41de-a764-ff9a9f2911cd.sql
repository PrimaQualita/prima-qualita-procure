-- Adicionar política para permitir que fornecedores com proposta válida possam inserir lances
-- Isso permite que fornecedores que acessaram via código de acesso também possam dar lances

CREATE POLICY "Public can create lances for open items" 
ON public.lances_fornecedores 
FOR INSERT 
WITH CHECK (
  -- Verificar se existe proposta deste fornecedor para esta seleção
  EXISTS (
    SELECT 1 
    FROM selecao_propostas_fornecedor spf
    WHERE spf.selecao_id = lances_fornecedores.selecao_id
    AND spf.fornecedor_id = lances_fornecedores.fornecedor_id
  )
  AND
  -- Verificar se o item está aberto para lances
  EXISTS (
    SELECT 1
    FROM itens_abertos_lances ial
    WHERE ial.selecao_id = lances_fornecedores.selecao_id
    AND ial.numero_item = lances_fornecedores.numero_item
    AND ial.aberto = true
  )
);

-- Também permitir visualização pública de lances para a sessão de disputa
CREATE POLICY "Public can view lances" 
ON public.lances_fornecedores 
FOR SELECT 
USING (true);
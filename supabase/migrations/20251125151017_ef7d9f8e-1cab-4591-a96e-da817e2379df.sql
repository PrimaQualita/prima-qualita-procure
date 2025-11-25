-- Adicionar política de UPDATE para fornecedores atualizarem seus próprios itens
CREATE POLICY "Fornecedores can update own itens"
ON public.selecao_respostas_itens_fornecedor
FOR UPDATE
USING (
  proposta_id IN (
    SELECT sp.id
    FROM selecao_propostas_fornecedor sp
    JOIN fornecedores f ON f.id = sp.fornecedor_id
    WHERE f.user_id = auth.uid()
  )
)
WITH CHECK (
  proposta_id IN (
    SELECT sp.id
    FROM selecao_propostas_fornecedor sp
    JOIN fornecedores f ON f.id = sp.fornecedor_id
    WHERE f.user_id = auth.uid()
  )
);

-- Adicionar política de UPDATE para usuários internos (gestores/colaboradores)
CREATE POLICY "Internal users can update proposta items"
ON public.selecao_respostas_itens_fornecedor
FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
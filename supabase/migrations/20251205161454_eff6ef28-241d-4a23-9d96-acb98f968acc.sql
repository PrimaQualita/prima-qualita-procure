-- Remover política antiga e criar nova com role correto
DROP POLICY IF EXISTS "Fornecedores podem atualizar status_recurso de suas rejeicoes" ON public.fornecedores_rejeitados_cotacao;

-- Criar política para fornecedores autenticados poderem atualizar suas próprias rejeições
CREATE POLICY "Fornecedores podem atualizar status_recurso de suas rejeicoes"
ON public.fornecedores_rejeitados_cotacao
FOR UPDATE
TO authenticated
USING (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
)
WITH CHECK (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);
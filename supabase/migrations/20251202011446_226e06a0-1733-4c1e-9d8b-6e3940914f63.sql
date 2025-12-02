-- Permitir fornecedores atualizarem apenas status_recurso de suas próprias rejeições
CREATE POLICY "Fornecedores podem atualizar status_recurso de suas rejeicoes"
ON public.fornecedores_rejeitados_cotacao
FOR UPDATE
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
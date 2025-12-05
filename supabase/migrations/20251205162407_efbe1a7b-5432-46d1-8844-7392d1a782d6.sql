-- Dropar a política antiga e criar uma PERMISSIVA
DROP POLICY IF EXISTS "Fornecedores podem atualizar status_recurso de suas rejeicoes" ON public.fornecedores_rejeitados_cotacao;

-- Criar política PERMISSIVA para fornecedores atualizarem suas rejeições
CREATE POLICY "Fornecedores podem atualizar status_recurso de suas rejeicoes"
ON public.fornecedores_rejeitados_cotacao
AS PERMISSIVE
FOR UPDATE
TO authenticated
USING (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()))
WITH CHECK (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()));
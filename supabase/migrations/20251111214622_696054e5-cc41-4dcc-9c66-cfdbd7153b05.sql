-- Adicionar política RLS para fornecedores visualizarem seus documentos solicitados
CREATE POLICY "Fornecedores can view their campos documentos"
ON campos_documentos_finalizacao
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = campos_documentos_finalizacao.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);
-- Permitir que fornecedores atualizem o status dos campos de documentos que pertencem a eles
CREATE POLICY "Fornecedores can update their campos documentos status"
ON campos_documentos_finalizacao
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = campos_documentos_finalizacao.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.id = campos_documentos_finalizacao.fornecedor_id
    AND fornecedores.user_id = auth.uid()
  )
);
-- Permitir que usuários internos (gestores/colaboradores) insiram documentos para fornecedores
-- Esta política é necessária para que gestores possam anexar Certificado e Relatório KPMG durante aprovação

CREATE POLICY "Internal users can insert fornecedor documents"
ON documentos_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
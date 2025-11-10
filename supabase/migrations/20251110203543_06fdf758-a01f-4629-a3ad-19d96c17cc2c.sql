-- Criar políticas de storage para fornecedores poderem fazer upload de documentos
-- Fornecedores podem fazer upload de seus próprios documentos
CREATE POLICY "Fornecedores podem fazer upload de documentos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] LIKE 'fornecedor_%'
);

-- Fornecedores podem visualizar seus próprios documentos
CREATE POLICY "Fornecedores podem ver seus documentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos'
  AND (storage.foldername(name))[1] LIKE 'fornecedor_%'
);

-- Usuários internos podem ver todos os documentos
CREATE POLICY "Usuários internos podem ver todos documentos fornecedores"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos'
  AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);
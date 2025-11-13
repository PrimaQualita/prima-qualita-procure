-- Permitir fornecedores autenticados fazer upload de recursos
CREATE POLICY "Fornecedores can upload recursos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'recursos'
);

-- Permitir fornecedores visualizar seus próprios recursos
CREATE POLICY "Fornecedores can view own recursos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos'
  AND (storage.foldername(name))[1] = 'recursos'
);

-- Permitir usuários internos visualizar todos os recursos
CREATE POLICY "Internal users can view recursos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos'
  AND (storage.foldername(name))[1] = 'recursos'
  AND EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);
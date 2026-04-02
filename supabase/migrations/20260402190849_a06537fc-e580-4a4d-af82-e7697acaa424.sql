-- Drop the overly broad policy and replace with a more restrictive one
DROP POLICY IF EXISTS "Fornecedores podem deletar seus documentos" ON storage.objects;

-- Only allow fornecedores to delete files in THEIR OWN folder (fornecedor_{their_id})
CREATE POLICY "Fornecedores podem deletar seus proprios documentos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] LIKE 'fornecedor_%'
  AND (storage.foldername(name))[1] = 'fornecedor_' || (
    SELECT id::text FROM fornecedores WHERE user_id = auth.uid() LIMIT 1
  )
);
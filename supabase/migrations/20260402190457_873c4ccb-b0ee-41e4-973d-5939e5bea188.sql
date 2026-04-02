-- Allow suppliers to delete their own documents from storage
CREATE POLICY "Fornecedores podem deletar seus documentos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] LIKE 'fornecedor_%'
  AND auth.uid() IN (SELECT user_id FROM fornecedores)
);

-- Allow public/anon to delete from propostas folder (for resubmission cleanup)
CREATE POLICY "Allow public to delete propostas"
ON storage.objects
FOR DELETE
TO public
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'propostas'
);
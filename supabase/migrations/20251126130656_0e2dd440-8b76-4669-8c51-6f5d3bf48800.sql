-- Permitir que fornecedores façam upload de PDFs assinados nas atas de seleção
CREATE POLICY "Fornecedores can upload signed atas"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'atas-selecao'
  AND auth.role() = 'authenticated'
);

-- Permitir que fornecedores atualizem (upsert) PDFs assinados
CREATE POLICY "Fornecedores can update signed atas"
ON storage.objects
FOR UPDATE
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'atas-selecao'
  AND auth.role() = 'authenticated'
)
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'atas-selecao'
  AND auth.role() = 'authenticated'
);
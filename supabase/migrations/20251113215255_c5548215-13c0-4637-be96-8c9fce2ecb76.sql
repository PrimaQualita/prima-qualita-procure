-- Criar política para permitir inserção no bucket processo-anexos
-- Permite que usuários anônimos façam upload de propostas durante o processo de resposta à cotação
CREATE POLICY "Allow public to upload propostas"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'processo-anexos' AND (storage.foldername(name))[1] = 'propostas');
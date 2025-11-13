-- Criar políticas para upload e visualização de encaminhamentos no bucket processo-anexos

-- Permitir usuários autenticados fazerem upload de encaminhamentos
CREATE POLICY "Usuários autenticados podem fazer upload de encaminhamentos"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'encaminhamentos'
);

-- Permitir usuários autenticados visualizarem encaminhamentos
CREATE POLICY "Usuários autenticados podem visualizar encaminhamentos"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'encaminhamentos'
);

-- Permitir responsáveis legais deletarem encaminhamentos
CREATE POLICY "Responsáveis legais podem deletar encaminhamentos"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'encaminhamentos'
  AND EXISTS (
    SELECT 1 FROM public.profiles
    WHERE profiles.id = auth.uid()
    AND profiles.responsavel_legal = true
  )
);
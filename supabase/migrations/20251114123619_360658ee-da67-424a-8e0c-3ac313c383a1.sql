-- Criar políticas RLS para o bucket processo-anexos permitir uploads de análises de compliance

-- Política para permitir usuários autenticados fazerem upload na pasta compliance
CREATE POLICY "Usuários autenticados podem fazer upload em compliance"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'compliance'
);

-- Política para permitir usuários autenticados lerem arquivos da pasta compliance
CREATE POLICY "Usuários autenticados podem ler arquivos de compliance"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'compliance'
);

-- Política para permitir usuários autenticados atualizarem arquivos na pasta compliance
CREATE POLICY "Usuários autenticados podem atualizar em compliance"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'compliance'
)
WITH CHECK (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'compliance'
);

-- Política para permitir usuários autenticados deletarem arquivos na pasta compliance
CREATE POLICY "Usuários autenticados podem deletar em compliance"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'processo-anexos' 
  AND (storage.foldername(name))[1] = 'compliance'
);
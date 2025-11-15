-- Permitir upload público de arquivos em processo-anexos
CREATE POLICY "Public can upload to processo-anexos"
ON storage.objects
FOR INSERT
TO public
WITH CHECK (bucket_id = 'processo-anexos');

-- Permitir leitura pública de arquivos em processo-anexos
CREATE POLICY "Public can read processo-anexos"
ON storage.objects
FOR SELECT
TO public
USING (bucket_id = 'processo-anexos');
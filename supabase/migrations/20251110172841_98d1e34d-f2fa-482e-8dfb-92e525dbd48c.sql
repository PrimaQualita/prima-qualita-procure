-- Criar bucket para anexos de processos de compras
INSERT INTO storage.buckets (id, name, public)
VALUES ('processo-anexos', 'processo-anexos', false)
ON CONFLICT (id) DO NOTHING;

-- Criar políticas de storage para anexos de processos
CREATE POLICY "Internal users can view processo anexos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'processo-anexos' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can upload processo anexos"
ON storage.objects
FOR INSERT
WITH CHECK (
  bucket_id = 'processo-anexos' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can delete processo anexos"
ON storage.objects
FOR DELETE
USING (
  bucket_id = 'processo-anexos' AND
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
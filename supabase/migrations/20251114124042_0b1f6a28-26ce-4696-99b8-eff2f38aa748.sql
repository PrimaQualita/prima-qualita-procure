-- Tornar o bucket processo-anexos público para permitir acesso às URLs públicas
UPDATE storage.buckets 
SET public = true 
WHERE id = 'processo-anexos';
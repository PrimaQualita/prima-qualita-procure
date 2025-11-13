-- Adicionar coluna compliance na tabela profiles
ALTER TABLE profiles
ADD COLUMN IF NOT EXISTS compliance BOOLEAN DEFAULT false;
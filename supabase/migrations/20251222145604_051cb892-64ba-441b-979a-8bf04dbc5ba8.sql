-- Adicionar coluna de cor de fundo para contratos de gestão
ALTER TABLE public.contratos_gestao 
ADD COLUMN cor_fundo TEXT DEFAULT NULL;
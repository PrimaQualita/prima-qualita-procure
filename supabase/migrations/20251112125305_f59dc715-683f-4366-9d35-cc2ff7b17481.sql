-- Adicionar campo responsavel_legal na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN responsavel_legal boolean DEFAULT false;
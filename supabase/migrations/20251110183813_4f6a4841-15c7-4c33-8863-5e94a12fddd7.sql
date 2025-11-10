-- Make nome_socio_administrador nullable since it's not part of the new signup flow
ALTER TABLE public.fornecedores 
ALTER COLUMN nome_socio_administrador DROP NOT NULL;
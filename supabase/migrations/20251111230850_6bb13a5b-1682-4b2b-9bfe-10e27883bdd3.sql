-- Adicionar coluna marca na tabela itens_cotacao
ALTER TABLE public.itens_cotacao 
ADD COLUMN marca text;

COMMENT ON COLUMN public.itens_cotacao.marca IS 'Marca do item - preenchido pelo fornecedor quando o tipo do processo for Material';
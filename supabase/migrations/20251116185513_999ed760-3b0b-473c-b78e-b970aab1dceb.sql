-- Adicionar coluna para armazenar os fornecedores incluídos na planilha consolidada
ALTER TABLE planilhas_consolidadas 
ADD COLUMN fornecedores_incluidos jsonb DEFAULT '[]'::jsonb;

COMMENT ON COLUMN planilhas_consolidadas.fornecedores_incluidos IS 'Array com CNPJs dos fornecedores incluídos nesta planilha consolidada';
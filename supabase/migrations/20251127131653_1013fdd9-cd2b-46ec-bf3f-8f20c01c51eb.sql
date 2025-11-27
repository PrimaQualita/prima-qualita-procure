-- Adicionar coluna percentual_desconto na tabela respostas_itens_fornecedor
-- Esta coluna é usada quando o critério de julgamento é "desconto"
ALTER TABLE respostas_itens_fornecedor 
ADD COLUMN IF NOT EXISTS percentual_desconto NUMERIC(10, 2) DEFAULT NULL;

COMMENT ON COLUMN respostas_itens_fornecedor.percentual_desconto IS 'Percentual de desconto ofertado quando critério de julgamento é desconto';
-- Adicionar campo email na tabela selecao_propostas_fornecedor
ALTER TABLE selecao_propostas_fornecedor 
ADD COLUMN email text;

-- Adicionar comentário explicativo
COMMENT ON COLUMN selecao_propostas_fornecedor.email IS 'Email de contato do fornecedor que participou da seleção';
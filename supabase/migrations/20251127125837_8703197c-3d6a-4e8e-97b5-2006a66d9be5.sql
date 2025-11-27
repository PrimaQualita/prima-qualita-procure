-- Remover constraint antiga que não permite "desconto"
ALTER TABLE cotacoes_precos DROP CONSTRAINT IF EXISTS cotacoes_precos_criterio_julgamento_check;

-- Adicionar nova constraint permitindo "desconto"
ALTER TABLE cotacoes_precos ADD CONSTRAINT cotacoes_precos_criterio_julgamento_check 
CHECK (criterio_julgamento IN ('global', 'por_item', 'por_lote', 'desconto'));
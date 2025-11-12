-- Adiciona coluna criterio_julgamento na tabela processos_compras
ALTER TABLE processos_compras 
ADD COLUMN criterio_julgamento TEXT NOT NULL DEFAULT 'global';

-- Adiciona comentário explicativo
COMMENT ON COLUMN processos_compras.criterio_julgamento IS 'Critério de julgamento do processo: global, por_item ou por_lote';

-- Atualiza cotações existentes para usar o critério do processo
UPDATE cotacoes_precos cp
SET criterio_julgamento = pc.criterio_julgamento
FROM processos_compras pc
WHERE cp.processo_compra_id = pc.id;
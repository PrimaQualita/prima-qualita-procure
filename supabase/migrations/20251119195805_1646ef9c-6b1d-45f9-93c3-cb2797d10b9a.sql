
-- PASSO 1: Deletar duplicatas mantendo apenas o snapshot mais recente de cada tipo de documento por fornecedor

DELETE FROM documentos_processo_finalizado
WHERE id NOT IN (
  SELECT DISTINCT ON (fornecedor_id, tipo_documento, cotacao_id) id
  FROM documentos_processo_finalizado
  ORDER BY fornecedor_id, tipo_documento, cotacao_id, data_snapshot DESC
);

-- PASSO 2: Criar índice único para prevenir duplicatas futuras
CREATE UNIQUE INDEX IF NOT EXISTS idx_documentos_processo_unico
ON documentos_processo_finalizado(fornecedor_id, tipo_documento, cotacao_id, data_snapshot DESC);

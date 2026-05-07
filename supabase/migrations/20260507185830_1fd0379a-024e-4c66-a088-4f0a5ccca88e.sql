-- Limpar duplicados em autorizacoes_processo (manter o mais antigo)
DELETE FROM autorizacoes_processo a
USING autorizacoes_processo b
WHERE a.cotacao_id = b.cotacao_id
  AND a.tipo_autorizacao = b.tipo_autorizacao
  AND a.created_at > b.created_at;

-- Limpar duplicados em homologacoes_selecao (manter o mais antigo) - preventivo
DELETE FROM homologacoes_selecao a
USING homologacoes_selecao b
WHERE a.selecao_id = b.selecao_id
  AND a.created_at > b.created_at;

-- Constraints únicas para evitar duplicação futura
ALTER TABLE autorizacoes_processo
  ADD CONSTRAINT autorizacoes_processo_cotacao_tipo_unique UNIQUE (cotacao_id, tipo_autorizacao);

ALTER TABLE homologacoes_selecao
  ADD CONSTRAINT homologacoes_selecao_selecao_unique UNIQUE (selecao_id);
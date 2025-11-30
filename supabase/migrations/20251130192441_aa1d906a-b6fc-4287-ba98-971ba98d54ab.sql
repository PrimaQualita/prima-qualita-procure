-- Reverter política criada sem autorização
DROP POLICY IF EXISTS "Internal users can create cotacao respostas" ON cotacao_respostas_fornecedor;
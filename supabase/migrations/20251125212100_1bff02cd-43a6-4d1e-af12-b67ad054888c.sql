
-- Adicionar campo para controlar se a sessão de lances foi finalizada
ALTER TABLE selecoes_fornecedores 
ADD COLUMN IF NOT EXISTS sessao_finalizada BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN selecoes_fornecedores.sessao_finalizada IS 'Indica se a sessão de lances foi finalizada, habilitando análise documental';

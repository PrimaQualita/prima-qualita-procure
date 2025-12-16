-- Adicionar campos para controle de timeout de recursos em compras diretas
ALTER TABLE fornecedores_rejeitados_cotacao 
ADD COLUMN IF NOT EXISTS data_manifestacao_intencao timestamp with time zone,
ADD COLUMN IF NOT EXISTS prazo_recurso_expirado boolean DEFAULT false;

-- Comentários
COMMENT ON COLUMN fornecedores_rejeitados_cotacao.data_manifestacao_intencao IS 'Data/hora em que fornecedor manifestou interesse em recorrer (tem 24h a partir daqui para enviar recurso)';
COMMENT ON COLUMN fornecedores_rejeitados_cotacao.prazo_recurso_expirado IS 'Se true, fornecedor perdeu prazo de 5 minutos para manifestar interesse';
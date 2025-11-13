-- Adicionar coluna compliance na tabela profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS compliance boolean DEFAULT false;

-- Adicionar coluna enviado_compliance na tabela cotacoes_precos
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS enviado_compliance boolean DEFAULT false;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS data_envio_compliance timestamp with time zone;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS respondido_compliance boolean DEFAULT false;
ALTER TABLE cotacoes_precos ADD COLUMN IF NOT EXISTS data_resposta_compliance timestamp with time zone;
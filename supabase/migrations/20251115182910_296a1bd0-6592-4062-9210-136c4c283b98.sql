-- Adicionar coluna para identificar quem gerou a proposta
ALTER TABLE cotacao_respostas_fornecedor
ADD COLUMN usuario_gerador_id UUID REFERENCES profiles(id);
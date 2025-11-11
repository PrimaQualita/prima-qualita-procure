-- Adicionar coluna para controlar envio para seleção de fornecedores
ALTER TABLE cotacoes_precos 
ADD COLUMN enviado_para_selecao BOOLEAN DEFAULT false;
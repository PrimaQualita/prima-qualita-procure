-- Adicionar colunas para rastrear lances por item e rodada
ALTER TABLE public.lances_fornecedores
ADD COLUMN IF NOT EXISTS numero_item integer;

ALTER TABLE public.lances_fornecedores
ADD COLUMN IF NOT EXISTS numero_rodada integer DEFAULT 1;

-- Criar índices para melhor performance nas consultas
CREATE INDEX IF NOT EXISTS idx_lances_selecao_item ON public.lances_fornecedores(selecao_id, numero_item);
CREATE INDEX IF NOT EXISTS idx_lances_selecao_fornecedor_item ON public.lances_fornecedores(selecao_id, fornecedor_id, numero_item);
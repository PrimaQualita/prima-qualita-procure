-- Adicionar coluna para persistir aprovação na análise documental
ALTER TABLE public.selecao_propostas_fornecedor 
ADD COLUMN IF NOT EXISTS aprovado_analise_documental boolean DEFAULT false;

-- Adicionar coluna para data da aprovação
ALTER TABLE public.selecao_propostas_fornecedor 
ADD COLUMN IF NOT EXISTS data_aprovacao_documental timestamp with time zone;
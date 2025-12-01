-- Adicionar campos para rejeição por item/lote na tabela fornecedores_rejeitados_cotacao
ALTER TABLE public.fornecedores_rejeitados_cotacao
ADD COLUMN IF NOT EXISTS itens_afetados integer[] DEFAULT '{}';

-- Adicionar campos para provimento parcial na tabela respostas_recursos
ALTER TABLE public.respostas_recursos
ADD COLUMN IF NOT EXISTS tipo_provimento text DEFAULT 'total',
ADD COLUMN IF NOT EXISTS itens_reabilitados integer[] DEFAULT '{}';

-- Comentários explicativos
COMMENT ON COLUMN public.fornecedores_rejeitados_cotacao.itens_afetados IS 'Array de números dos itens/lotes rejeitados. Vazio ou null significa todos os itens (rejeição global).';
COMMENT ON COLUMN public.respostas_recursos.tipo_provimento IS 'Tipo de provimento: total, parcial. Null ou total significa provimento completo.';
COMMENT ON COLUMN public.respostas_recursos.itens_reabilitados IS 'Array de números dos itens reabilitados em caso de provimento parcial.';
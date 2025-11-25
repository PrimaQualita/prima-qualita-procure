-- Adicionar colunas para negociação na tabela itens_abertos_lances
ALTER TABLE public.itens_abertos_lances
ADD COLUMN IF NOT EXISTS em_negociacao boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS fornecedor_negociacao_id uuid REFERENCES public.fornecedores(id);

-- Adicionar coluna para identificar tipo de lance (lance ou negociacao)
ALTER TABLE public.lances_fornecedores
ADD COLUMN IF NOT EXISTS tipo_lance text DEFAULT 'lance';
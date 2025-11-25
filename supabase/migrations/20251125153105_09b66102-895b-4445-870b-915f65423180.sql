-- Adicionar coluna numero_selecao na tabela selecoes_fornecedores
ALTER TABLE public.selecoes_fornecedores 
ADD COLUMN numero_selecao TEXT;

-- Criar índice para busca rápida por número
CREATE INDEX idx_selecoes_numero ON public.selecoes_fornecedores(numero_selecao);

-- Atualizar seleções existentes com numeração baseada na ordem de criação
WITH numbered_selecoes AS (
  SELECT 
    id,
    ROW_NUMBER() OVER (ORDER BY created_at ASC) as row_num,
    EXTRACT(YEAR FROM created_at)::integer as ano
  FROM public.selecoes_fornecedores
)
UPDATE public.selecoes_fornecedores sf
SET numero_selecao = LPAD(ns.row_num::text, 3, '0') || '/' || ns.ano
FROM numbered_selecoes ns
WHERE sf.id = ns.id;
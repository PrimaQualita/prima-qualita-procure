-- Adicionar coluna selecao_id para suportar encaminhamentos de seleção
ALTER TABLE public.encaminhamentos_contabilidade
ADD COLUMN selecao_id uuid REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE;

-- Tornar cotacao_id opcional (para permitir encaminhamentos apenas de seleção)
ALTER TABLE public.encaminhamentos_contabilidade
ALTER COLUMN cotacao_id DROP NOT NULL;

-- Adicionar índice para selecao_id
CREATE INDEX idx_encaminhamentos_contabilidade_selecao_id 
ON public.encaminhamentos_contabilidade(selecao_id);

-- Comentário explicativo
COMMENT ON COLUMN public.encaminhamentos_contabilidade.selecao_id IS 'ID da seleção de fornecedores (opcional, usado quando encaminhamento é de seleção)';
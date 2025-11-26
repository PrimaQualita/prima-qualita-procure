-- Adicionar coluna selecao_id para documentos de seleção de fornecedores
ALTER TABLE public.campos_documentos_finalizacao 
ADD COLUMN selecao_id UUID REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE;

-- Tornar cotacao_id nullable para permitir registros apenas de seleção
ALTER TABLE public.campos_documentos_finalizacao 
ALTER COLUMN cotacao_id DROP NOT NULL;

-- Adicionar constraint para garantir que pelo menos um dos dois seja preenchido
ALTER TABLE public.campos_documentos_finalizacao
ADD CONSTRAINT check_cotacao_ou_selecao CHECK (cotacao_id IS NOT NULL OR selecao_id IS NOT NULL);

-- Criar índice para busca por selecao_id
CREATE INDEX idx_campos_documentos_finalizacao_selecao_id 
ON public.campos_documentos_finalizacao(selecao_id);

-- Criar constraint única para evitar duplicação de ordem por seleção
CREATE UNIQUE INDEX campos_documentos_finalizacao_selecao_id_ordem_key 
ON public.campos_documentos_finalizacao(selecao_id, ordem) WHERE selecao_id IS NOT NULL;
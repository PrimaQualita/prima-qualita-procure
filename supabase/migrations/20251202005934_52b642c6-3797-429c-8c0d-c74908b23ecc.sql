-- Adicionar coluna de hash para deduplicação de arquivos
ALTER TABLE public.documentos_processo_finalizado 
ADD COLUMN IF NOT EXISTS hash_arquivo TEXT;

-- Criar índice para busca rápida por hash
CREATE INDEX IF NOT EXISTS idx_documentos_processo_finalizado_hash 
ON public.documentos_processo_finalizado(hash_arquivo);

-- Comentário explicativo
COMMENT ON COLUMN public.documentos_processo_finalizado.hash_arquivo IS 
'Hash MD5 do conteúdo do arquivo para deduplicação entre processos';
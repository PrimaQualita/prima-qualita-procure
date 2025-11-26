-- Adicionar coluna para URL original do PDF da ata (sem página de assinaturas)
ALTER TABLE public.atas_selecao 
ADD COLUMN IF NOT EXISTS url_arquivo_original text;

-- Copiar URLs atuais para a coluna original (sem query parameters)
UPDATE public.atas_selecao 
SET url_arquivo_original = split_part(url_arquivo, '?', 1)
WHERE url_arquivo_original IS NULL;
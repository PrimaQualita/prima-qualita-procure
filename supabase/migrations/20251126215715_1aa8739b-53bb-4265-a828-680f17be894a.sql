-- Adicionar colunas para armazenar URLs dos PDFs de recursos
ALTER TABLE public.recursos_inabilitacao_selecao
ADD COLUMN IF NOT EXISTS url_pdf_recurso text,
ADD COLUMN IF NOT EXISTS nome_arquivo_recurso text,
ADD COLUMN IF NOT EXISTS url_pdf_resposta text,
ADD COLUMN IF NOT EXISTS nome_arquivo_resposta text,
ADD COLUMN IF NOT EXISTS protocolo_resposta text;
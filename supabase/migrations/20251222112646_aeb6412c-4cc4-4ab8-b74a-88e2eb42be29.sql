-- Adicionar campos para armazenar a resposta com PDF e tipos de operação por fornecedor
ALTER TABLE public.encaminhamentos_contabilidade 
ADD COLUMN IF NOT EXISTS tipos_operacao_fornecedores jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS url_resposta_pdf text,
ADD COLUMN IF NOT EXISTS protocolo_resposta text,
ADD COLUMN IF NOT EXISTS storage_path_resposta text;
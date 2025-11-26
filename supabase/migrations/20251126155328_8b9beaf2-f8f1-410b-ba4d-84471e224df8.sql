-- Adicionar coluna para armazenar os responsáveis legais que assinaram
ALTER TABLE public.atas_assinaturas_fornecedor 
ADD COLUMN IF NOT EXISTS responsaveis_assinantes jsonb DEFAULT '[]'::jsonb;
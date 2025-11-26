-- Criar tabela para armazenar atas de seleção
CREATE TABLE public.atas_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  protocolo TEXT NOT NULL UNIQUE,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  usuario_gerador_id UUID REFERENCES auth.users(id),
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.atas_selecao ENABLE ROW LEVEL SECURITY;

-- Authenticated users can view atas
CREATE POLICY "Authenticated users can view atas"
ON public.atas_selecao
FOR SELECT
TO authenticated
USING (true);

-- Authenticated users can insert atas
CREATE POLICY "Authenticated users can insert atas"
ON public.atas_selecao
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Public can verify atas by protocolo (for verification page)
CREATE POLICY "Public can verify atas by protocolo"
ON public.atas_selecao
FOR SELECT
TO anon
USING (true);
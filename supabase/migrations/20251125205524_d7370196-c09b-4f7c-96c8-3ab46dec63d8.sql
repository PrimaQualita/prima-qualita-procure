-- Criar tabela para armazenar planilhas de lances de seleção
CREATE TABLE IF NOT EXISTS public.planilhas_lances_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_geracao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  usuario_gerador_id UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE public.planilhas_lances_selecao ENABLE ROW LEVEL SECURITY;

-- Política para usuários autenticados visualizarem planilhas
CREATE POLICY "Authenticated users can view planilhas lances"
ON public.planilhas_lances_selecao
FOR SELECT
TO authenticated
USING (true);

-- Política para usuários autenticados criarem planilhas
CREATE POLICY "Authenticated users can create planilhas lances"
ON public.planilhas_lances_selecao
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Política para usuários autenticados deletarem planilhas
CREATE POLICY "Authenticated users can delete planilhas lances"
ON public.planilhas_lances_selecao
FOR DELETE
TO authenticated
USING (true);
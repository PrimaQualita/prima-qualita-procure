-- Adicionar colunas para controle de habilitação encerrada na tabela selecoes_fornecedores
ALTER TABLE public.selecoes_fornecedores 
ADD COLUMN IF NOT EXISTS habilitacao_encerrada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_encerramento_habilitacao timestamp with time zone,
ADD COLUMN IF NOT EXISTS usuario_encerrou_habilitacao_id uuid REFERENCES public.profiles(id);

-- Criar tabela para intenções de recurso (5 minutos após encerramento)
CREATE TABLE IF NOT EXISTS public.intencoes_recurso_selecao (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id uuid NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  fornecedor_id uuid NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  deseja_recorrer boolean NOT NULL DEFAULT false,
  motivo_intencao text,
  data_intencao timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(selecao_id, fornecedor_id)
);

-- Enable RLS
ALTER TABLE public.intencoes_recurso_selecao ENABLE ROW LEVEL SECURITY;

-- Policies para intencoes_recurso_selecao
CREATE POLICY "Internal users can manage intencoes_recurso"
ON public.intencoes_recurso_selecao
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

CREATE POLICY "Fornecedores can insert own intencao"
ON public.intencoes_recurso_selecao
FOR INSERT
WITH CHECK (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()));

CREATE POLICY "Fornecedores can view own intencao"
ON public.intencoes_recurso_selecao
FOR SELECT
USING (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()));

CREATE POLICY "Fornecedores can update own intencao"
ON public.intencoes_recurso_selecao
FOR UPDATE
USING (fornecedor_id IN (SELECT id FROM fornecedores WHERE user_id = auth.uid()));

-- Adicionar coluna para provimento parcial nos recursos
ALTER TABLE public.recursos_inabilitacao_selecao
ADD COLUMN IF NOT EXISTS tipo_provimento text DEFAULT 'total',
ADD COLUMN IF NOT EXISTS itens_reabilitados integer[] DEFAULT '{}';

-- Enable realtime para intencoes
ALTER PUBLICATION supabase_realtime ADD TABLE public.intencoes_recurso_selecao;
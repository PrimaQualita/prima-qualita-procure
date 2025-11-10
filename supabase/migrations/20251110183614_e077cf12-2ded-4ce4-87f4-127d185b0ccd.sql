-- Add approval fields to fornecedores table
ALTER TABLE public.fornecedores 
ADD COLUMN IF NOT EXISTS status_aprovacao TEXT DEFAULT 'pendente' CHECK (status_aprovacao IN ('pendente', 'aprovado', 'reprovado')),
ADD COLUMN IF NOT EXISTS data_aprovacao TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS gestor_aprovador_id UUID REFERENCES profiles(id),
ADD COLUMN IF NOT EXISTS observacoes_gestor TEXT;

-- Add documento types for gestor
-- The documentos_fornecedor table will be used for both fornecedor and gestor documents

-- Create index for better query performance
CREATE INDEX IF NOT EXISTS idx_fornecedores_status_aprovacao ON public.fornecedores(status_aprovacao);

-- Update RLS policies to allow public signup
CREATE POLICY "Anyone can create fornecedor account"
ON public.fornecedores
FOR INSERT
WITH CHECK (true);
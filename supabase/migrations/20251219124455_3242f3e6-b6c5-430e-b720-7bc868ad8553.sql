-- Adicionar campos gerente_contratos e gerente_financeiro na tabela profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS gerente_contratos boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS gerente_financeiro boolean DEFAULT false;

-- Criar tabela de relacionamento entre gerentes e contratos de gestão
CREATE TABLE IF NOT EXISTS public.gerentes_contratos_gestao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contrato_gestao_id uuid NOT NULL REFERENCES public.contratos_gestao(id) ON DELETE CASCADE,
  created_at timestamp with time zone DEFAULT now(),
  UNIQUE(usuario_id, contrato_gestao_id)
);

-- Habilitar RLS
ALTER TABLE public.gerentes_contratos_gestao ENABLE ROW LEVEL SECURITY;

-- Política para usuários internos gerenciarem
CREATE POLICY "Internal users can manage gerentes_contratos_gestao"
ON public.gerentes_contratos_gestao
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

-- Política para usuários verem seus próprios contratos
CREATE POLICY "Users can view own gerentes_contratos"
ON public.gerentes_contratos_gestao
FOR SELECT
USING (usuario_id = auth.uid());
-- Adicionar colunas faltantes na tabela profiles
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS compliance boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS gestor boolean DEFAULT false;

-- Criar tabela para análises de compliance
CREATE TABLE IF NOT EXISTS public.analises_compliance (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id uuid NOT NULL REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE,
  processo_numero text NOT NULL,
  objeto_descricao text NOT NULL,
  criterio_julgamento text NOT NULL,
  
  -- Dados das empresas (JSONB para armazenar múltiplas empresas)
  empresas jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Considerações finais e conclusão
  consideracoes_finais text,
  conclusao text,
  
  -- Status da análise
  status_aprovacao text CHECK (status_aprovacao IN ('aprovado', 'reprovado', 'pendente')) DEFAULT 'pendente',
  empresas_reprovadas text[], -- Array de CNPJs reprovados
  
  -- Documento gerado
  url_documento text,
  nome_arquivo text,
  protocolo text UNIQUE,
  
  -- Metadados
  usuario_analista_id uuid REFERENCES auth.users(id),
  data_analise timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.analises_compliance ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Internal users can manage analises compliance"
ON public.analises_compliance
FOR ALL
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
));

CREATE POLICY "Internal users can view analises compliance"
ON public.analises_compliance
FOR SELECT
TO authenticated
USING (EXISTS (
  SELECT 1 FROM public.profiles
  WHERE profiles.id = auth.uid()
));

-- Trigger para updated_at
CREATE TRIGGER update_analises_compliance_updated_at
  BEFORE UPDATE ON public.analises_compliance
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
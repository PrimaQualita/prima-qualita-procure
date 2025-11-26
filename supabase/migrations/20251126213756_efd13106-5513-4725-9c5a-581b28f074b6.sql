-- Criar tabela para recursos de inabilitação em seleções
CREATE TABLE public.recursos_inabilitacao_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  inabilitacao_id UUID NOT NULL REFERENCES public.fornecedores_inabilitados_selecao(id) ON DELETE CASCADE,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  motivo_recurso TEXT NOT NULL,
  data_abertura_recurso TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_limite_fornecedor TIMESTAMP WITH TIME ZONE NOT NULL, -- 1 dia útil após inabilitação
  data_envio_recurso TIMESTAMP WITH TIME ZONE, -- quando o fornecedor enviou o recurso
  status_recurso TEXT NOT NULL DEFAULT 'aguardando_envio', -- aguardando_envio, enviado, em_analise, deferido, indeferido, expirado
  data_limite_gestor TIMESTAMP WITH TIME ZONE, -- 1 dia útil após envio do recurso
  resposta_gestor TEXT,
  data_resposta_gestor TIMESTAMP WITH TIME ZONE,
  usuario_gestor_id UUID REFERENCES public.profiles(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.recursos_inabilitacao_selecao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Fornecedores can view own recursos"
ON public.recursos_inabilitacao_selecao
FOR SELECT
USING (fornecedor_id IN (
  SELECT id FROM fornecedores WHERE user_id = auth.uid()
));

CREATE POLICY "Fornecedores can insert own recursos"
ON public.recursos_inabilitacao_selecao
FOR INSERT
WITH CHECK (fornecedor_id IN (
  SELECT id FROM fornecedores WHERE user_id = auth.uid()
));

CREATE POLICY "Fornecedores can update own recursos"
ON public.recursos_inabilitacao_selecao
FOR UPDATE
USING (fornecedor_id IN (
  SELECT id FROM fornecedores WHERE user_id = auth.uid()
));

CREATE POLICY "Internal users can manage recursos"
ON public.recursos_inabilitacao_selecao
FOR ALL
USING (EXISTS (
  SELECT 1 FROM profiles WHERE id = auth.uid()
));

-- Trigger para updated_at
CREATE TRIGGER update_recursos_inabilitacao_updated_at
BEFORE UPDATE ON public.recursos_inabilitacao_selecao
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.recursos_inabilitacao_selecao;
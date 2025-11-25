-- Criar tabela para mensagens de negociação (chat privado entre gestor e fornecedor)
CREATE TABLE public.mensagens_negociacao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  numero_item INTEGER NOT NULL,
  fornecedor_id UUID NOT NULL REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id),
  tipo_remetente TEXT NOT NULL CHECK (tipo_remetente IN ('gestor', 'fornecedor')),
  mensagem TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.mensagens_negociacao ENABLE ROW LEVEL SECURITY;

-- Política para usuários internos verem e criarem mensagens
CREATE POLICY "Internal users can manage mensagens negociacao"
ON public.mensagens_negociacao
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

-- Política para fornecedores verem apenas suas próprias mensagens de negociação
CREATE POLICY "Fornecedores can view own mensagens negociacao"
ON public.mensagens_negociacao
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM fornecedores 
  WHERE fornecedores.id = mensagens_negociacao.fornecedor_id 
  AND fornecedores.user_id = auth.uid()
));

-- Política para fornecedores criarem mensagens em suas negociações
CREATE POLICY "Fornecedores can create own mensagens negociacao"
ON public.mensagens_negociacao
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM fornecedores 
  WHERE fornecedores.id = mensagens_negociacao.fornecedor_id 
  AND fornecedores.user_id = auth.uid()
));

-- Política pública para fornecedores com código de acesso
CREATE POLICY "Public can view mensagens negociacao for their items"
ON public.mensagens_negociacao
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM selecao_propostas_fornecedor spf
  WHERE spf.selecao_id = mensagens_negociacao.selecao_id
  AND spf.fornecedor_id = mensagens_negociacao.fornecedor_id
  AND spf.codigo_acesso IS NOT NULL
));

-- Política pública para fornecedores criarem mensagens via código de acesso
CREATE POLICY "Public can create mensagens negociacao for their items"
ON public.mensagens_negociacao
FOR INSERT
WITH CHECK (EXISTS (
  SELECT 1 FROM selecao_propostas_fornecedor spf
  WHERE spf.selecao_id = mensagens_negociacao.selecao_id
  AND spf.fornecedor_id = mensagens_negociacao.fornecedor_id
  AND spf.codigo_acesso IS NOT NULL
));

-- Habilitar realtime para a tabela
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_negociacao;

-- Índices para performance
CREATE INDEX idx_mensagens_negociacao_selecao ON public.mensagens_negociacao(selecao_id);
CREATE INDEX idx_mensagens_negociacao_item ON public.mensagens_negociacao(selecao_id, numero_item);
CREATE INDEX idx_mensagens_negociacao_fornecedor ON public.mensagens_negociacao(fornecedor_id);
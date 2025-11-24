-- Tabela para mensagens de chat da seleção
CREATE TABLE public.mensagens_selecao (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  mensagem TEXT NOT NULL,
  tipo_usuario TEXT NOT NULL CHECK (tipo_usuario IN ('interno', 'fornecedor')),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Tabela para controlar quais itens estão abertos para lances
CREATE TABLE public.itens_abertos_lances (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  selecao_id UUID NOT NULL REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE,
  numero_item INTEGER NOT NULL,
  aberto BOOLEAN NOT NULL DEFAULT true,
  data_abertura TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  data_fechamento TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_mensagens_selecao_selecao_id ON public.mensagens_selecao(selecao_id);
CREATE INDEX idx_mensagens_selecao_created_at ON public.mensagens_selecao(created_at DESC);
CREATE INDEX idx_itens_abertos_lances_selecao_id ON public.itens_abertos_lances(selecao_id);

-- RLS Policies para mensagens_selecao
ALTER TABLE public.mensagens_selecao ENABLE ROW LEVEL SECURITY;

-- Usuários internos podem criar mensagens
CREATE POLICY "Internal users can create mensagens"
ON public.mensagens_selecao FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Fornecedores podem criar mensagens
CREATE POLICY "Fornecedores can create mensagens"
ON public.mensagens_selecao FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM fornecedores
    WHERE fornecedores.user_id = auth.uid()
    AND fornecedores.id = mensagens_selecao.fornecedor_id
  )
);

-- Usuários internos podem ver todas mensagens
CREATE POLICY "Internal users can view all mensagens"
ON public.mensagens_selecao FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Fornecedores podem ver mensagens da sua seleção
CREATE POLICY "Fornecedores can view mensagens of their selecao"
ON public.mensagens_selecao FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM fornecedores f
    JOIN selecao_fornecedor_convites sfc ON sfc.fornecedor_id = f.id
    WHERE f.user_id = auth.uid()
    AND sfc.selecao_id = mensagens_selecao.selecao_id
  )
);

-- RLS Policies para itens_abertos_lances
ALTER TABLE public.itens_abertos_lances ENABLE ROW LEVEL SECURITY;

-- Usuários internos podem gerenciar itens abertos
CREATE POLICY "Internal users can manage itens abertos"
ON public.itens_abertos_lances FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Fornecedores podem ver itens abertos
CREATE POLICY "Fornecedores can view itens abertos"
ON public.itens_abertos_lances FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM fornecedores f
    JOIN selecao_fornecedor_convites sfc ON sfc.fornecedor_id = f.id
    WHERE f.user_id = auth.uid()
    AND sfc.selecao_id = itens_abertos_lances.selecao_id
  )
);

-- Habilitar realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.mensagens_selecao;
ALTER PUBLICATION supabase_realtime ADD TABLE public.itens_abertos_lances;
-- Tabela de conversas/mensagens
CREATE TABLE public.mensagens_contato (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  assunto TEXT NOT NULL,
  conteudo TEXT NOT NULL,
  remetente_tipo TEXT NOT NULL CHECK (remetente_tipo IN ('interno', 'fornecedor')),
  remetente_interno_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  remetente_fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE SET NULL,
  excluida_remetente BOOLEAN DEFAULT false,
  data_exclusao_remetente TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT check_remetente CHECK (
    (remetente_tipo = 'interno' AND remetente_interno_id IS NOT NULL) OR
    (remetente_tipo = 'fornecedor' AND remetente_fornecedor_id IS NOT NULL)
  )
);

-- Tabela de destinatários
CREATE TABLE public.mensagens_contato_destinatarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mensagem_id UUID NOT NULL REFERENCES public.mensagens_contato(id) ON DELETE CASCADE,
  destinatario_tipo TEXT NOT NULL CHECK (destinatario_tipo IN ('interno', 'fornecedor')),
  destinatario_interno_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
  destinatario_fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE,
  lida BOOLEAN DEFAULT false,
  data_leitura TIMESTAMPTZ,
  excluida BOOLEAN DEFAULT false,
  data_exclusao TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  
  CONSTRAINT check_destinatario CHECK (
    (destinatario_tipo = 'interno' AND destinatario_interno_id IS NOT NULL) OR
    (destinatario_tipo = 'fornecedor' AND destinatario_fornecedor_id IS NOT NULL)
  )
);

-- Índices
CREATE INDEX idx_mensagens_contato_remetente_interno ON public.mensagens_contato(remetente_interno_id);
CREATE INDEX idx_mensagens_contato_remetente_fornecedor ON public.mensagens_contato(remetente_fornecedor_id);
CREATE INDEX idx_mensagens_contato_created ON public.mensagens_contato(created_at DESC);
CREATE INDEX idx_mensagens_dest_mensagem ON public.mensagens_contato_destinatarios(mensagem_id);
CREATE INDEX idx_mensagens_dest_interno ON public.mensagens_contato_destinatarios(destinatario_interno_id);
CREATE INDEX idx_mensagens_dest_fornecedor ON public.mensagens_contato_destinatarios(destinatario_fornecedor_id);

-- Habilitar RLS
ALTER TABLE public.mensagens_contato ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mensagens_contato_destinatarios ENABLE ROW LEVEL SECURITY;

-- Políticas para mensagens_contato
CREATE POLICY "Usuários internos veem suas mensagens" ON public.mensagens_contato
FOR SELECT TO authenticated
USING (
  remetente_interno_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.mensagens_contato_destinatarios mcd
    WHERE mcd.mensagem_id = mensagens_contato.id
    AND mcd.destinatario_interno_id = auth.uid()
  )
);

CREATE POLICY "Fornecedores veem suas mensagens" ON public.mensagens_contato
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.fornecedores f
    WHERE f.id = mensagens_contato.remetente_fornecedor_id
    AND f.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.mensagens_contato_destinatarios mcd
    JOIN public.fornecedores f ON f.id = mcd.destinatario_fornecedor_id
    WHERE mcd.mensagem_id = mensagens_contato.id
    AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Usuários internos criam mensagens" ON public.mensagens_contato
FOR INSERT TO authenticated
WITH CHECK (
  remetente_tipo = 'interno' AND remetente_interno_id = auth.uid()
);

CREATE POLICY "Fornecedores criam mensagens" ON public.mensagens_contato
FOR INSERT TO authenticated
WITH CHECK (
  remetente_tipo = 'fornecedor' 
  AND EXISTS (
    SELECT 1 FROM public.fornecedores f
    WHERE f.id = mensagens_contato.remetente_fornecedor_id
    AND f.user_id = auth.uid()
  )
);

CREATE POLICY "Remetentes podem atualizar suas mensagens" ON public.mensagens_contato
FOR UPDATE TO authenticated
USING (
  remetente_interno_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.fornecedores f
    WHERE f.id = mensagens_contato.remetente_fornecedor_id
    AND f.user_id = auth.uid()
  )
);

-- Políticas para mensagens_contato_destinatarios
CREATE POLICY "Ver destinatários das minhas mensagens" ON public.mensagens_contato_destinatarios
FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.mensagens_contato mc
    WHERE mc.id = mensagens_contato_destinatarios.mensagem_id
  )
);

CREATE POLICY "Criar destinatários" ON public.mensagens_contato_destinatarios
FOR INSERT TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM public.mensagens_contato mc
    WHERE mc.id = mensagens_contato_destinatarios.mensagem_id
    AND (
      mc.remetente_interno_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM public.fornecedores f
        WHERE f.id = mc.remetente_fornecedor_id
        AND f.user_id = auth.uid()
      )
    )
  )
);

CREATE POLICY "Atualizar próprios destinatários" ON public.mensagens_contato_destinatarios
FOR UPDATE TO authenticated
USING (
  destinatario_interno_id = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.fornecedores f
    WHERE f.id = mensagens_contato_destinatarios.destinatario_fornecedor_id
    AND f.user_id = auth.uid()
  )
);

-- Função para verificar exclusão total
CREATE OR REPLACE FUNCTION public.verificar_exclusao_mensagem()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_todos_excluiram BOOLEAN;
  v_remetente_excluiu BOOLEAN;
BEGIN
  SELECT NOT EXISTS (
    SELECT 1 FROM mensagens_contato_destinatarios
    WHERE mensagem_id = NEW.mensagem_id
    AND excluida = false
  ) INTO v_todos_excluiram;
  
  SELECT excluida_remetente INTO v_remetente_excluiu
  FROM mensagens_contato
  WHERE id = NEW.mensagem_id;
  
  IF v_todos_excluiram AND v_remetente_excluiu THEN
    DELETE FROM mensagens_contato WHERE id = NEW.mensagem_id;
  END IF;
  
  RETURN NEW;
END;
$$;

CREATE TRIGGER trigger_verificar_exclusao_mensagem
AFTER UPDATE OF excluida ON public.mensagens_contato_destinatarios
FOR EACH ROW
WHEN (NEW.excluida = true)
EXECUTE FUNCTION public.verificar_exclusao_mensagem();

-- Função para listar usuários internos
CREATE OR REPLACE FUNCTION public.get_usuarios_internos_para_mensagem()
RETURNS TABLE(id UUID, nome TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.id, p.nome_completo as nome
  FROM profiles p
  WHERE p.ativo = true
  ORDER BY p.nome_completo;
$$;

-- Função para listar fornecedores (para usuários internos)
CREATE OR REPLACE FUNCTION public.get_fornecedores_para_mensagem()
RETURNS TABLE(id UUID, nome TEXT, cnpj TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT f.id, COALESCE(f.nome_fantasia, f.razao_social) as nome, f.cnpj
  FROM fornecedores f
  WHERE f.ativo = true AND f.status_aprovacao = 'aprovado'
  ORDER BY COALESCE(f.nome_fantasia, f.razao_social);
$$;
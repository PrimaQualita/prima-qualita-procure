-- Criar enum para perfis de usuário
CREATE TYPE public.user_profile AS ENUM ('gestor', 'colaborador', 'fornecedor');

-- Criar enum para perfis de usuário (para tabela de roles separada)
CREATE TYPE public.app_role AS ENUM ('gestor', 'colaborador');

-- Criar enum para status de processos
CREATE TYPE public.status_processo AS ENUM (
  'planejado',
  'em_cotacao',
  'cotacao_concluida',
  'em_selecao',
  'contratado',
  'concluido',
  'cancelado'
);

-- Criar enum para tipo de processo
CREATE TYPE public.tipo_processo AS ENUM ('material', 'servico', 'mao_obra_exclusiva', 'outros');

-- Criar enum para status de cotação
CREATE TYPE public.status_cotacao AS ENUM ('em_aberto', 'encerrada', 'cancelada');

-- Criar enum para status de seleção
CREATE TYPE public.status_selecao AS ENUM ('planejada', 'em_disputa', 'encerrada', 'cancelada');

-- Criar enum para status de contrato de gestão
CREATE TYPE public.status_contrato AS ENUM ('ativo', 'encerrado', 'suspenso');

-- Criar enum para status de atendimento
CREATE TYPE public.status_atendimento AS ENUM ('aberto', 'em_analise', 'respondido', 'fechado');

-- Tabela de perfis de usuários internos (gestores e colaboradores)
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  nome_completo TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  data_nascimento DATE,
  ativo BOOLEAN DEFAULT TRUE,
  data_criacao TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_ultimo_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de roles de usuários (separada para segurança)
CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role app_role NOT NULL,
  UNIQUE (user_id, role)
);

-- Função de segurança para verificar roles
CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Tabela de fornecedores
CREATE TABLE public.fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  razao_social TEXT NOT NULL,
  nome_fantasia TEXT,
  cnpj TEXT UNIQUE NOT NULL,
  telefone TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  nome_socio_administrador TEXT NOT NULL,
  nomes_socios_cotistas TEXT,
  segmento_atividade TEXT,
  ativo BOOLEAN DEFAULT TRUE,
  data_cadastro TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de perguntas de due diligence
CREATE TABLE public.perguntas_due_diligence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  texto_pergunta TEXT NOT NULL,
  tipo_resposta TEXT NOT NULL DEFAULT 'texto',
  ordem INTEGER NOT NULL DEFAULT 0,
  ativo BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de respostas de due diligence
CREATE TABLE public.respostas_due_diligence_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  pergunta_id UUID REFERENCES public.perguntas_due_diligence(id) ON DELETE CASCADE NOT NULL,
  resposta_texto TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de documentos de fornecedores
CREATE TABLE public.documentos_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  tipo_documento TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_upload TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  data_emissao DATE,
  data_validade DATE,
  em_vigor BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de contratos de gestão
CREATE TABLE public.contratos_gestao (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nome_contrato TEXT NOT NULL,
  ente_federativo TEXT NOT NULL,
  data_inicio DATE NOT NULL,
  data_fim DATE NOT NULL,
  status status_contrato DEFAULT 'ativo',
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de processos de compras
CREATE TABLE public.processos_compras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contrato_gestao_id UUID REFERENCES public.contratos_gestao(id) ON DELETE CASCADE NOT NULL,
  ano_referencia INTEGER NOT NULL,
  numero_processo_interno TEXT NOT NULL,
  objeto_resumido TEXT NOT NULL,
  tipo tipo_processo NOT NULL,
  centro_custo TEXT,
  valor_estimado_anual DECIMAL(15,2) NOT NULL DEFAULT 0,
  status_processo status_processo DEFAULT 'planejado',
  data_abertura DATE DEFAULT NOW(),
  data_encerramento_prevista DATE,
  data_encerramento_real DATE,
  observacoes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de anexos de processos de compra
CREATE TABLE public.anexos_processo_compra (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_compra_id UUID REFERENCES public.processos_compras(id) ON DELETE CASCADE NOT NULL,
  tipo_anexo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_upload TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  usuario_upload_id UUID REFERENCES auth.users(id)
);

-- Tabela de cotações de preços
CREATE TABLE public.cotacoes_precos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_compra_id UUID REFERENCES public.processos_compras(id) ON DELETE CASCADE NOT NULL,
  titulo_cotacao TEXT NOT NULL,
  descricao_cotacao TEXT,
  data_envio TIMESTAMP WITH TIME ZONE,
  data_limite_resposta TIMESTAMP WITH TIME ZONE NOT NULL,
  status_cotacao status_cotacao DEFAULT 'em_aberto',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de convites para cotação
CREATE TABLE public.cotacao_fornecedor_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE NOT NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  email_enviado_em TIMESTAMP WITH TIME ZONE,
  link_acesso_unico TEXT UNIQUE,
  data_hora_acesso_primeiro TIMESTAMP WITH TIME ZONE,
  status_convite TEXT DEFAULT 'enviado',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de respostas de fornecedores em cotação
CREATE TABLE public.cotacao_respostas_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_id UUID REFERENCES public.cotacoes_precos(id) ON DELETE CASCADE NOT NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  valor_total_anual_ofertado DECIMAL(15,2) NOT NULL,
  data_envio_resposta TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  observacoes_fornecedor TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de anexos de respostas de cotação
CREATE TABLE public.anexos_cotacao_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cotacao_resposta_fornecedor_id UUID REFERENCES public.cotacao_respostas_fornecedor(id) ON DELETE CASCADE NOT NULL,
  tipo_anexo TEXT NOT NULL,
  nome_arquivo TEXT NOT NULL,
  url_arquivo TEXT NOT NULL,
  data_upload TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de seleções de fornecedores
CREATE TABLE public.selecoes_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  processo_compra_id UUID REFERENCES public.processos_compras(id) ON DELETE CASCADE NOT NULL,
  cotacao_relacionada_id UUID REFERENCES public.cotacoes_precos(id),
  titulo_selecao TEXT NOT NULL,
  descricao TEXT,
  valor_estimado_anual DECIMAL(15,2) NOT NULL,
  data_sessao_disputa DATE NOT NULL,
  hora_sessao_disputa TIME NOT NULL,
  status_selecao status_selecao DEFAULT 'planejada',
  criterios_julgamento TEXT DEFAULT 'menor_preco',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de convites para seleção
CREATE TABLE public.selecao_fornecedor_convites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id UUID REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE NOT NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  email_enviado_em TIMESTAMP WITH TIME ZONE,
  link_acesso_unico TEXT UNIQUE,
  status_convite TEXT DEFAULT 'enviado',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de lances de fornecedores
CREATE TABLE public.lances_fornecedores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id UUID REFERENCES public.selecoes_fornecedores(id) ON DELETE CASCADE NOT NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  valor_lance DECIMAL(15,2) NOT NULL,
  data_hora_lance TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  observacao_lance TEXT,
  indicativo_lance_vencedor BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de contatos
CREATE TABLE public.contatos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_usuario TEXT NOT NULL,
  usuario_interno_id UUID REFERENCES auth.users(id),
  fornecedor_id UUID REFERENCES public.fornecedores(id),
  assunto TEXT NOT NULL,
  categoria TEXT NOT NULL,
  mensagem TEXT NOT NULL,
  status_atendimento status_atendimento DEFAULT 'aberto',
  resposta_interna TEXT,
  data_resposta TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de notificações para fornecedores
CREATE TABLE public.notificacoes_fornecedor (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fornecedor_id UUID REFERENCES public.fornecedores(id) ON DELETE CASCADE NOT NULL,
  tipo_notificacao TEXT NOT NULL,
  documento_id UUID REFERENCES public.documentos_fornecedor(id),
  data_envio TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  status_envio TEXT DEFAULT 'pendente',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tabela de logs de auditoria
CREATE TABLE public.audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id UUID REFERENCES auth.users(id),
  usuario_nome TEXT,
  usuario_tipo TEXT,
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id UUID,
  detalhes JSONB,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Habilitar RLS em todas as tabelas
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.perguntas_due_diligence ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.respostas_due_diligence_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contratos_gestao ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.processos_compras ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_processo_compra ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacoes_precos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_fornecedor_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cotacao_respostas_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.anexos_cotacao_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selecoes_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.selecao_fornecedor_convites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lances_fornecedores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contatos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificacoes_fornecedor ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

-- Policies para profiles (usuários internos podem ver todos os perfis)
CREATE POLICY "Authenticated users can view all profiles"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id);

-- Policies para user_roles (apenas gestores podem modificar)
CREATE POLICY "Authenticated users can view roles"
  ON public.user_roles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Gestores can manage roles"
  ON public.user_roles FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- Policies para fornecedores
CREATE POLICY "Fornecedores can view own data"
  ON public.fornecedores FOR SELECT
  TO authenticated
  USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Fornecedores can update own data"
  ON public.fornecedores FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Internal users can manage fornecedores"
  ON public.fornecedores FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Policies para contratos de gestão (apenas usuários internos)
CREATE POLICY "Internal users can view contratos"
  ON public.contratos_gestao FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can create contratos"
  ON public.contratos_gestao FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can update contratos"
  ON public.contratos_gestao FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Gestores can delete contratos"
  ON public.contratos_gestao FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- Policies para processos de compras
CREATE POLICY "Internal users can view processos"
  ON public.processos_compras FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can create processos"
  ON public.processos_compras FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can update processos"
  ON public.processos_compras FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Gestores can delete processos"
  ON public.processos_compras FOR DELETE
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- Policies para cotações
CREATE POLICY "Internal users can view cotacoes"
  ON public.cotacoes_precos FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can manage cotacoes"
  ON public.cotacoes_precos FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Policies para convites de cotação
CREATE POLICY "Users can view their cotacao convites"
  ON public.cotacao_fornecedor_convites FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id)
  );

CREATE POLICY "Internal users can manage cotacao convites"
  ON public.cotacao_fornecedor_convites FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Policies para respostas de cotação
CREATE POLICY "Users can view cotacao respostas"
  ON public.cotacao_respostas_fornecedor FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id)
  );

CREATE POLICY "Fornecedores can create own respostas"
  ON public.cotacao_respostas_fornecedor FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id));

-- Policies para seleções
CREATE POLICY "Internal users can view selecoes"
  ON public.selecoes_fornecedores FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can manage selecoes"
  ON public.selecoes_fornecedores FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Policies para lances
CREATE POLICY "Users can view lances"
  ON public.lances_fornecedores FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id)
  );

CREATE POLICY "Fornecedores can create own lances"
  ON public.lances_fornecedores FOR INSERT
  TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id));

-- Policies para contatos
CREATE POLICY "Users can view own contatos"
  ON public.contatos FOR SELECT
  TO authenticated
  USING (
    usuario_interno_id = auth.uid() OR
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Users can create contatos"
  ON public.contatos FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Internal users can update contatos"
  ON public.contatos FOR UPDATE
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Policies para audit logs (apenas gestores podem visualizar)
CREATE POLICY "Gestores can view audit logs"
  ON public.audit_logs FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

CREATE POLICY "System can create audit logs"
  ON public.audit_logs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policies para documentos de fornecedor
CREATE POLICY "Fornecedores can view own documents"
  ON public.documentos_fornecedor FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Fornecedores can manage own documents"
  ON public.documentos_fornecedor FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id));

-- Policies para perguntas de due diligence
CREATE POLICY "Everyone can view active questions"
  ON public.perguntas_due_diligence FOR SELECT
  TO authenticated
  USING (ativo = true);

CREATE POLICY "Gestores can manage questions"
  ON public.perguntas_due_diligence FOR ALL
  TO authenticated
  USING (public.has_role(auth.uid(), 'gestor'));

-- Policies para respostas de due diligence
CREATE POLICY "Fornecedores can view own respostas"
  ON public.respostas_due_diligence_fornecedor FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id) OR
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid())
  );

CREATE POLICY "Fornecedores can manage own respostas"
  ON public.respostas_due_diligence_fornecedor FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id));

-- Policies para anexos de processo
CREATE POLICY "Internal users can view anexos processo"
  ON public.anexos_processo_compra FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

CREATE POLICY "Internal users can manage anexos processo"
  ON public.anexos_processo_compra FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Policies para anexos de cotação fornecedor
CREATE POLICY "Users can view anexos cotacao"
  ON public.anexos_cotacao_fornecedor FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) OR
    EXISTS (
      SELECT 1 FROM public.cotacao_respostas_fornecedor cr
      JOIN public.fornecedores f ON f.id = cr.fornecedor_id
      WHERE f.user_id = auth.uid() AND cr.id = cotacao_resposta_fornecedor_id
    )
  );

CREATE POLICY "Fornecedores can create anexos cotacao"
  ON public.anexos_cotacao_fornecedor FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.cotacao_respostas_fornecedor cr
      JOIN public.fornecedores f ON f.id = cr.fornecedor_id
      WHERE f.user_id = auth.uid() AND cr.id = cotacao_resposta_fornecedor_id
    )
  );

-- Policies para notificações de fornecedor
CREATE POLICY "Fornecedores can view own notificacoes"
  ON public.notificacoes_fornecedor FOR SELECT
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id));

CREATE POLICY "System can create notificacoes"
  ON public.notificacoes_fornecedor FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Policies para convites de seleção
CREATE POLICY "Users can view their selecao convites"
  ON public.selecao_fornecedor_convites FOR SELECT
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()) OR
    EXISTS (SELECT 1 FROM public.fornecedores WHERE user_id = auth.uid() AND id = fornecedor_id)
  );

CREATE POLICY "Internal users can manage selecao convites"
  ON public.selecao_fornecedor_convites FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid()));

-- Trigger para atualizar updated_at
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_fornecedores_updated_at BEFORE UPDATE ON public.fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_contratos_gestao_updated_at BEFORE UPDATE ON public.contratos_gestao
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_processos_compras_updated_at BEFORE UPDATE ON public.processos_compras
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_cotacoes_precos_updated_at BEFORE UPDATE ON public.cotacoes_precos
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_selecoes_fornecedores_updated_at BEFORE UPDATE ON public.selecoes_fornecedores
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_respostas_due_diligence_updated_at BEFORE UPDATE ON public.respostas_due_diligence_fornecedor
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
-- Função que registra logs de auditoria automaticamente
CREATE OR REPLACE FUNCTION public.registrar_auditoria()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acao text;
  v_entidade text;
  v_entidade_id uuid;
  v_detalhes jsonb;
  v_usuario_id uuid;
  v_usuario_nome text;
  v_usuario_tipo text := 'interno';
BEGIN
  -- Determinar a ação
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criar';
    v_entidade_id := NEW.id;
  ELSIF TG_OP = 'UPDATE' THEN
    v_acao := 'editar';
    v_entidade_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'excluir';
    v_entidade_id := OLD.id;
  END IF;

  -- Determinar a entidade e detalhes baseado na tabela
  v_entidade := TG_TABLE_NAME;
  
  -- Mapear nomes amigáveis
  CASE TG_TABLE_NAME
    WHEN 'processos_compras' THEN 
      v_entidade := 'Processo de Compra';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('numero', OLD.numero_processo_interno, 'objeto', OLD.objeto_resumido);
      ELSE
        v_detalhes := jsonb_build_object('numero', NEW.numero_processo_interno, 'objeto', NEW.objeto_resumido);
      END IF;
    WHEN 'cotacoes_precos' THEN 
      v_entidade := 'Cotação de Preços';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('titulo', OLD.titulo_cotacao);
      ELSE
        v_detalhes := jsonb_build_object('titulo', NEW.titulo_cotacao);
      END IF;
    WHEN 'selecoes_fornecedores' THEN 
      v_entidade := 'Seleção de Fornecedores';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('titulo', OLD.titulo_selecao, 'numero', OLD.numero_selecao);
      ELSE
        v_detalhes := jsonb_build_object('titulo', NEW.titulo_selecao, 'numero', NEW.numero_selecao);
      END IF;
    WHEN 'atas_selecao' THEN 
      v_entidade := 'Ata de Seleção';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    WHEN 'homologacoes_selecao' THEN 
      v_entidade := 'Homologação';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    WHEN 'autorizacoes_processo' THEN 
      v_entidade := 'Autorização de Despesa';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'tipo', OLD.tipo_autorizacao);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'tipo', NEW.tipo_autorizacao);
      END IF;
    WHEN 'encaminhamentos_processo' THEN 
      v_entidade := 'Encaminhamento';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'processo_numero', OLD.processo_numero);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'processo_numero', NEW.processo_numero);
      END IF;
    WHEN 'encaminhamentos_contabilidade' THEN 
      v_entidade := 'Encaminhamento à Contabilidade';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'processo_numero', OLD.processo_numero);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'processo_numero', NEW.processo_numero);
      END IF;
    WHEN 'relatorios_finais' THEN 
      v_entidade := 'Relatório Final';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    WHEN 'analises_compliance' THEN 
      v_entidade := 'Análise de Compliance';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'processo_numero', OLD.processo_numero);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'processo_numero', NEW.processo_numero);
      END IF;
    WHEN 'planilhas_consolidadas' THEN 
      v_entidade := 'Planilha Consolidada';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    WHEN 'planilhas_habilitacao' THEN 
      v_entidade := 'Planilha de Habilitação';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    WHEN 'cotacao_respostas_fornecedor' THEN 
      v_entidade := 'Proposta de Cotação';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo);
        -- Buscar nome do fornecedor
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = OLD.fornecedor_id;
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = NEW.fornecedor_id;
      END IF;
    WHEN 'selecao_propostas_fornecedor' THEN 
      v_entidade := 'Proposta de Seleção';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = OLD.fornecedor_id;
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = NEW.fornecedor_id;
      END IF;
    WHEN 'recursos_fornecedor' THEN 
      v_entidade := 'Recurso de Fornecedor';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = OLD.fornecedor_id;
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = NEW.fornecedor_id;
      END IF;
    WHEN 'recursos_inabilitacao_selecao' THEN 
      v_entidade := 'Recurso de Inabilitação';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('motivo', OLD.motivo_recurso);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = OLD.fornecedor_id;
      ELSE
        v_detalhes := jsonb_build_object('motivo', NEW.motivo_recurso);
        SELECT razao_social INTO v_usuario_nome FROM fornecedores WHERE id = NEW.fornecedor_id;
      END IF;
    WHEN 'respostas_recursos' THEN 
      v_entidade := 'Resposta de Recurso';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo);
      END IF;
    WHEN 'anexos_selecao' THEN 
      v_entidade := 'Anexo de Seleção';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('tipo', OLD.tipo_documento, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('tipo', NEW.tipo_documento, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    WHEN 'contratos_gestao' THEN 
      v_entidade := 'Contrato de Gestão';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('nome', OLD.nome_contrato, 'ente', OLD.ente_federativo);
      ELSE
        v_detalhes := jsonb_build_object('nome', NEW.nome_contrato, 'ente', NEW.ente_federativo);
      END IF;
    WHEN 'fornecedores' THEN 
      v_entidade := 'Cadastro de Fornecedor';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('razao_social', OLD.razao_social, 'cnpj', OLD.cnpj);
        v_usuario_nome := OLD.razao_social;
      ELSE
        v_detalhes := jsonb_build_object('razao_social', NEW.razao_social, 'cnpj', NEW.cnpj);
        v_usuario_nome := NEW.razao_social;
      END IF;
    WHEN 'profiles' THEN 
      v_entidade := 'Usuário';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('nome', OLD.nome_completo, 'email', OLD.email);
        v_usuario_nome := OLD.nome_completo;
      ELSE
        v_detalhes := jsonb_build_object('nome', NEW.nome_completo, 'email', NEW.email);
        v_usuario_nome := NEW.nome_completo;
      END IF;
    WHEN 'planilhas_lances_selecao' THEN
      v_entidade := 'Planilha de Lances';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object('protocolo', OLD.protocolo, 'nome_arquivo', OLD.nome_arquivo);
      ELSE
        v_detalhes := jsonb_build_object('protocolo', NEW.protocolo, 'nome_arquivo', NEW.nome_arquivo);
      END IF;
    ELSE
      v_detalhes := '{}'::jsonb;
  END CASE;

  -- Buscar usuário atual se não foi definido (para usuários internos)
  IF v_usuario_nome IS NULL THEN
    v_usuario_id := auth.uid();
    IF v_usuario_id IS NOT NULL THEN
      SELECT nome_completo INTO v_usuario_nome FROM profiles WHERE id = v_usuario_id;
    END IF;
  END IF;

  -- Inserir log de auditoria
  INSERT INTO audit_logs (
    acao,
    entidade,
    entidade_id,
    usuario_id,
    usuario_nome,
    usuario_tipo,
    detalhes
  ) VALUES (
    v_acao,
    v_entidade,
    v_entidade_id,
    v_usuario_id,
    COALESCE(v_usuario_nome, 'Sistema'),
    v_usuario_tipo,
    v_detalhes
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$$;

-- Criar triggers para todas as tabelas principais

-- Processos de Compras
DROP TRIGGER IF EXISTS audit_processos_compras ON processos_compras;
CREATE TRIGGER audit_processos_compras
  AFTER INSERT OR DELETE ON processos_compras
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Cotações
DROP TRIGGER IF EXISTS audit_cotacoes_precos ON cotacoes_precos;
CREATE TRIGGER audit_cotacoes_precos
  AFTER INSERT OR DELETE ON cotacoes_precos
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Seleções
DROP TRIGGER IF EXISTS audit_selecoes_fornecedores ON selecoes_fornecedores;
CREATE TRIGGER audit_selecoes_fornecedores
  AFTER INSERT OR DELETE ON selecoes_fornecedores
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Atas de Seleção
DROP TRIGGER IF EXISTS audit_atas_selecao ON atas_selecao;
CREATE TRIGGER audit_atas_selecao
  AFTER INSERT OR DELETE ON atas_selecao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Homologações
DROP TRIGGER IF EXISTS audit_homologacoes_selecao ON homologacoes_selecao;
CREATE TRIGGER audit_homologacoes_selecao
  AFTER INSERT OR DELETE ON homologacoes_selecao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Autorizações
DROP TRIGGER IF EXISTS audit_autorizacoes_processo ON autorizacoes_processo;
CREATE TRIGGER audit_autorizacoes_processo
  AFTER INSERT OR DELETE ON autorizacoes_processo
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Encaminhamentos
DROP TRIGGER IF EXISTS audit_encaminhamentos_processo ON encaminhamentos_processo;
CREATE TRIGGER audit_encaminhamentos_processo
  AFTER INSERT OR DELETE ON encaminhamentos_processo
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Encaminhamentos Contabilidade
DROP TRIGGER IF EXISTS audit_encaminhamentos_contabilidade ON encaminhamentos_contabilidade;
CREATE TRIGGER audit_encaminhamentos_contabilidade
  AFTER INSERT OR DELETE ON encaminhamentos_contabilidade
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Relatórios Finais
DROP TRIGGER IF EXISTS audit_relatorios_finais ON relatorios_finais;
CREATE TRIGGER audit_relatorios_finais
  AFTER INSERT OR DELETE ON relatorios_finais
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Análises de Compliance
DROP TRIGGER IF EXISTS audit_analises_compliance ON analises_compliance;
CREATE TRIGGER audit_analises_compliance
  AFTER INSERT OR DELETE ON analises_compliance
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Planilhas Consolidadas
DROP TRIGGER IF EXISTS audit_planilhas_consolidadas ON planilhas_consolidadas;
CREATE TRIGGER audit_planilhas_consolidadas
  AFTER INSERT OR DELETE ON planilhas_consolidadas
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Planilhas de Habilitação
DROP TRIGGER IF EXISTS audit_planilhas_habilitacao ON planilhas_habilitacao;
CREATE TRIGGER audit_planilhas_habilitacao
  AFTER INSERT OR DELETE ON planilhas_habilitacao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Propostas de Cotação (fornecedores)
DROP TRIGGER IF EXISTS audit_cotacao_respostas ON cotacao_respostas_fornecedor;
CREATE TRIGGER audit_cotacao_respostas
  AFTER INSERT OR DELETE ON cotacao_respostas_fornecedor
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Propostas de Seleção (fornecedores)
DROP TRIGGER IF EXISTS audit_selecao_propostas ON selecao_propostas_fornecedor;
CREATE TRIGGER audit_selecao_propostas
  AFTER INSERT OR DELETE ON selecao_propostas_fornecedor
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Recursos de Fornecedor
DROP TRIGGER IF EXISTS audit_recursos_fornecedor ON recursos_fornecedor;
CREATE TRIGGER audit_recursos_fornecedor
  AFTER INSERT OR DELETE ON recursos_fornecedor
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Recursos de Inabilitação
DROP TRIGGER IF EXISTS audit_recursos_inabilitacao ON recursos_inabilitacao_selecao;
CREATE TRIGGER audit_recursos_inabilitacao
  AFTER INSERT OR DELETE ON recursos_inabilitacao_selecao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Respostas de Recursos
DROP TRIGGER IF EXISTS audit_respostas_recursos ON respostas_recursos;
CREATE TRIGGER audit_respostas_recursos
  AFTER INSERT OR DELETE ON respostas_recursos
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Anexos de Seleção
DROP TRIGGER IF EXISTS audit_anexos_selecao ON anexos_selecao;
CREATE TRIGGER audit_anexos_selecao
  AFTER INSERT OR DELETE ON anexos_selecao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Contratos de Gestão
DROP TRIGGER IF EXISTS audit_contratos_gestao ON contratos_gestao;
CREATE TRIGGER audit_contratos_gestao
  AFTER INSERT OR DELETE ON contratos_gestao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Fornecedores
DROP TRIGGER IF EXISTS audit_fornecedores ON fornecedores;
CREATE TRIGGER audit_fornecedores
  AFTER INSERT OR DELETE ON fornecedores
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Usuários (Profiles)
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
CREATE TRIGGER audit_profiles
  AFTER INSERT OR DELETE ON profiles
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();

-- Planilhas de Lances
DROP TRIGGER IF EXISTS audit_planilhas_lances ON planilhas_lances_selecao;
CREATE TRIGGER audit_planilhas_lances
  AFTER INSERT OR DELETE ON planilhas_lances_selecao
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
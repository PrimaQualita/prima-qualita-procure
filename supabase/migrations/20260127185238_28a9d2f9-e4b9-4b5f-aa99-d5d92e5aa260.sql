-- Atualizar função de auditoria para incluir protocolo em deleções
CREATE OR REPLACE FUNCTION public.registrar_auditoria()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_detalhes JSONB;
  v_entidade_id TEXT;
  v_acao TEXT;
  v_usuario_id UUID;
  v_usuario_nome TEXT;
  v_numero_processo TEXT;
  v_nome_documento TEXT;
  v_titulo TEXT;
  v_fornecedor TEXT;
  v_selecao TEXT;
  v_contrato_gestao TEXT;
BEGIN
  -- Determinar a ação
  IF TG_OP = 'INSERT' THEN
    v_acao := 'criação';
    v_entidade_id := NEW.id::TEXT;
  ELSIF TG_OP = 'UPDATE' THEN
    v_acao := 'atualização';
    v_entidade_id := NEW.id::TEXT;
  ELSIF TG_OP = 'DELETE' THEN
    v_acao := 'deleção';
    v_entidade_id := OLD.id::TEXT;
  END IF;

  -- Obter informações do usuário atual (se disponível)
  v_usuario_id := auth.uid();
  IF v_usuario_id IS NOT NULL THEN
    SELECT nome_completo INTO v_usuario_nome FROM profiles WHERE id = v_usuario_id;
  END IF;

  -- Construir detalhes específicos por tabela
  CASE TG_TABLE_NAME
    -- Processos de compra
    WHEN 'processos_compras' THEN
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.numero_processo_interno,
          'objeto', COALESCE(OLD.objeto_descricao, 'N/A'),
          'tipo', 'Processo de Compra'
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.numero_processo_interno,
          'objeto', COALESCE(NEW.objeto_descricao, 'N/A'),
          'tipo', 'Processo de Compra'
        );
      END IF;

    -- Anexos de processo de compra
    WHEN 'anexos_processo_compra' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT numero_processo_interno INTO v_numero_processo
        FROM processos_compras
        WHERE id = OLD.processo_compra_id;
        
        v_nome_documento := CASE OLD.tipo_anexo
          WHEN 'capa_processo' THEN 'Capa do Processo'
          WHEN 'requisicao' THEN 'Requisição'
          WHEN 'termo_referencia' THEN 'Termo de Referência'
          WHEN 'autorizacao_despesa' THEN 'Autorização de Despesa'
          WHEN 'PROCESSO_COMPLETO' THEN 'Processo Completo (Mesclado)'
          ELSE OLD.tipo_anexo
        END;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'nome_documento', v_nome_documento,
          'nome_arquivo', OLD.nome_arquivo,
          'tipo', 'Anexo do Processo'
        );
      ELSE
        SELECT numero_processo_interno INTO v_numero_processo
        FROM processos_compras
        WHERE id = NEW.processo_compra_id;
        
        v_nome_documento := CASE NEW.tipo_anexo
          WHEN 'capa_processo' THEN 'Capa do Processo'
          WHEN 'requisicao' THEN 'Requisição'
          WHEN 'termo_referencia' THEN 'Termo de Referência'
          WHEN 'autorizacao_despesa' THEN 'Autorização de Despesa'
          WHEN 'PROCESSO_COMPLETO' THEN 'Processo Completo (Mesclado)'
          ELSE NEW.tipo_anexo
        END;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'nome_documento', v_nome_documento,
          'nome_arquivo', NEW.nome_arquivo,
          'tipo', 'Anexo do Processo'
        );
      END IF;

    -- Cotações
    WHEN 'cotacoes_precos' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT numero_processo_interno INTO v_numero_processo
        FROM processos_compras
        WHERE id = OLD.processo_compra_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo', OLD.titulo_cotacao,
          'tipo', 'Cotação de Preços'
        );
      ELSE
        SELECT numero_processo_interno INTO v_numero_processo
        FROM processos_compras
        WHERE id = NEW.processo_compra_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo', NEW.titulo_cotacao,
          'tipo', 'Cotação de Preços'
        );
      END IF;

    -- Respostas de fornecedores (propostas de cotação)
    WHEN 'cotacao_respostas_fornecedor' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT c.titulo_cotacao, p.numero_processo_interno, f.razao_social, cg.nome_contrato
        INTO v_titulo, v_numero_processo, v_fornecedor, v_contrato_gestao
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        LEFT JOIN contratos_gestao cg ON p.contrato_gestao_id = cg.id
        LEFT JOIN fornecedores f ON OLD.fornecedor_id = f.id
        WHERE c.id = OLD.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'contrato_gestao', COALESCE(v_contrato_gestao, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'fornecedor', COALESCE(v_fornecedor, 'N/A'),
          'protocolo', COALESCE(OLD.protocolo, NULL),
          'tipo', 'Proposta de Fornecedor'
        );
      ELSE
        SELECT c.titulo_cotacao, p.numero_processo_interno, f.razao_social, cg.nome_contrato
        INTO v_titulo, v_numero_processo, v_fornecedor, v_contrato_gestao
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        LEFT JOIN contratos_gestao cg ON p.contrato_gestao_id = cg.id
        LEFT JOIN fornecedores f ON NEW.fornecedor_id = f.id
        WHERE c.id = NEW.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'contrato_gestao', COALESCE(v_contrato_gestao, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'fornecedor', COALESCE(v_fornecedor, 'N/A'),
          'protocolo', COALESCE(NEW.protocolo, NULL),
          'tipo', 'Proposta de Fornecedor'
        );
      END IF;

    -- Seleções
    WHEN 'selecoes_fornecedores' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT p.numero_processo_interno INTO v_numero_processo
        FROM processos_compras p
        WHERE p.id = OLD.processo_compra_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo', OLD.titulo_selecao,
          'tipo', 'Seleção de Fornecedores'
        );
      ELSE
        SELECT p.numero_processo_interno INTO v_numero_processo
        FROM processos_compras p
        WHERE p.id = NEW.processo_compra_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo', NEW.titulo_selecao,
          'tipo', 'Seleção de Fornecedores'
        );
      END IF;

    -- Atas de seleção
    WHEN 'atas_selecao' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT s.titulo_selecao, p.numero_processo_interno
        INTO v_selecao, v_numero_processo
        FROM selecoes_fornecedores s
        JOIN processos_compras p ON s.processo_compra_id = p.id
        WHERE s.id = OLD.selecao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'selecao', COALESCE(v_selecao, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', OLD.protocolo,
          'tipo', 'Ata de Seleção'
        );
      ELSE
        SELECT s.titulo_selecao, p.numero_processo_interno
        INTO v_selecao, v_numero_processo
        FROM selecoes_fornecedores s
        JOIN processos_compras p ON s.processo_compra_id = p.id
        WHERE s.id = NEW.selecao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'selecao', COALESCE(v_selecao, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', NEW.protocolo,
          'tipo', 'Ata de Seleção'
        );
      END IF;

    -- Homologações
    WHEN 'homologacoes_selecao' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT s.titulo_selecao, p.numero_processo_interno
        INTO v_selecao, v_numero_processo
        FROM selecoes_fornecedores s
        JOIN processos_compras p ON s.processo_compra_id = p.id
        WHERE s.id = OLD.selecao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'selecao', COALESCE(v_selecao, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', OLD.protocolo,
          'tipo', 'Homologação de Seleção'
        );
      ELSE
        SELECT s.titulo_selecao, p.numero_processo_interno
        INTO v_selecao, v_numero_processo
        FROM selecoes_fornecedores s
        JOIN processos_compras p ON s.processo_compra_id = p.id
        WHERE s.id = NEW.selecao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'selecao', COALESCE(v_selecao, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', NEW.protocolo,
          'tipo', 'Homologação de Seleção'
        );
      END IF;

    -- Planilhas consolidadas
    WHEN 'planilhas_consolidadas' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = OLD.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', COALESCE(OLD.protocolo, NULL),
          'tipo', 'Planilha Consolidada'
        );
      ELSE
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = NEW.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', COALESCE(NEW.protocolo, NULL),
          'tipo', 'Planilha Consolidada'
        );
      END IF;

    -- Planilhas de habilitação
    WHEN 'planilhas_habilitacao' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = OLD.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', OLD.protocolo,
          'tipo', 'Planilha de Habilitação'
        );
      ELSE
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = NEW.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', NEW.protocolo,
          'tipo', 'Planilha de Habilitação'
        );
      END IF;

    -- Análises de compliance
    WHEN 'analises_compliance' THEN
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.processo_numero,
          'nome_arquivo', COALESCE(OLD.nome_arquivo, 'N/A'),
          'protocolo', COALESCE(OLD.protocolo, NULL),
          'tipo', 'Análise de Compliance'
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.processo_numero,
          'nome_arquivo', COALESCE(NEW.nome_arquivo, 'N/A'),
          'protocolo', COALESCE(NEW.protocolo, NULL),
          'tipo', 'Análise de Compliance'
        );
      END IF;

    -- Autorizações
    WHEN 'autorizacoes_processo' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = OLD.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', OLD.protocolo,
          'tipo_autorizacao', OLD.tipo_autorizacao,
          'tipo', 'Autorização de Processo'
        );
      ELSE
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = NEW.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', NEW.protocolo,
          'tipo_autorizacao', NEW.tipo_autorizacao,
          'tipo', 'Autorização de Processo'
        );
      END IF;

    -- Relatórios finais
    WHEN 'relatorios_finais' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = OLD.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', OLD.protocolo,
          'tipo', 'Relatório Final'
        );
      ELSE
        SELECT c.titulo_cotacao, p.numero_processo_interno
        INTO v_titulo, v_numero_processo
        FROM cotacoes_precos c
        JOIN processos_compras p ON c.processo_compra_id = p.id
        WHERE c.id = NEW.cotacao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'titulo_cotacao', COALESCE(v_titulo, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', NEW.protocolo,
          'tipo', 'Relatório Final'
        );
      END IF;

    -- Encaminhamentos
    WHEN 'encaminhamentos_processo' THEN
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.processo_numero,
          'nome_arquivo', COALESCE(OLD.nome_arquivo, 'N/A'),
          'protocolo', OLD.protocolo,
          'tipo', 'Encaminhamento de Processo'
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.processo_numero,
          'nome_arquivo', COALESCE(NEW.nome_arquivo, 'N/A'),
          'protocolo', NEW.protocolo,
          'tipo', 'Encaminhamento de Processo'
        );
      END IF;

    -- Planilhas de lances
    WHEN 'planilhas_lances_selecao' THEN
      IF TG_OP = 'DELETE' THEN
        SELECT s.titulo_selecao, p.numero_processo_interno
        INTO v_selecao, v_numero_processo
        FROM selecoes_fornecedores s
        JOIN processos_compras p ON s.processo_compra_id = p.id
        WHERE s.id = OLD.selecao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'selecao', COALESCE(v_selecao, 'N/A'),
          'nome_arquivo', OLD.nome_arquivo,
          'protocolo', COALESCE(OLD.protocolo, NULL),
          'tipo', 'Planilha de Lances'
        );
      ELSE
        SELECT s.titulo_selecao, p.numero_processo_interno
        INTO v_selecao, v_numero_processo
        FROM selecoes_fornecedores s
        JOIN processos_compras p ON s.processo_compra_id = p.id
        WHERE s.id = NEW.selecao_id;
        
        v_detalhes := jsonb_build_object(
          'numero_processo', COALESCE(v_numero_processo, 'N/A'),
          'selecao', COALESCE(v_selecao, 'N/A'),
          'nome_arquivo', NEW.nome_arquivo,
          'protocolo', COALESCE(NEW.protocolo, NULL),
          'tipo', 'Planilha de Lances'
        );
      END IF;

    -- Caso padrão
    ELSE
      v_detalhes := jsonb_build_object('tabela', TG_TABLE_NAME);
  END CASE;

  -- Inserir registro de auditoria
  INSERT INTO audit_logs (
    entidade,
    entidade_id,
    acao,
    detalhes,
    usuario_id,
    usuario_nome,
    usuario_tipo
  ) VALUES (
    TG_TABLE_NAME,
    v_entidade_id,
    v_acao,
    v_detalhes,
    v_usuario_id,
    v_usuario_nome,
    'interno'
  );

  -- Retornar registro apropriado
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  ELSE
    RETURN NEW;
  END IF;
END;
$function$;
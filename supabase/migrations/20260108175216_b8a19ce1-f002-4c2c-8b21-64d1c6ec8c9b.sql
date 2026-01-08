-- Atualizar função de auditoria para incluir mais detalhes (número do processo, nomes bonitos)
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
  v_processo_numero text;
  v_nome_bonito text;
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
  
  -- Mapear nomes amigáveis e buscar número do processo quando aplicável
  CASE TG_TABLE_NAME
    WHEN 'processos_compras' THEN 
      v_entidade := 'Processo de Compra';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.numero_processo_interno,
          'objeto', LEFT(OLD.objeto_resumido, 80),
          'nome_documento', 'Processo ' || OLD.numero_processo_interno
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.numero_processo_interno,
          'objeto', LEFT(NEW.objeto_resumido, 80),
          'nome_documento', 'Processo ' || NEW.numero_processo_interno
        );
      END IF;
      
    WHEN 'anexos_processo_compra' THEN
      -- Buscar número do processo
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM processos_compras pc WHERE pc.id = OLD.processo_compra_id;
        
        -- Criar nome bonito baseado no tipo
        v_nome_bonito := CASE OLD.tipo_anexo
          WHEN 'processo_completo' THEN 'Processo Completo (Mesclado)'
          WHEN 'capa_processo' THEN 'Capa do Processo'
          WHEN 'termo_referencia' THEN 'Termo de Referência'
          WHEN 'requisicao' THEN 'Requisição de Compra'
          WHEN 'autorizacao_despesa' THEN 'Autorização de Despesa'
          ELSE OLD.tipo_anexo
        END;
        
        v_entidade := v_nome_bonito;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'tipo', OLD.tipo_anexo,
          'nome_arquivo', OLD.nome_arquivo,
          'nome_documento', v_nome_bonito || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM processos_compras pc WHERE pc.id = NEW.processo_compra_id;
        
        v_nome_bonito := CASE NEW.tipo_anexo
          WHEN 'processo_completo' THEN 'Processo Completo (Mesclado)'
          WHEN 'capa_processo' THEN 'Capa do Processo'
          WHEN 'termo_referencia' THEN 'Termo de Referência'
          WHEN 'requisicao' THEN 'Requisição de Compra'
          WHEN 'autorizacao_despesa' THEN 'Autorização de Despesa'
          ELSE NEW.tipo_anexo
        END;
        
        v_entidade := v_nome_bonito;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'tipo', NEW.tipo_anexo,
          'nome_arquivo', NEW.nome_arquivo,
          'nome_documento', v_nome_bonito || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'cotacoes_precos' THEN 
      v_entidade := 'Cotação de Preços';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM processos_compras pc WHERE pc.id = OLD.processo_compra_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'titulo', OLD.titulo_cotacao,
          'nome_documento', 'Cotação: ' || OLD.titulo_cotacao || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM processos_compras pc WHERE pc.id = NEW.processo_compra_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'titulo', NEW.titulo_cotacao,
          'nome_documento', 'Cotação: ' || NEW.titulo_cotacao || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'selecoes_fornecedores' THEN 
      v_entidade := 'Seleção de Fornecedores';
      IF TG_OP = 'DELETE' THEN
        -- Buscar processo via cotação
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = OLD.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'titulo', OLD.titulo_selecao,
          'numero_selecao', OLD.numero_selecao,
          'nome_documento', 'Seleção ' || OLD.numero_selecao || ': ' || OLD.titulo_selecao || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = NEW.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'titulo', NEW.titulo_selecao,
          'numero_selecao', NEW.numero_selecao,
          'nome_documento', 'Seleção ' || NEW.numero_selecao || ': ' || NEW.titulo_selecao || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'atas_selecao' THEN 
      v_entidade := 'Ata de Seleção';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_nome_bonito
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = OLD.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'selecao', v_nome_bonito,
          'nome_documento', 'Ata de Seleção - ' || COALESCE(v_nome_bonito, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_nome_bonito
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = NEW.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'selecao', v_nome_bonito,
          'nome_documento', 'Ata de Seleção - ' || COALESCE(v_nome_bonito, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'homologacoes_selecao' THEN 
      v_entidade := 'Homologação';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_nome_bonito
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = OLD.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'selecao', v_nome_bonito,
          'nome_documento', 'Homologação - ' || COALESCE(v_nome_bonito, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_nome_bonito
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = NEW.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'selecao', v_nome_bonito,
          'nome_documento', 'Homologação - ' || COALESCE(v_nome_bonito, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'autorizacoes_processo' THEN 
      IF TG_OP = 'DELETE' THEN
        v_nome_bonito := CASE OLD.tipo_autorizacao
          WHEN 'compra_direta' THEN 'Autorização de Compra Direta'
          WHEN 'selecao' THEN 'Autorização de Seleção'
          ELSE 'Autorização de Despesa'
        END;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = OLD.cotacao_id;
        v_entidade := v_nome_bonito;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'tipo', OLD.tipo_autorizacao,
          'nome_documento', v_nome_bonito || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        v_nome_bonito := CASE NEW.tipo_autorizacao
          WHEN 'compra_direta' THEN 'Autorização de Compra Direta'
          WHEN 'selecao' THEN 'Autorização de Seleção'
          ELSE 'Autorização de Despesa'
        END;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = NEW.cotacao_id;
        v_entidade := v_nome_bonito;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'tipo', NEW.tipo_autorizacao,
          'nome_documento', v_nome_bonito || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'encaminhamentos_processo' THEN 
      v_entidade := 'Encaminhamento';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.processo_numero,
          'protocolo', OLD.protocolo,
          'nome_documento', 'Encaminhamento - ' || COALESCE(OLD.processo_numero, '')
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.processo_numero,
          'protocolo', NEW.protocolo,
          'nome_documento', 'Encaminhamento - ' || COALESCE(NEW.processo_numero, '')
        );
      END IF;
      
    WHEN 'encaminhamentos_contabilidade' THEN 
      v_entidade := 'Encaminhamento à Contabilidade';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.processo_numero,
          'protocolo', OLD.protocolo,
          'nome_documento', 'Encaminhamento à Contabilidade - ' || COALESCE(OLD.processo_numero, '')
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.processo_numero,
          'protocolo', NEW.protocolo,
          'nome_documento', 'Encaminhamento à Contabilidade - ' || COALESCE(NEW.processo_numero, '')
        );
      END IF;
      
    WHEN 'relatorios_finais' THEN 
      v_entidade := 'Relatório Final';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = OLD.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'nome_documento', 'Relatório Final - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = NEW.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'nome_documento', 'Relatório Final - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'analises_compliance' THEN 
      v_entidade := 'Análise de Compliance';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'numero_processo', OLD.processo_numero,
          'protocolo', OLD.protocolo,
          'nome_documento', 'Análise de Compliance - ' || COALESCE(OLD.processo_numero, '')
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'numero_processo', NEW.processo_numero,
          'protocolo', NEW.protocolo,
          'nome_documento', 'Análise de Compliance - ' || COALESCE(NEW.processo_numero, '')
        );
      END IF;
      
    WHEN 'planilhas_consolidadas' THEN 
      v_entidade := 'Planilha Consolidada';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = OLD.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'nome_documento', 'Planilha Consolidada - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = NEW.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'nome_documento', 'Planilha Consolidada - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'planilhas_habilitacao' THEN 
      v_entidade := 'Planilha de Habilitação';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = OLD.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'nome_documento', 'Planilha de Habilitação - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = NEW.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'nome_documento', 'Planilha de Habilitação - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'cotacao_respostas_fornecedor' THEN 
      v_entidade := 'Proposta de Cotação';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = OLD.fornecedor_id;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = OLD.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Proposta de Cotação - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = NEW.fornecedor_id;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM cotacoes_precos cp
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE cp.id = NEW.cotacao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Proposta de Cotação - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'selecao_propostas_fornecedor' THEN 
      v_entidade := 'Proposta de Seleção';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = OLD.fornecedor_id;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = OLD.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Proposta de Seleção - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = NEW.fornecedor_id;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = NEW.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Proposta de Seleção - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'recursos_fornecedor' THEN 
      v_entidade := 'Recurso de Fornecedor';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = OLD.fornecedor_id;
        v_detalhes := jsonb_build_object(
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Recurso - ' || COALESCE(v_usuario_nome, '')
        );
      ELSE
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = NEW.fornecedor_id;
        v_detalhes := jsonb_build_object(
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Recurso - ' || COALESCE(v_usuario_nome, '')
        );
      END IF;
      
    WHEN 'recursos_inabilitacao_selecao' THEN 
      v_entidade := 'Recurso de Inabilitação';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = OLD.fornecedor_id;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = OLD.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Recurso de Inabilitação - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT f.razao_social INTO v_usuario_nome FROM fornecedores f WHERE f.id = NEW.fornecedor_id;
        SELECT pc.numero_processo_interno INTO v_processo_numero
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = NEW.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'fornecedor', v_usuario_nome,
          'nome_documento', 'Recurso de Inabilitação - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'respostas_recursos' THEN 
      v_entidade := 'Resposta de Recurso';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'protocolo', OLD.protocolo,
          'nome_documento', 'Resposta de Recurso - ' || COALESCE(OLD.protocolo, '')
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'protocolo', NEW.protocolo,
          'nome_documento', 'Resposta de Recurso - ' || COALESCE(NEW.protocolo, '')
        );
      END IF;
      
    WHEN 'anexos_selecao' THEN
      IF TG_OP = 'DELETE' THEN
        v_nome_bonito := CASE OLD.tipo_documento
          WHEN 'aviso_selecao' THEN 'Aviso de Seleção'
          WHEN 'edital_selecao' THEN 'Edital de Seleção'
          WHEN 'aviso_credenciamento' THEN 'Aviso de Credenciamento'
          WHEN 'edital_credenciamento' THEN 'Edital de Credenciamento'
          ELSE OLD.tipo_documento
        END;
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_usuario_nome
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = OLD.selecao_id;
        v_entidade := v_nome_bonito;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'tipo', OLD.tipo_documento,
          'nome_arquivo', OLD.nome_arquivo,
          'selecao', v_usuario_nome,
          'nome_documento', v_nome_bonito || ' - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        v_nome_bonito := CASE NEW.tipo_documento
          WHEN 'aviso_selecao' THEN 'Aviso de Seleção'
          WHEN 'edital_selecao' THEN 'Edital de Seleção'
          WHEN 'aviso_credenciamento' THEN 'Aviso de Credenciamento'
          WHEN 'edital_credenciamento' THEN 'Edital de Credenciamento'
          ELSE NEW.tipo_documento
        END;
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_usuario_nome
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = NEW.selecao_id;
        v_entidade := v_nome_bonito;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'tipo', NEW.tipo_documento,
          'nome_arquivo', NEW.nome_arquivo,
          'selecao', v_usuario_nome,
          'nome_documento', v_nome_bonito || ' - ' || COALESCE(v_usuario_nome, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      END IF;
      
    WHEN 'contratos_gestao' THEN 
      v_entidade := 'Contrato de Gestão';
      IF TG_OP = 'DELETE' THEN
        v_detalhes := jsonb_build_object(
          'nome', OLD.nome_contrato,
          'ente', OLD.ente_federativo,
          'nome_documento', 'Contrato: ' || COALESCE(OLD.nome_contrato, '') || ' - ' || COALESCE(OLD.ente_federativo, '')
        );
      ELSE
        v_detalhes := jsonb_build_object(
          'nome', NEW.nome_contrato,
          'ente', NEW.ente_federativo,
          'nome_documento', 'Contrato: ' || COALESCE(NEW.nome_contrato, '') || ' - ' || COALESCE(NEW.ente_federativo, '')
        );
      END IF;
      
    WHEN 'fornecedores' THEN 
      v_entidade := 'Cadastro de Fornecedor';
      v_usuario_tipo := 'fornecedor';
      IF TG_OP = 'DELETE' THEN
        v_usuario_nome := OLD.razao_social;
        v_detalhes := jsonb_build_object(
          'razao_social', OLD.razao_social,
          'cnpj', OLD.cnpj,
          'nome_documento', 'Fornecedor: ' || COALESCE(OLD.razao_social, '') || ' - ' || COALESCE(OLD.cnpj, '')
        );
      ELSE
        v_usuario_nome := NEW.razao_social;
        v_detalhes := jsonb_build_object(
          'razao_social', NEW.razao_social,
          'cnpj', NEW.cnpj,
          'nome_documento', 'Fornecedor: ' || COALESCE(NEW.razao_social, '') || ' - ' || COALESCE(NEW.cnpj, '')
        );
      END IF;
      
    WHEN 'profiles' THEN 
      v_entidade := 'Usuário';
      IF TG_OP = 'DELETE' THEN
        v_usuario_nome := OLD.nome_completo;
        v_detalhes := jsonb_build_object(
          'nome', OLD.nome_completo,
          'email', OLD.email,
          'nome_documento', 'Usuário: ' || COALESCE(OLD.nome_completo, '') || ' - ' || COALESCE(OLD.email, '')
        );
      ELSE
        v_usuario_nome := NEW.nome_completo;
        v_detalhes := jsonb_build_object(
          'nome', NEW.nome_completo,
          'email', NEW.email,
          'nome_documento', 'Usuário: ' || COALESCE(NEW.nome_completo, '') || ' - ' || COALESCE(NEW.email, '')
        );
      END IF;
      
    WHEN 'planilhas_lances_selecao' THEN
      v_entidade := 'Planilha de Lances';
      IF TG_OP = 'DELETE' THEN
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_nome_bonito
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = OLD.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', OLD.protocolo,
          'nome_arquivo', OLD.nome_arquivo,
          'selecao', v_nome_bonito,
          'nome_documento', 'Planilha de Lances - ' || COALESCE(v_nome_bonito, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
      ELSE
        SELECT pc.numero_processo_interno, sf.titulo_selecao INTO v_processo_numero, v_nome_bonito
        FROM selecoes_fornecedores sf
        JOIN cotacoes_precos cp ON cp.id = sf.cotacao_id
        JOIN processos_compras pc ON pc.id = cp.processo_compra_id
        WHERE sf.id = NEW.selecao_id;
        v_detalhes := jsonb_build_object(
          'numero_processo', v_processo_numero,
          'protocolo', NEW.protocolo,
          'nome_arquivo', NEW.nome_arquivo,
          'selecao', v_nome_bonito,
          'nome_documento', 'Planilha de Lances - ' || COALESCE(v_nome_bonito, '') || ' - ' || COALESCE(v_processo_numero, '')
        );
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

-- Adicionar trigger faltante para anexos_processo_compra (inclui Processo Completo)
DROP TRIGGER IF EXISTS audit_anexos_processo_compra ON anexos_processo_compra;
CREATE TRIGGER audit_anexos_processo_compra
  AFTER INSERT OR DELETE ON anexos_processo_compra
  FOR EACH ROW EXECUTE FUNCTION registrar_auditoria();
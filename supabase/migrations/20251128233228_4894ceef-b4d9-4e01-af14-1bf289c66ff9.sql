-- ============================================
-- MIGRATION: Implementar CASCADE DELETE e limpeza automática de arquivos
-- ============================================

-- 1. ANEXOS DE PROCESSO (arquivos no storage)
ALTER TABLE anexos_processo_compra
DROP CONSTRAINT IF EXISTS anexos_processo_compra_processo_compra_id_fkey,
ADD CONSTRAINT anexos_processo_compra_processo_compra_id_fkey
  FOREIGN KEY (processo_compra_id)
  REFERENCES processos_compras(id)
  ON DELETE CASCADE;

-- 2. COTAÇÕES DE PREÇOS
ALTER TABLE cotacoes_precos
DROP CONSTRAINT IF EXISTS cotacoes_precos_processo_compra_id_fkey,
ADD CONSTRAINT cotacoes_precos_processo_compra_id_fkey
  FOREIGN KEY (processo_compra_id)
  REFERENCES processos_compras(id)
  ON DELETE CASCADE;

-- 3. ITENS DE COTAÇÃO
ALTER TABLE itens_cotacao
DROP CONSTRAINT IF EXISTS itens_cotacao_cotacao_id_fkey,
ADD CONSTRAINT itens_cotacao_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 4. LOTES DE COTAÇÃO
ALTER TABLE lotes_cotacao
DROP CONSTRAINT IF EXISTS lotes_cotacao_cotacao_id_fkey,
ADD CONSTRAINT lotes_cotacao_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 5. CONVITES DE FORNECEDORES PARA COTAÇÃO
ALTER TABLE cotacao_fornecedor_convites
DROP CONSTRAINT IF EXISTS cotacao_fornecedor_convites_cotacao_id_fkey,
ADD CONSTRAINT cotacao_fornecedor_convites_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 6. RESPOSTAS DE FORNECEDORES EM COTAÇÃO
ALTER TABLE cotacao_respostas_fornecedor
DROP CONSTRAINT IF EXISTS cotacao_respostas_fornecedor_cotacao_id_fkey,
ADD CONSTRAINT cotacao_respostas_fornecedor_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 7. ITENS DE RESPOSTA DE FORNECEDOR
ALTER TABLE respostas_itens_fornecedor
DROP CONSTRAINT IF EXISTS respostas_itens_fornecedor_cotacao_resposta_fornecedor_id_fkey,
ADD CONSTRAINT respostas_itens_fornecedor_cotacao_resposta_fornecedor_id_fkey
  FOREIGN KEY (cotacao_resposta_fornecedor_id)
  REFERENCES cotacao_respostas_fornecedor(id)
  ON DELETE CASCADE;

ALTER TABLE respostas_itens_fornecedor
DROP CONSTRAINT IF EXISTS respostas_itens_fornecedor_item_cotacao_id_fkey,
ADD CONSTRAINT respostas_itens_fornecedor_item_cotacao_id_fkey
  FOREIGN KEY (item_cotacao_id)
  REFERENCES itens_cotacao(id)
  ON DELETE CASCADE;

-- 8. ANEXOS DE RESPOSTAS DE FORNECEDOR
ALTER TABLE anexos_cotacao_fornecedor
DROP CONSTRAINT IF EXISTS anexos_cotacao_fornecedor_cotacao_resposta_fornecedor_id_fkey,
ADD CONSTRAINT anexos_cotacao_fornecedor_cotacao_resposta_fornecedor_id_fkey
  FOREIGN KEY (cotacao_resposta_fornecedor_id)
  REFERENCES cotacao_respostas_fornecedor(id)
  ON DELETE CASCADE;

-- 9. FORNECEDORES REJEITADOS EM COTAÇÃO
ALTER TABLE fornecedores_rejeitados_cotacao
DROP CONSTRAINT IF EXISTS fornecedores_rejeitados_cotacao_cotacao_id_fkey,
ADD CONSTRAINT fornecedores_rejeitados_cotacao_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 10. RECURSOS DE FORNECEDOR (relacionados a rejeição)
ALTER TABLE recursos_fornecedor
DROP CONSTRAINT IF EXISTS recursos_fornecedor_rejeicao_id_fkey,
ADD CONSTRAINT recursos_fornecedor_rejeicao_id_fkey
  FOREIGN KEY (rejeicao_id)
  REFERENCES fornecedores_rejeitados_cotacao(id)
  ON DELETE CASCADE;

-- 11. RESPOSTAS DE RECURSOS
ALTER TABLE respostas_recursos
DROP CONSTRAINT IF EXISTS respostas_recursos_recurso_id_fkey,
ADD CONSTRAINT respostas_recursos_recurso_id_fkey
  FOREIGN KEY (recurso_id)
  REFERENCES recursos_fornecedor(id)
  ON DELETE CASCADE;

-- 12. CAMPOS DE DOCUMENTOS DE FINALIZAÇÃO (cotação)
ALTER TABLE campos_documentos_finalizacao
DROP CONSTRAINT IF EXISTS campos_documentos_finalizacao_cotacao_id_fkey,
ADD CONSTRAINT campos_documentos_finalizacao_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 13. DOCUMENTOS DE FINALIZAÇÃO DE FORNECEDOR
ALTER TABLE documentos_finalizacao_fornecedor
DROP CONSTRAINT IF EXISTS documentos_finalizacao_fornecedor_campo_documento_id_fkey,
ADD CONSTRAINT documentos_finalizacao_fornecedor_campo_documento_id_fkey
  FOREIGN KEY (campo_documento_id)
  REFERENCES campos_documentos_finalizacao(id)
  ON DELETE CASCADE;

-- 14. ANÁLISES DE COMPLIANCE
ALTER TABLE analises_compliance
DROP CONSTRAINT IF EXISTS analises_compliance_cotacao_id_fkey,
ADD CONSTRAINT analises_compliance_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 15. PLANILHAS CONSOLIDADAS
ALTER TABLE planilhas_consolidadas
DROP CONSTRAINT IF EXISTS planilhas_consolidadas_cotacao_id_fkey,
ADD CONSTRAINT planilhas_consolidadas_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 16. AUTORIZAÇÕES DE PROCESSO
ALTER TABLE autorizacoes_processo
DROP CONSTRAINT IF EXISTS autorizacoes_processo_cotacao_id_fkey,
ADD CONSTRAINT autorizacoes_processo_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 17. RELATÓRIOS FINAIS
ALTER TABLE relatorios_finais
DROP CONSTRAINT IF EXISTS relatorios_finais_cotacao_id_fkey,
ADD CONSTRAINT relatorios_finais_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 18. ENCAMINHAMENTOS DE PROCESSO
ALTER TABLE encaminhamentos_processo
DROP CONSTRAINT IF EXISTS encaminhamentos_processo_cotacao_id_fkey,
ADD CONSTRAINT encaminhamentos_processo_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 19. EMAILS ANEXADOS À COTAÇÃO
ALTER TABLE emails_cotacao_anexados
DROP CONSTRAINT IF EXISTS emails_cotacao_anexados_cotacao_id_fkey,
ADD CONSTRAINT emails_cotacao_anexados_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 20. DOCUMENTOS DE PROCESSO FINALIZADO
ALTER TABLE documentos_processo_finalizado
DROP CONSTRAINT IF EXISTS documentos_processo_finalizado_cotacao_id_fkey,
ADD CONSTRAINT documentos_processo_finalizado_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 21. SOLICITAÇÕES DE AUTORIZAÇÃO
ALTER TABLE solicitacoes_autorizacao
DROP CONSTRAINT IF EXISTS solicitacoes_autorizacao_cotacao_id_fkey,
ADD CONSTRAINT solicitacoes_autorizacao_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- ============================================
-- SELEÇÕES DE FORNECEDORES
-- ============================================

-- 22. SELEÇÕES DE FORNECEDORES
ALTER TABLE selecoes_fornecedores
DROP CONSTRAINT IF EXISTS selecoes_fornecedores_processo_compra_id_fkey,
ADD CONSTRAINT selecoes_fornecedores_processo_compra_id_fkey
  FOREIGN KEY (processo_compra_id)
  REFERENCES processos_compras(id)
  ON DELETE CASCADE;

-- 23. CONVITES DE SELEÇÃO
ALTER TABLE selecao_fornecedor_convites
DROP CONSTRAINT IF EXISTS selecao_fornecedor_convites_selecao_id_fkey,
ADD CONSTRAINT selecao_fornecedor_convites_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 24. PROPOSTAS DE SELEÇÃO
ALTER TABLE selecao_propostas_fornecedor
DROP CONSTRAINT IF EXISTS selecao_propostas_fornecedor_selecao_id_fkey,
ADD CONSTRAINT selecao_propostas_fornecedor_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 25. ITENS DE PROPOSTA DE SELEÇÃO
ALTER TABLE selecao_respostas_itens_fornecedor
DROP CONSTRAINT IF EXISTS selecao_respostas_itens_fornecedor_proposta_id_fkey,
ADD CONSTRAINT selecao_respostas_itens_fornecedor_proposta_id_fkey
  FOREIGN KEY (proposta_id)
  REFERENCES selecao_propostas_fornecedor(id)
  ON DELETE CASCADE;

-- 26. LANCES DE FORNECEDORES
ALTER TABLE lances_fornecedores
DROP CONSTRAINT IF EXISTS lances_fornecedores_selecao_id_fkey,
ADD CONSTRAINT lances_fornecedores_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 27. ITENS ABERTOS PARA LANCES
ALTER TABLE itens_abertos_lances
DROP CONSTRAINT IF EXISTS itens_abertos_lances_selecao_id_fkey,
ADD CONSTRAINT itens_abertos_lances_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 28. MENSAGENS DE NEGOCIAÇÃO
ALTER TABLE mensagens_negociacao
DROP CONSTRAINT IF EXISTS mensagens_negociacao_selecao_id_fkey,
ADD CONSTRAINT mensagens_negociacao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 29. MENSAGENS DA SELEÇÃO
ALTER TABLE mensagens_selecao
DROP CONSTRAINT IF EXISTS mensagens_selecao_selecao_id_fkey,
ADD CONSTRAINT mensagens_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 30. FORNECEDORES INABILITADOS EM SELEÇÃO
ALTER TABLE fornecedores_inabilitados_selecao
DROP CONSTRAINT IF EXISTS fornecedores_inabilitados_selecao_selecao_id_fkey,
ADD CONSTRAINT fornecedores_inabilitados_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 31. RECURSOS DE INABILITAÇÃO
ALTER TABLE recursos_inabilitacao_selecao
DROP CONSTRAINT IF EXISTS recursos_inabilitacao_selecao_selecao_id_fkey,
ADD CONSTRAINT recursos_inabilitacao_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

ALTER TABLE recursos_inabilitacao_selecao
DROP CONSTRAINT IF EXISTS recursos_inabilitacao_selecao_inabilitacao_id_fkey,
ADD CONSTRAINT recursos_inabilitacao_selecao_inabilitacao_id_fkey
  FOREIGN KEY (inabilitacao_id)
  REFERENCES fornecedores_inabilitados_selecao(id)
  ON DELETE CASCADE;

-- 32. INTENÇÕES DE RECURSO
ALTER TABLE intencoes_recurso_selecao
DROP CONSTRAINT IF EXISTS intencoes_recurso_selecao_selecao_id_fkey,
ADD CONSTRAINT intencoes_recurso_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 33. ANEXOS DE SELEÇÃO
ALTER TABLE anexos_selecao
DROP CONSTRAINT IF EXISTS anexos_selecao_selecao_id_fkey,
ADD CONSTRAINT anexos_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 34. ATAS DE SELEÇÃO
ALTER TABLE atas_selecao
DROP CONSTRAINT IF EXISTS atas_selecao_selecao_id_fkey,
ADD CONSTRAINT atas_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 35. ASSINATURAS DE FORNECEDORES EM ATAS
ALTER TABLE atas_assinaturas_fornecedor
DROP CONSTRAINT IF EXISTS atas_assinaturas_fornecedor_ata_id_fkey,
ADD CONSTRAINT atas_assinaturas_fornecedor_ata_id_fkey
  FOREIGN KEY (ata_id)
  REFERENCES atas_selecao(id)
  ON DELETE CASCADE;

-- 36. ASSINATURAS DE USUÁRIOS EM ATAS
ALTER TABLE atas_assinaturas_usuario
DROP CONSTRAINT IF EXISTS atas_assinaturas_usuario_ata_id_fkey,
ADD CONSTRAINT atas_assinaturas_usuario_ata_id_fkey
  FOREIGN KEY (ata_id)
  REFERENCES atas_selecao(id)
  ON DELETE CASCADE;

-- 37. HOMOLOGAÇÕES DE SELEÇÃO
ALTER TABLE homologacoes_selecao
DROP CONSTRAINT IF EXISTS homologacoes_selecao_selecao_id_fkey,
ADD CONSTRAINT homologacoes_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 38. PLANILHAS DE LANCES
ALTER TABLE planilhas_lances_selecao
DROP CONSTRAINT IF EXISTS planilhas_lances_selecao_selecao_id_fkey,
ADD CONSTRAINT planilhas_lances_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 39. CAMPOS DE DOCUMENTOS DE FINALIZAÇÃO (seleção)
ALTER TABLE campos_documentos_finalizacao
DROP CONSTRAINT IF EXISTS campos_documentos_finalizacao_selecao_id_fkey,
ADD CONSTRAINT campos_documentos_finalizacao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- 40. SOLICITAÇÕES DE AUTORIZAÇÃO DE SELEÇÃO
ALTER TABLE solicitacoes_autorizacao_selecao
DROP CONSTRAINT IF EXISTS solicitacoes_autorizacao_selecao_cotacao_id_fkey,
ADD CONSTRAINT solicitacoes_autorizacao_selecao_cotacao_id_fkey
  FOREIGN KEY (cotacao_id)
  REFERENCES cotacoes_precos(id)
  ON DELETE CASCADE;

-- 41. SOLICITAÇÕES DE HOMOLOGAÇÃO
ALTER TABLE solicitacoes_homologacao_selecao
DROP CONSTRAINT IF EXISTS solicitacoes_homologacao_selecao_selecao_id_fkey,
ADD CONSTRAINT solicitacoes_homologacao_selecao_selecao_id_fkey
  FOREIGN KEY (selecao_id)
  REFERENCES selecoes_fornecedores(id)
  ON DELETE CASCADE;

-- ============================================
-- TRIGGERS PARA DELETAR ARQUIVOS DO STORAGE
-- ============================================

-- Trigger para deletar anexos de processo do storage
CREATE OR REPLACE FUNCTION delete_processo_anexo_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Extrair o caminho do arquivo da URL e deletar do storage
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_processo_anexo_storage
BEFORE DELETE ON anexos_processo_compra
FOR EACH ROW
EXECUTE FUNCTION delete_processo_anexo_storage();

-- Trigger para deletar PDFs de análise de compliance
CREATE OR REPLACE FUNCTION delete_compliance_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.url_documento IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_documento from 'processo-anexos/(.+)')
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_compliance_storage
BEFORE DELETE ON analises_compliance
FOR EACH ROW
EXECUTE FUNCTION delete_compliance_storage();

-- Trigger para deletar planilhas consolidadas
CREATE OR REPLACE FUNCTION delete_planilha_consolidada_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_planilha_storage
BEFORE DELETE ON planilhas_consolidadas
FOR EACH ROW
EXECUTE FUNCTION delete_planilha_consolidada_storage();

-- Trigger para deletar autorizações
CREATE OR REPLACE FUNCTION delete_autorizacao_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_autorizacao_storage
BEFORE DELETE ON autorizacoes_processo
FOR EACH ROW
EXECUTE FUNCTION delete_autorizacao_storage();

-- Trigger para deletar relatórios finais
CREATE OR REPLACE FUNCTION delete_relatorio_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_relatorio_storage
BEFORE DELETE ON relatorios_finais
FOR EACH ROW
EXECUTE FUNCTION delete_relatorio_storage();

-- Trigger para deletar encaminhamentos
CREATE OR REPLACE FUNCTION delete_encaminhamento_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_encaminhamento_storage
BEFORE DELETE ON encaminhamentos_processo
FOR EACH ROW
EXECUTE FUNCTION delete_encaminhamento_storage();

-- Trigger para deletar anexos de email de cotação
CREATE OR REPLACE FUNCTION delete_email_anexo_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_email_anexo_storage
BEFORE DELETE ON emails_cotacao_anexados
FOR EACH ROW
EXECUTE FUNCTION delete_email_anexo_storage();

-- Trigger para deletar anexos de resposta de fornecedor
CREATE OR REPLACE FUNCTION delete_anexo_cotacao_fornecedor_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_anexo_cotacao_fornecedor_storage
BEFORE DELETE ON anexos_cotacao_fornecedor
FOR EACH ROW
EXECUTE FUNCTION delete_anexo_cotacao_fornecedor_storage();

-- Trigger para deletar PDFs de recursos de fornecedor
CREATE OR REPLACE FUNCTION delete_recurso_fornecedor_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.url_arquivo IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_arquivo from 'processo-anexos/(.+)')
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_recurso_fornecedor_storage
BEFORE DELETE ON recursos_fornecedor
FOR EACH ROW
EXECUTE FUNCTION delete_recurso_fornecedor_storage();

-- Trigger para deletar PDFs de respostas a recursos
CREATE OR REPLACE FUNCTION delete_resposta_recurso_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.url_arquivo IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_arquivo from 'processo-anexos/(.+)')
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_resposta_recurso_storage
BEFORE DELETE ON respostas_recursos
FOR EACH ROW
EXECUTE FUNCTION delete_resposta_recurso_storage();

-- Trigger para deletar documentos de finalização
CREATE OR REPLACE FUNCTION delete_documento_finalizacao_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_documento_finalizacao_storage
BEFORE DELETE ON documentos_finalizacao_fornecedor
FOR EACH ROW
EXECUTE FUNCTION delete_documento_finalizacao_storage();

-- Triggers para SELEÇÃO DE FORNECEDORES

-- Trigger para deletar anexos de seleção
CREATE OR REPLACE FUNCTION delete_anexo_selecao_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_anexo_selecao_storage
BEFORE DELETE ON anexos_selecao
FOR EACH ROW
EXECUTE FUNCTION delete_anexo_selecao_storage();

-- Trigger para deletar atas de seleção
CREATE OR REPLACE FUNCTION delete_ata_selecao_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Deletar arquivo principal
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  
  -- Deletar arquivo original se existir
  IF OLD.url_arquivo_original IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_arquivo_original from 'processo-anexos/(.+)')
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_ata_selecao_storage
BEFORE DELETE ON atas_selecao
FOR EACH ROW
EXECUTE FUNCTION delete_ata_selecao_storage();

-- Trigger para deletar homologações
CREATE OR REPLACE FUNCTION delete_homologacao_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_homologacao_storage
BEFORE DELETE ON homologacoes_selecao
FOR EACH ROW
EXECUTE FUNCTION delete_homologacao_storage();

-- Trigger para deletar planilhas de lances
CREATE OR REPLACE FUNCTION delete_planilha_lances_storage()
RETURNS TRIGGER AS $$
BEGIN
  PERFORM storage.delete_object(
    'processo-anexos',
    substring(OLD.url_arquivo from 'processo-anexos/(.+)')
  );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_planilha_lances_storage
BEFORE DELETE ON planilhas_lances_selecao
FOR EACH ROW
EXECUTE FUNCTION delete_planilha_lances_storage();

-- Trigger para deletar PDFs de recursos de inabilitação
CREATE OR REPLACE FUNCTION delete_recurso_inabilitacao_storage()
RETURNS TRIGGER AS $$
BEGIN
  -- Deletar PDF do recurso se existir
  IF OLD.url_pdf_recurso IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_pdf_recurso from 'processo-anexos/(.+)')
    );
  END IF;
  
  -- Deletar PDF da resposta se existir
  IF OLD.url_pdf_resposta IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_pdf_resposta from 'processo-anexos/(.+)')
    );
  END IF;
  
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_recurso_inabilitacao_storage
BEFORE DELETE ON recursos_inabilitacao_selecao
FOR EACH ROW
EXECUTE FUNCTION delete_recurso_inabilitacao_storage();

-- Trigger para deletar PDFs de propostas de seleção
CREATE OR REPLACE FUNCTION delete_proposta_selecao_storage()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.url_pdf_proposta IS NOT NULL THEN
    PERFORM storage.delete_object(
      'processo-anexos',
      substring(OLD.url_pdf_proposta from 'processo-anexos/(.+)')
    );
  END IF;
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, storage;

CREATE TRIGGER trigger_delete_proposta_selecao_storage
BEFORE DELETE ON selecao_propostas_fornecedor
FOR EACH ROW
EXECUTE FUNCTION delete_proposta_selecao_storage();
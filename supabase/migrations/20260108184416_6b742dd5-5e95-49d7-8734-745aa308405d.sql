-- Remover todos os triggers de auditoria restantes
DROP TRIGGER IF EXISTS audit_encaminhamentos_contabilidade ON encaminhamentos_contabilidade;
DROP TRIGGER IF EXISTS audit_cotacao_respostas ON cotacao_respostas_fornecedor;
DROP TRIGGER IF EXISTS audit_selecao_propostas ON selecao_propostas_fornecedor;
DROP TRIGGER IF EXISTS audit_recursos_fornecedor ON recursos_fornecedor;
DROP TRIGGER IF EXISTS audit_recursos_inabilitacao ON recursos_inabilitacao_selecao;
DROP TRIGGER IF EXISTS audit_respostas_recursos ON respostas_recursos;
DROP TRIGGER IF EXISTS audit_anexos_selecao ON anexos_selecao;
DROP TRIGGER IF EXISTS audit_contratos_gestao ON contratos_gestao;
DROP TRIGGER IF EXISTS audit_fornecedores ON fornecedores;
DROP TRIGGER IF EXISTS audit_profiles ON profiles;
DROP TRIGGER IF EXISTS audit_planilhas_lances ON planilhas_lances_selecao;
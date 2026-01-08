-- Remover todos os triggers de auditoria adicionados
DROP TRIGGER IF EXISTS audit_processos_compras ON processos_compras;
DROP TRIGGER IF EXISTS audit_cotacoes_precos ON cotacoes_precos;
DROP TRIGGER IF EXISTS audit_cotacao_respostas_fornecedor ON cotacao_respostas_fornecedor;
DROP TRIGGER IF EXISTS audit_selecoes_fornecedores ON selecoes_fornecedores;
DROP TRIGGER IF EXISTS audit_atas_selecao ON atas_selecao;
DROP TRIGGER IF EXISTS audit_homologacoes_selecao ON homologacoes_selecao;
DROP TRIGGER IF EXISTS audit_planilhas_consolidadas ON planilhas_consolidadas;
DROP TRIGGER IF EXISTS audit_planilhas_habilitacao ON planilhas_habilitacao;
DROP TRIGGER IF EXISTS audit_analises_compliance ON analises_compliance;
DROP TRIGGER IF EXISTS audit_autorizacoes_processo ON autorizacoes_processo;
DROP TRIGGER IF EXISTS audit_relatorios_finais ON relatorios_finais;
DROP TRIGGER IF EXISTS audit_encaminhamentos_processo ON encaminhamentos_processo;
DROP TRIGGER IF EXISTS audit_anexos_processo_compra ON anexos_processo_compra;
DROP TRIGGER IF EXISTS audit_planilhas_lances_selecao ON planilhas_lances_selecao;
CREATE OR REPLACE FUNCTION public.get_all_file_references()
 RETURNS TABLE(url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- Anexos de processos de compra
  SELECT url_arquivo AS url 
  FROM anexos_processo_compra 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Análises de compliance
  SELECT url_documento 
  FROM analises_compliance 
  WHERE url_documento IS NOT NULL
  
  UNION ALL
  
  -- Planilhas consolidadas
  SELECT url_arquivo 
  FROM planilhas_consolidadas 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Planilhas de habilitação (planilha final)
  SELECT url_arquivo 
  FROM planilhas_habilitacao 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Autorizações de processo
  SELECT url_arquivo 
  FROM autorizacoes_processo 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Relatórios finais
  SELECT url_arquivo 
  FROM relatorios_finais 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Encaminhamentos de processo
  SELECT url 
  FROM encaminhamentos_processo 
  WHERE url IS NOT NULL

  UNION ALL

  -- *** ENCAMINHAMENTOS À CONTABILIDADE (PDF) ***
  SELECT url_arquivo
  FROM encaminhamentos_contabilidade
  WHERE url_arquivo IS NOT NULL

  UNION ALL

  SELECT storage_path
  FROM encaminhamentos_contabilidade
  WHERE storage_path IS NOT NULL

  UNION ALL

  -- *** RESPOSTAS DA CONTABILIDADE (PDF) ***
  SELECT url_resposta_pdf
  FROM encaminhamentos_contabilidade
  WHERE url_resposta_pdf IS NOT NULL

  UNION ALL

  SELECT storage_path_resposta
  FROM encaminhamentos_contabilidade
  WHERE storage_path_resposta IS NOT NULL
  
  UNION ALL
  
  -- *** EMAILS ANEXADOS DE COTAÇÃO ***
  SELECT url_arquivo 
  FROM emails_cotacao_anexados 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Anexos de cotação fornecedor
  SELECT url_arquivo 
  FROM anexos_cotacao_fornecedor 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- *** PROPOSTAS PDF DE COTAÇÃO ***
  SELECT url_pdf_proposta
  FROM cotacao_respostas_fornecedor
  WHERE url_pdf_proposta IS NOT NULL
  
  UNION ALL
  
  -- Recursos de fornecedor
  SELECT url_arquivo 
  FROM recursos_fornecedor 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Documentos de finalização de fornecedor
  SELECT url_arquivo 
  FROM documentos_finalizacao_fornecedor 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Anexos de seleção
  SELECT url_arquivo 
  FROM anexos_selecao 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Atas de seleção (URL principal)
  SELECT url_arquivo 
  FROM atas_selecao 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Atas de seleção (URL original)
  SELECT url_arquivo_original 
  FROM atas_selecao 
  WHERE url_arquivo_original IS NOT NULL
  
  UNION ALL
  
  -- Homologações de seleção
  SELECT url_arquivo 
  FROM homologacoes_selecao 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Planilhas de lances de seleção
  SELECT url_arquivo 
  FROM planilhas_lances_selecao 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Recursos de inabilitação (PDF recurso)
  SELECT url_pdf_recurso 
  FROM recursos_inabilitacao_selecao 
  WHERE url_pdf_recurso IS NOT NULL
  
  UNION ALL
  
  -- Recursos de inabilitação (PDF resposta)
  SELECT url_pdf_resposta 
  FROM recursos_inabilitacao_selecao 
  WHERE url_pdf_resposta IS NOT NULL
  
  UNION ALL
  
  -- Propostas de fornecedor em seleção
  SELECT url_pdf_proposta 
  FROM selecao_propostas_fornecedor 
  WHERE url_pdf_proposta IS NOT NULL

  UNION ALL

  -- *** PROPOSTAS REALINHADAS (SELEÇÃO) ***
  SELECT url_pdf_proposta
  FROM propostas_realinhadas
  WHERE url_pdf_proposta IS NOT NULL
  
  UNION ALL
  
  -- Documentos de fornecedor (certidões, etc.)
  SELECT url_arquivo 
  FROM documentos_fornecedor 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Documentos de processo finalizado (snapshots)
  SELECT url_arquivo 
  FROM documentos_processo_finalizado 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- *** DOCUMENTOS ANTIGOS (CERTIDÕES ARQUIVADAS) ***
  SELECT url_arquivo 
  FROM documentos_antigos 
  WHERE url_arquivo IS NOT NULL
  
  UNION ALL
  
  -- Respostas de recursos
  SELECT url_documento 
  FROM respostas_recursos 
  WHERE url_documento IS NOT NULL
  
  UNION ALL
  
  -- Comprovantes de cotação fornecedor (array de URLs)
  SELECT unnest(comprovantes_urls) AS url
  FROM cotacao_respostas_fornecedor 
  WHERE comprovantes_urls IS NOT NULL AND array_length(comprovantes_urls, 1) > 0;
$function$;
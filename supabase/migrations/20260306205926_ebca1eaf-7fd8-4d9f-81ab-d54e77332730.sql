CREATE OR REPLACE FUNCTION public.get_all_file_references()
 RETURNS TABLE(url text)
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT url_arquivo AS url FROM anexos_processo_compra WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_documento FROM analises_compliance WHERE url_documento IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM planilhas_consolidadas WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM planilhas_habilitacao WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM autorizacoes_processo WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM relatorios_finais WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url FROM encaminhamentos_processo WHERE url IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM encaminhamentos_contabilidade WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT storage_path FROM encaminhamentos_contabilidade WHERE storage_path IS NOT NULL
  UNION ALL
  SELECT url_resposta_pdf FROM encaminhamentos_contabilidade WHERE url_resposta_pdf IS NOT NULL
  UNION ALL
  SELECT storage_path_resposta FROM encaminhamentos_contabilidade WHERE storage_path_resposta IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM emails_cotacao_anexados WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM anexos_cotacao_fornecedor WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_pdf_proposta FROM cotacao_respostas_fornecedor WHERE url_pdf_proposta IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM recursos_fornecedor WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM documentos_finalizacao_fornecedor WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM anexos_selecao WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM atas_selecao WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo_original FROM atas_selecao WHERE url_arquivo_original IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM homologacoes_selecao WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM planilhas_lances_selecao WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_pdf_recurso FROM recursos_inabilitacao_selecao WHERE url_pdf_recurso IS NOT NULL
  UNION ALL
  SELECT url_pdf_resposta FROM recursos_inabilitacao_selecao WHERE url_pdf_resposta IS NOT NULL
  UNION ALL
  SELECT url_pdf_proposta FROM selecao_propostas_fornecedor WHERE url_pdf_proposta IS NOT NULL
  UNION ALL
  SELECT url_pdf_proposta FROM propostas_realinhadas WHERE url_pdf_proposta IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM documentos_fornecedor WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM documentos_processo_finalizado WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM documentos_antigos WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_documento FROM respostas_recursos WHERE url_documento IS NOT NULL
  UNION ALL
  SELECT unnest(comprovantes_urls) AS url FROM cotacao_respostas_fornecedor WHERE comprovantes_urls IS NOT NULL AND array_length(comprovantes_urls, 1) > 0
  UNION ALL
  SELECT url_arquivo_principal FROM contratos_terceiros WHERE url_arquivo_principal IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM documentos_contrato WHERE url_arquivo IS NOT NULL
  UNION ALL
  SELECT url_arquivo FROM protocolos_documentos_processo WHERE url_arquivo IS NOT NULL;
$function$;
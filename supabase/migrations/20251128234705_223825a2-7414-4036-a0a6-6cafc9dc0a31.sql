-- Função para buscar todas as URLs de arquivos referenciadas no banco de dados
CREATE OR REPLACE FUNCTION public.get_all_file_references()
RETURNS TABLE (url TEXT)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT public.anexos_processo_compra.url_arquivo AS url 
  FROM public.anexos_processo_compra 
  WHERE public.anexos_processo_compra.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.analises_compliance.url_documento 
  FROM public.analises_compliance 
  WHERE public.analises_compliance.url_documento IS NOT NULL
  
  UNION ALL
  
  SELECT public.planilhas_consolidadas.url_arquivo 
  FROM public.planilhas_consolidadas 
  WHERE public.planilhas_consolidadas.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.autorizacoes_processo.url_arquivo 
  FROM public.autorizacoes_processo 
  WHERE public.autorizacoes_processo.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.relatorios_finais.url_arquivo 
  FROM public.relatorios_finais 
  WHERE public.relatorios_finais.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.encaminhamentos_processo.url 
  FROM public.encaminhamentos_processo 
  WHERE public.encaminhamentos_processo.url IS NOT NULL
  
  UNION ALL
  
  SELECT public.emails_cotacao_anexados.url_arquivo 
  FROM public.emails_cotacao_anexados 
  WHERE public.emails_cotacao_anexados.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.anexos_cotacao_fornecedor.url_arquivo 
  FROM public.anexos_cotacao_fornecedor 
  WHERE public.anexos_cotacao_fornecedor.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.recursos_fornecedor.url_arquivo 
  FROM public.recursos_fornecedor 
  WHERE public.recursos_fornecedor.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.documentos_finalizacao_fornecedor.url_arquivo 
  FROM public.documentos_finalizacao_fornecedor 
  WHERE public.documentos_finalizacao_fornecedor.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.anexos_selecao.url_arquivo 
  FROM public.anexos_selecao 
  WHERE public.anexos_selecao.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.atas_selecao.url_arquivo 
  FROM public.atas_selecao 
  WHERE public.atas_selecao.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.atas_selecao.url_arquivo_original 
  FROM public.atas_selecao 
  WHERE public.atas_selecao.url_arquivo_original IS NOT NULL
  
  UNION ALL
  
  SELECT public.homologacoes_selecao.url_arquivo 
  FROM public.homologacoes_selecao 
  WHERE public.homologacoes_selecao.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.planilhas_lances_selecao.url_arquivo 
  FROM public.planilhas_lances_selecao 
  WHERE public.planilhas_lances_selecao.url_arquivo IS NOT NULL
  
  UNION ALL
  
  SELECT public.recursos_inabilitacao_selecao.url_pdf_recurso 
  FROM public.recursos_inabilitacao_selecao 
  WHERE public.recursos_inabilitacao_selecao.url_pdf_recurso IS NOT NULL
  
  UNION ALL
  
  SELECT public.recursos_inabilitacao_selecao.url_pdf_resposta 
  FROM public.recursos_inabilitacao_selecao 
  WHERE public.recursos_inabilitacao_selecao.url_pdf_resposta IS NOT NULL
  
  UNION ALL
  
  SELECT public.selecao_propostas_fornecedor.url_pdf_proposta 
  FROM public.selecao_propostas_fornecedor 
  WHERE public.selecao_propostas_fornecedor.url_pdf_proposta IS NOT NULL;
$$;
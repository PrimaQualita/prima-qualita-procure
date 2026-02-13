
-- ==========================================
-- MÓDULO CONTRATOS - Tabelas e estruturas
-- ==========================================

-- 1. Adicionar campo 'contrato' ao profile para RBAC
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS contrato boolean DEFAULT false;

-- 2. Tabela: Processos para Contratar (criados automaticamente ao finalizar processo)
CREATE TABLE public.processos_para_contratar (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  processo_compra_id UUID NOT NULL REFERENCES public.processos_compras(id) ON DELETE CASCADE,
  contrato_gestao_id UUID NOT NULL REFERENCES public.contratos_gestao(id) ON DELETE CASCADE,
  numero_processo TEXT NOT NULL,
  tipo_processo TEXT NOT NULL DEFAULT 'Compra Direta',
  data_finalizacao TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  fornecedor_vencedor_nome TEXT,
  fornecedor_vencedor_id UUID REFERENCES public.fornecedores(id),
  objeto TEXT,
  valor_aprovado NUMERIC DEFAULT 0,
  conta_gerencial TEXT,
  url_dossie TEXT,
  status TEXT NOT NULL DEFAULT 'pronto_para_contratar' CHECK (status IN ('pronto_para_contratar','em_contratacao','contratado','cancelado')),
  motivo_cancelamento TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.processos_para_contratar ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view processos_para_contratar"
  ON public.processos_para_contratar FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can insert processos_para_contratar"
  ON public.processos_para_contratar FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can update processos_para_contratar"
  ON public.processos_para_contratar FOR UPDATE TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can delete processos_para_contratar"
  ON public.processos_para_contratar FOR DELETE TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE TRIGGER update_processos_para_contratar_updated_at
  BEFORE UPDATE ON public.processos_para_contratar
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3. Tabela: Contratos com Terceiros
CREATE TABLE public.contratos_terceiros (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_gestao_id UUID NOT NULL REFERENCES public.contratos_gestao(id) ON DELETE CASCADE,
  processo_para_contratar_id UUID REFERENCES public.processos_para_contratar(id),
  codigo_interno TEXT NOT NULL,
  objeto TEXT NOT NULL,
  fornecedor_id UUID REFERENCES public.fornecedores(id),
  data_assinatura DATE,
  inicio_vigencia DATE,
  fim_vigencia_atual DATE,
  status TEXT NOT NULL DEFAULT 'rascunho' CHECK (status IN ('rascunho','vigente','encerrado','rescindido')),
  valor_inicial NUMERIC DEFAULT 0,
  valor_atual NUMERIC DEFAULT 0,
  criterio_reajuste TEXT,
  conta_gerencial TEXT,
  url_arquivo_principal TEXT,
  storage_path_arquivo TEXT,
  usuario_criador_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.contratos_terceiros ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contratos_terceiros"
  ON public.contratos_terceiros FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can insert contratos_terceiros"
  ON public.contratos_terceiros FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can update contratos_terceiros"
  ON public.contratos_terceiros FOR UPDATE TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can delete contratos_terceiros"
  ON public.contratos_terceiros FOR DELETE TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE TRIGGER update_contratos_terceiros_updated_at
  BEFORE UPDATE ON public.contratos_terceiros
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 4. Tabela: Documentos do Contrato (Aditivos, Apostilamentos, etc.)
CREATE TABLE public.documentos_contrato (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  contrato_terceiro_id UUID NOT NULL REFERENCES public.contratos_terceiros(id) ON DELETE CASCADE,
  tipo TEXT NOT NULL CHECK (tipo IN ('termo_aditivo','apostilamento','outros')),
  nome TEXT NOT NULL,
  data_documento DATE,
  natureza TEXT CHECK (natureza IN ('prazo','reajuste','realinhamento','escopo','outro')),
  novo_prazo DATE,
  percentual_indice NUMERIC,
  novo_valor NUMERIC,
  justificativa TEXT,
  url_arquivo TEXT,
  storage_path TEXT,
  usuario_criador_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.documentos_contrato ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view documentos_contrato"
  ON public.documentos_contrato FOR SELECT TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can insert documentos_contrato"
  ON public.documentos_contrato FOR INSERT TO authenticated
  WITH CHECK (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can update documentos_contrato"
  ON public.documentos_contrato FOR UPDATE TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Authenticated users can delete documentos_contrato"
  ON public.documentos_contrato FOR DELETE TO authenticated
  USING (public.is_internal_user(auth.uid()));

CREATE TRIGGER update_documentos_contrato_updated_at
  BEFORE UPDATE ON public.documentos_contrato
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 5. Adicionar referências do storage na função get_all_file_references
CREATE OR REPLACE FUNCTION public.get_all_file_references()
RETURNS TABLE(url text)
LANGUAGE sql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  -- Anexos de processos de compra
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
  -- NOVAS: Contratos com terceiros
  SELECT url_arquivo_principal FROM contratos_terceiros WHERE url_arquivo_principal IS NOT NULL
  UNION ALL
  -- NOVAS: Documentos de contrato
  SELECT url_arquivo FROM documentos_contrato WHERE url_arquivo IS NOT NULL;
$$;

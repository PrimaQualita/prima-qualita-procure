
-- =====================================================
-- CORREÇÃO ABRANGENTE DE SEGURANÇA - PARTE 1
-- Removendo políticas públicas problemáticas
-- =====================================================

-- FORNECEDORES - Restringir acesso público
DROP POLICY IF EXISTS "Public can view approved fornecedores only" ON public.fornecedores;
DROP POLICY IF EXISTS "Public can view fornecedores" ON public.fornecedores;

-- COTACAO_RESPOSTAS_FORNECEDOR - Remover políticas públicas
DROP POLICY IF EXISTS "Public can check respostas for open cotacoes only" ON public.cotacao_respostas_fornecedor;
DROP POLICY IF EXISTS "Public can view respostas" ON public.cotacao_respostas_fornecedor;

-- RESPOSTAS_ITENS_FORNECEDOR - Remover todas políticas públicas
DROP POLICY IF EXISTS "Allow public select respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Public select respostas itens" ON public.respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Public can view respostas itens for open cotacoes" ON public.respostas_itens_fornecedor;

-- ATAS_ASSINATURAS - Restringir dados de IP
DROP POLICY IF EXISTS "Public can view assinaturas for verification" ON public.atas_assinaturas_fornecedor;
DROP POLICY IF EXISTS "Public can view assinaturas usuario for verification" ON public.atas_assinaturas_usuario;

-- Recriar política de verificação mais restrita para atas_assinaturas_fornecedor
CREATE POLICY "Public can verify assinaturas fornecedor by protocolo"
ON public.atas_assinaturas_fornecedor
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.atas_selecao ata 
    WHERE ata.id = ata_id 
    AND ata.protocolo IS NOT NULL
    AND current_setting('request.path', true) LIKE '%verificar%'
  )
);

-- Recriar política de verificação mais restrita para atas_assinaturas_usuario
CREATE POLICY "Public can verify assinaturas usuario by protocolo"
ON public.atas_assinaturas_usuario
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.atas_selecao ata 
    WHERE ata.id = ata_id 
    AND ata.protocolo IS NOT NULL
    AND current_setting('request.path', true) LIKE '%verificar%'
  )
);

-- PROCESSOS_COMPRAS - Restringir políticas públicas
DROP POLICY IF EXISTS "Public can view processos for verification" ON public.processos_compras;

-- MENSAGENS - Remover acesso público
DROP POLICY IF EXISTS "Anyone can view negotiation messages" ON public.mensagens_negociacao;
DROP POLICY IF EXISTS "Public can view mensagens" ON public.mensagens_selecao;
DROP POLICY IF EXISTS "Public can view mensagens selecao" ON public.mensagens_selecao;

-- Recriar política segura para mensagens_negociacao
CREATE POLICY "Internal users and involved fornecedor can view mensagens negociacao"
ON public.mensagens_negociacao
FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  OR fornecedor_id IN (SELECT id FROM public.fornecedores WHERE user_id = auth.uid())
);

-- Recriar política segura para mensagens_selecao
CREATE POLICY "Internal users and involved fornecedor can view mensagens selecao"
ON public.mensagens_selecao
FOR SELECT
USING (
  public.is_internal_user(auth.uid())
  OR fornecedor_id IN (SELECT id FROM public.fornecedores WHERE user_id = auth.uid())
);

-- LANCES_FORNECEDORES - Restringir visualização pública
DROP POLICY IF EXISTS "Public can view lances" ON public.lances_fornecedores;

-- Recriar política mais restritiva para lances
CREATE POLICY "Authenticated users can view lances"
ON public.lances_fornecedores
FOR SELECT
USING (
  auth.uid() IS NOT NULL
);

-- ITENS_ABERTOS_LANCES - Restringir acesso público
DROP POLICY IF EXISTS "Public can view itens abertos for selecao" ON public.itens_abertos_lances;
DROP POLICY IF EXISTS "Public can view itens abertos" ON public.itens_abertos_lances;

-- Recriar política para itens_abertos_lances
CREATE POLICY "Authenticated users can view itens abertos"
ON public.itens_abertos_lances
FOR SELECT
USING (
  auth.uid() IS NOT NULL
);

-- SELECAO_PROPOSTAS_FORNECEDOR - Remover política "Anyone"
DROP POLICY IF EXISTS "Anyone can create selecao propostas" ON public.selecao_propostas_fornecedor;
DROP POLICY IF EXISTS "Anyone can update selection proposal protocolo" ON public.selecao_propostas_fornecedor;

-- SELECAO_RESPOSTAS_ITENS_FORNECEDOR - Remover políticas "Anyone"
DROP POLICY IF EXISTS "Anyone can create selecao respostas itens" ON public.selecao_respostas_itens_fornecedor;
DROP POLICY IF EXISTS "Public can view selecao respostas itens" ON public.selecao_respostas_itens_fornecedor;

-- Recriar políticas seguras para selecao_respostas_itens
CREATE POLICY "Internal users can manage selecao respostas itens"
ON public.selecao_respostas_itens_fornecedor
FOR ALL
USING (public.is_internal_user(auth.uid()));

CREATE POLICY "Fornecedores can view own selecao respostas itens"
ON public.selecao_respostas_itens_fornecedor
FOR SELECT
USING (
  proposta_id IN (
    SELECT spf.id FROM public.selecao_propostas_fornecedor spf
    JOIN public.fornecedores f ON f.id = spf.fornecedor_id
    WHERE f.user_id = auth.uid()
  )
);

-- ENCAMINHAMENTOS - Remover políticas genéricas de criação
DROP POLICY IF EXISTS "Usuários autenticados podem criar encaminhamentos" ON public.encaminhamentos_processo;
DROP POLICY IF EXISTS "Users can create encaminhamentos" ON public.encaminhamentos_processo;

-- RESPOSTAS_RECURSOS - Restringir modificação
DROP POLICY IF EXISTS "Authenticated users can update respostas recursos" ON public.respostas_recursos;

-- Recriar política restrita para respostas_recursos
CREATE POLICY "Internal users can update respostas recursos"
ON public.respostas_recursos
FOR UPDATE
USING (public.is_internal_user(auth.uid()));

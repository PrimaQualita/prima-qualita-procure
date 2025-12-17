-- Remover políticas restritivas que verificam prazo para usuários internos

-- Para anexos_cotacao_fornecedor: remover política que bloqueia após prazo
DROP POLICY IF EXISTS "Anyone can create anexos for open cotacoes" ON public.anexos_cotacao_fornecedor;

-- Criar política permissiva para usuários internos (sem restrição de prazo)
DROP POLICY IF EXISTS "Internal users can manage anexos cotacao" ON public.anexos_cotacao_fornecedor;
CREATE POLICY "Internal users can manage anexos cotacao"
ON public.anexos_cotacao_fornecedor
FOR ALL
USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()))
WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid()));

-- Manter política para fornecedores criarem anexos apenas em cotações abertas
CREATE POLICY "Fornecedores can create anexos for open cotacoes"
ON public.anexos_cotacao_fornecedor
FOR INSERT
WITH CHECK (
  -- Fornecedor criando anexo em cotação aberta
  EXISTS (
    SELECT 1
    FROM cotacao_respostas_fornecedor crf
    JOIN cotacoes_precos cp ON cp.id = crf.cotacao_id
    JOIN fornecedores f ON f.id = crf.fornecedor_id
    WHERE crf.id = anexos_cotacao_fornecedor.cotacao_resposta_fornecedor_id
    AND f.user_id = auth.uid()
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);

-- Para cotacao_respostas_fornecedor: ajustar política de UPDATE
DROP POLICY IF EXISTS "Anyone can update cotacao respostas for open cotacoes" ON public.cotacao_respostas_fornecedor;

-- Criar política permissiva para fornecedores atualizarem apenas em cotações abertas
CREATE POLICY "Fornecedores can update cotacao respostas for open cotacoes"
ON public.cotacao_respostas_fornecedor
FOR UPDATE
USING (
  EXISTS (
    SELECT 1
    FROM cotacoes_precos cp
    JOIN fornecedores f ON f.id = cotacao_respostas_fornecedor.fornecedor_id
    WHERE cp.id = cotacao_respostas_fornecedor.cotacao_id
    AND f.user_id = auth.uid()
    AND cp.status_cotacao = 'em_aberto'
    AND cp.data_limite_resposta > now()
  )
);
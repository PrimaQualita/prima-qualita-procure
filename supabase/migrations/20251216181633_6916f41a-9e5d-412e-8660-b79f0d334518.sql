-- Adicionar coluna de controle de correção em propostas_realinhadas
ALTER TABLE public.propostas_realinhadas 
ADD COLUMN IF NOT EXISTS correcao_solicitada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS motivo_correcao text,
ADD COLUMN IF NOT EXISTS data_solicitacao_correcao timestamp with time zone;

-- Ajustar política de UPDATE para fornecedores (só quando correcao_solicitada = true ou proposta recente)
DROP POLICY IF EXISTS "Fornecedores podem atualizar suas propostas realinhadas" ON public.propostas_realinhadas;

CREATE POLICY "Fornecedores podem atualizar suas propostas realinhadas" 
ON public.propostas_realinhadas 
FOR UPDATE 
USING (
  fornecedor_id IN (
    SELECT fornecedores.id
    FROM fornecedores
    WHERE fornecedores.user_id = auth.uid()
  )
  AND (correcao_solicitada = true OR data_envio > now() - interval '5 minutes')
);

-- Permitir fornecedores deletarem suas próprias propostas recentes ou quando solicitado
CREATE POLICY "Fornecedores podem deletar suas propostas realinhadas" 
ON public.propostas_realinhadas 
FOR DELETE 
USING (
  fornecedor_id IN (
    SELECT fornecedores.id
    FROM fornecedores
    WHERE fornecedores.user_id = auth.uid()
  )
  AND (correcao_solicitada = true OR data_envio > now() - interval '5 minutes')
);

-- Permitir usuários internos deletarem propostas realinhadas
DROP POLICY IF EXISTS "Usuários internos podem gerenciar propostas realinhadas" ON public.propostas_realinhadas;

CREATE POLICY "Usuários internos podem gerenciar propostas realinhadas" 
ON public.propostas_realinhadas 
FOR ALL 
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

-- Mesma lógica para itens
DROP POLICY IF EXISTS "Fornecedores podem atualizar itens de suas propostas" ON public.propostas_realinhadas_itens;

CREATE POLICY "Fornecedores podem atualizar itens de suas propostas" 
ON public.propostas_realinhadas_itens 
FOR UPDATE 
USING (
  proposta_realinhada_id IN (
    SELECT pr.id
    FROM propostas_realinhadas pr
    JOIN fornecedores f ON f.id = pr.fornecedor_id
    WHERE f.user_id = auth.uid()
    AND (pr.correcao_solicitada = true OR pr.data_envio > now() - interval '5 minutes')
  )
);

DROP POLICY IF EXISTS "Fornecedores podem deletar itens de suas propostas" ON public.propostas_realinhadas_itens;

CREATE POLICY "Fornecedores podem deletar itens de suas propostas" 
ON public.propostas_realinhadas_itens 
FOR DELETE 
USING (
  proposta_realinhada_id IN (
    SELECT pr.id
    FROM propostas_realinhadas pr
    JOIN fornecedores f ON f.id = pr.fornecedor_id
    WHERE f.user_id = auth.uid()
    AND (pr.correcao_solicitada = true OR pr.data_envio > now() - interval '5 minutes')
  )
);

DROP POLICY IF EXISTS "Usuários internos podem gerenciar itens de propostas" ON public.propostas_realinhadas_itens;

CREATE POLICY "Usuários internos podem gerenciar itens de propostas" 
ON public.propostas_realinhadas_itens 
FOR ALL 
USING (
  EXISTS (
    SELECT 1
    FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
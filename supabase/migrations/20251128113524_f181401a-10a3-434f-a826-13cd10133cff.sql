-- Ajustar tabela homologacoes_selecao para solicitação de geração
ALTER TABLE homologacoes_selecao 
DROP COLUMN IF EXISTS status_assinatura,
DROP COLUMN IF EXISTS data_envio_assinatura,
DROP COLUMN IF EXISTS data_assinatura;

-- Adicionar campos para controle de solicitação de geração
ALTER TABLE homologacoes_selecao
ADD COLUMN IF NOT EXISTS solicitacao_enviada boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_solicitacao timestamp with time zone,
ADD COLUMN IF NOT EXISTS solicitacao_atendida boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS data_atendimento timestamp with time zone;

-- Criar tabela para rastrear solicitações de homologação pendentes
CREATE TABLE IF NOT EXISTS solicitacoes_homologacao_selecao (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selecao_id uuid NOT NULL REFERENCES selecoes_fornecedores(id) ON DELETE CASCADE,
  responsavel_legal_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  solicitante_id uuid REFERENCES profiles(id),
  data_solicitacao timestamp with time zone NOT NULL DEFAULT now(),
  atendida boolean DEFAULT false,
  data_atendimento timestamp with time zone,
  created_at timestamp with time zone DEFAULT now()
);

-- Habilitar RLS
ALTER TABLE solicitacoes_homologacao_selecao ENABLE ROW LEVEL SECURITY;

-- Políticas RLS
CREATE POLICY "Responsaveis legais podem ver suas solicitacoes"
ON solicitacoes_homologacao_selecao
FOR SELECT
TO authenticated
USING (responsavel_legal_id = auth.uid());

CREATE POLICY "Usuarios internos podem criar solicitacoes"
ON solicitacoes_homologacao_selecao
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
  )
);

CREATE POLICY "Responsaveis legais podem atualizar suas solicitacoes"
ON solicitacoes_homologacao_selecao
FOR UPDATE
TO authenticated
USING (responsavel_legal_id = auth.uid());

CREATE POLICY "Usuarios internos podem ver todas solicitacoes"
ON solicitacoes_homologacao_selecao
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE id = auth.uid()
  )
);
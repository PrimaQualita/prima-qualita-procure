-- Permitir gestores e colaboradores lerem rejeições de fornecedores
DROP POLICY IF EXISTS "Usuarios internos podem ver rejeicoes" ON fornecedores_rejeitados_cotacao;
DROP POLICY IF EXISTS "Fornecedores podem ver suas rejeicoes" ON fornecedores_rejeitados_cotacao;

CREATE POLICY "Usuarios internos podem ver rejeicoes"
ON fornecedores_rejeitados_cotacao
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('gestor', 'colaborador')
  )
);

CREATE POLICY "Fornecedores podem ver suas rejeicoes"
ON fornecedores_rejeitados_cotacao
FOR SELECT
TO authenticated
USING (
  fornecedor_id IN (
    SELECT id FROM fornecedores WHERE user_id = auth.uid()
  )
);

-- Permitir gestores e colaboradores inserir rejeições
DROP POLICY IF EXISTS "Usuarios internos podem inserir rejeicoes" ON fornecedores_rejeitados_cotacao;

CREATE POLICY "Usuarios internos podem inserir rejeicoes"
ON fornecedores_rejeitados_cotacao
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('gestor', 'colaborador')
  )
);

-- Permitir gestores e colaboradores atualizarem rejeições (para reverter)
DROP POLICY IF EXISTS "Usuarios internos podem atualizar rejeicoes" ON fornecedores_rejeitados_cotacao;

CREATE POLICY "Usuarios internos podem atualizar rejeicoes"
ON fornecedores_rejeitados_cotacao
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM user_roles 
    WHERE user_id = auth.uid() 
    AND role IN ('gestor', 'colaborador')
  )
);
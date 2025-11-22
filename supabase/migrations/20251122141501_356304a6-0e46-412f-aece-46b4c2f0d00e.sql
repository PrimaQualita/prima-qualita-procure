-- Adicionar política RLS para permitir que usuários autenticados criem encaminhamentos
CREATE POLICY "Users can create encaminhamentos"
ON encaminhamentos_processo
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Adicionar política RLS para permitir que usuários autenticados atualizem encaminhamentos que criaram
CREATE POLICY "Users can update own encaminhamentos"
ON encaminhamentos_processo
FOR UPDATE
TO authenticated
USING (auth.uid() = gerado_por);

-- Adicionar política RLS para permitir que usuários autenticados deletem encaminhamentos que criaram
CREATE POLICY "Users can delete own encaminhamentos"
ON encaminhamentos_processo
FOR DELETE
TO authenticated
USING (auth.uid() = gerado_por);

-- Adicionar política RLS para permitir que usuários autenticados vejam encaminhamentos
CREATE POLICY "Users can view encaminhamentos"
ON encaminhamentos_processo
FOR SELECT
TO authenticated
USING (true);
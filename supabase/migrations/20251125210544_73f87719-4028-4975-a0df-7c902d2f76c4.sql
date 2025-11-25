-- Corrigir políticas RLS da tabela planilhas_lances_selecao
-- Deletar políticas antigas se existirem
DROP POLICY IF EXISTS "Internal users can manage planilhas lances" ON planilhas_lances_selecao;
DROP POLICY IF EXISTS "Internal users can view planilhas lances" ON planilhas_lances_selecao;

-- Criar políticas corretas
CREATE POLICY "Internal users can insert planilhas lances"
ON planilhas_lances_selecao
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can update planilhas lances"
ON planilhas_lances_selecao
FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can delete planilhas lances"
ON planilhas_lances_selecao
FOR DELETE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);

CREATE POLICY "Internal users can view planilhas lances"
ON planilhas_lances_selecao
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
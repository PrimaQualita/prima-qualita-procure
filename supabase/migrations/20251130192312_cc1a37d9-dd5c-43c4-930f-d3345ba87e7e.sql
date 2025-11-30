-- Permitir usuários internos (gestores/colaboradores) criarem respostas de cotação
-- independentemente do status ou prazo da cotação (para incluir preços públicos)
CREATE POLICY "Internal users can create cotacao respostas"
ON cotacao_respostas_fornecedor
FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles
    WHERE profiles.id = auth.uid()
  )
);
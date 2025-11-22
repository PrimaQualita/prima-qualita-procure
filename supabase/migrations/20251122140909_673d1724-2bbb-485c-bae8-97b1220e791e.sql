-- Remover política antiga se existir
DROP POLICY IF EXISTS "Public can verify encaminhamentos by protocolo" ON encaminhamentos_processo;

-- Adicionar política RLS para permitir verificação pública de encaminhamentos pelo protocolo
CREATE POLICY "Public can verify encaminhamentos by protocolo"
ON encaminhamentos_processo
FOR SELECT
TO anon
USING (true);
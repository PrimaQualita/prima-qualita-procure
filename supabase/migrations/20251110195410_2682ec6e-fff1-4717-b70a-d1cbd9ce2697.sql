-- Permitir acesso público às perguntas ativas de due diligence
DROP POLICY IF EXISTS "Everyone can view active questions" ON perguntas_due_diligence;

CREATE POLICY "Public can view active questions"
ON perguntas_due_diligence
FOR SELECT
TO anon, authenticated
USING (ativo = true);
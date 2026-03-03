-- Permitir que qualquer usuário interno autenticado marque notificações como atendidas
-- (necessário para quando um superintendente gera o documento e precisa limpar para todos)
DROP POLICY IF EXISTS "Destinatarios podem atualizar suas notificacoes" ON notificacoes_documentos_processo;

CREATE POLICY "Usuarios autenticados podem atualizar notificacoes"
ON notificacoes_documentos_processo
FOR UPDATE
TO authenticated
USING (true)
WITH CHECK (true);
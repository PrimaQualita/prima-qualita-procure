-- Remover política duplicada que está causando conflito
DROP POLICY IF EXISTS "Authenticated users can create planilhas" ON planilhas_consolidadas;

-- A política "Internal users can create planilhas" já existe e é suficiente
-- Ela verifica se o usuário tem perfil registrado antes de permitir INSERT
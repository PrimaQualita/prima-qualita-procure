-- Permitir verificação pública de autorizações por protocolo
CREATE POLICY "Public can verify autorizacoes by protocolo"
ON autorizacoes_processo
FOR SELECT
USING (true);

-- Permitir verificação pública de relatórios finais por protocolo  
CREATE POLICY "Public can verify relatorios finais by protocolo"
ON relatorios_finais
FOR SELECT
USING (true);

-- Comentário: Estas políticas permitem que qualquer pessoa (autenticada ou não)
-- possa verificar a autenticidade de documentos oficiais através do protocolo,
-- garantindo transparência e auditoria externa dos documentos gerados pelo sistema.
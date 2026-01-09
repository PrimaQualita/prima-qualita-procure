
-- Primeiro, remover a política existente de leitura
DROP POLICY IF EXISTS "Mensagens: participantes podem ler" ON mensagens_contato;

-- Criar nova política que permite participantes de uma conversa ver todas as mensagens dessa conversa
CREATE POLICY "Mensagens: participantes podem ler" 
ON mensagens_contato 
FOR SELECT 
USING (
  -- Usuário é remetente da mensagem
  (remetente_interno_id = auth.uid()) 
  OR (remetente_fornecedor_id = get_fornecedor_id_from_user(auth.uid()))
  -- OU usuário é participante de QUALQUER mensagem na mesma conversa
  OR (
    EXISTS (
      SELECT 1 FROM mensagens_contato mc
      JOIN mensagens_contato_destinatarios mcd ON mcd.mensagem_id = mc.id
      WHERE 
        -- Encontrar todas as mensagens na mesma conversa
        (mc.id = COALESCE(mensagens_contato.conversa_id, mensagens_contato.id) 
         OR mc.conversa_id = COALESCE(mensagens_contato.conversa_id, mensagens_contato.id))
        AND COALESCE(mcd.excluida, false) = false
        AND (
          mcd.destinatario_interno_id = auth.uid() 
          OR mcd.destinatario_fornecedor_id = get_fornecedor_id_from_user(auth.uid())
        )
    )
  )
  -- OU usuário é remetente de alguma mensagem na conversa (para ver respostas de outros)
  OR (
    EXISTS (
      SELECT 1 FROM mensagens_contato mc
      WHERE 
        (mc.id = COALESCE(mensagens_contato.conversa_id, mensagens_contato.id) 
         OR mc.conversa_id = COALESCE(mensagens_contato.conversa_id, mensagens_contato.id))
        AND (
          mc.remetente_interno_id = auth.uid() 
          OR mc.remetente_fornecedor_id = get_fornecedor_id_from_user(auth.uid())
        )
    )
  )
);

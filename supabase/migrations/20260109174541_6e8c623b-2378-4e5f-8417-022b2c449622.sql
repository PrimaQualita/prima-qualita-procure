-- Remover política antiga de INSERT
DROP POLICY IF EXISTS "Destinatarios: remetentes inserem (com restricao fornecedor)" ON public.mensagens_contato_destinatarios;

-- Criar política de INSERT mais simples e direta
CREATE POLICY "Destinatarios: remetentes inserem" 
ON public.mensagens_contato_destinatarios
FOR INSERT
TO authenticated
WITH CHECK (
  -- Usuário interno pode inserir destinatários para mensagens que ele criou
  (
    is_message_sender(mensagem_id, auth.uid())
    AND (
      (destinatario_tipo = 'interno' AND destinatario_interno_id IS NOT NULL AND destinatario_fornecedor_id IS NULL)
      OR 
      (destinatario_tipo = 'fornecedor' AND destinatario_fornecedor_id IS NOT NULL AND destinatario_interno_id IS NULL)
    )
  )
  OR
  -- Fornecedor pode inserir destinatários APENAS internos para mensagens que ele criou
  (
    is_message_sender_fornecedor(mensagem_id, get_fornecedor_id_from_user(auth.uid()))
    AND destinatario_tipo = 'interno'
    AND destinatario_interno_id IS NOT NULL
    AND destinatario_fornecedor_id IS NULL
  )
);
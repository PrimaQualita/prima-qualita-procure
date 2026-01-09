
-- Remover política com recursão infinita
DROP POLICY IF EXISTS "Mensagens: participantes podem ler" ON mensagens_contato;

-- Criar função SECURITY DEFINER para verificar participação na conversa (evita recursão)
CREATE OR REPLACE FUNCTION public.is_participant_in_conversation(p_conversa_id uuid, p_user_id uuid, p_fornecedor_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
  SELECT EXISTS (
    -- É remetente de alguma mensagem na conversa
    SELECT 1 FROM mensagens_contato mc
    WHERE (mc.id = p_conversa_id OR mc.conversa_id = p_conversa_id)
    AND (
      mc.remetente_interno_id = p_user_id 
      OR mc.remetente_fornecedor_id = p_fornecedor_id
    )
  )
  OR EXISTS (
    -- É destinatário de alguma mensagem na conversa
    SELECT 1 FROM mensagens_contato mc
    JOIN mensagens_contato_destinatarios mcd ON mcd.mensagem_id = mc.id
    WHERE (mc.id = p_conversa_id OR mc.conversa_id = p_conversa_id)
    AND COALESCE(mcd.excluida, false) = false
    AND (
      mcd.destinatario_interno_id = p_user_id 
      OR mcd.destinatario_fornecedor_id = p_fornecedor_id
    )
  );
$$;

-- Criar nova política usando a função (sem recursão)
CREATE POLICY "Mensagens: participantes podem ler" 
ON mensagens_contato 
FOR SELECT 
USING (
  -- Usuário é remetente direto da mensagem
  (remetente_interno_id = auth.uid()) 
  OR (remetente_fornecedor_id = get_fornecedor_id_from_user(auth.uid()))
  -- OU usuário é destinatário direto da mensagem
  OR EXISTS (
    SELECT 1 FROM mensagens_contato_destinatarios mcd
    WHERE mcd.mensagem_id = mensagens_contato.id
    AND COALESCE(mcd.excluida, false) = false
    AND (
      mcd.destinatario_interno_id = auth.uid() 
      OR mcd.destinatario_fornecedor_id = get_fornecedor_id_from_user(auth.uid())
    )
  )
  -- OU usuário é participante da conversa (função sem RLS evita recursão)
  OR is_participant_in_conversation(
    COALESCE(mensagens_contato.conversa_id, mensagens_contato.id),
    auth.uid(),
    get_fornecedor_id_from_user(auth.uid())
  )
);

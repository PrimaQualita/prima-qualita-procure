-- Permite que apenas o criador da conversa exclua a conversa inteira (mensagem principal + respostas)
CREATE OR REPLACE FUNCTION public.delete_conversa_mensagem(p_conversa_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
SET row_security TO 'off'
AS $$
DECLARE
  v_root record;
  v_fornecedor_id uuid;
  v_mensagem_ids uuid[];
BEGIN
  SELECT id, remetente_tipo, remetente_interno_id, remetente_fornecedor_id
  INTO v_root
  FROM public.mensagens_contato
  WHERE id = p_conversa_id
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Conversa não encontrada';
  END IF;

  IF v_root.remetente_tipo = 'interno' THEN
    IF v_root.remetente_interno_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'Sem permissão para excluir esta conversa';
    END IF;
  ELSE
    v_fornecedor_id := public.get_fornecedor_id_from_user(auth.uid());
    IF v_root.remetente_fornecedor_id IS DISTINCT FROM v_fornecedor_id THEN
      RAISE EXCEPTION 'Sem permissão para excluir esta conversa';
    END IF;
  END IF;

  SELECT array_agg(id)
  INTO v_mensagem_ids
  FROM public.mensagens_contato
  WHERE id = p_conversa_id OR conversa_id = p_conversa_id;

  IF v_mensagem_ids IS NULL OR array_length(v_mensagem_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  DELETE FROM public.mensagens_contato_destinatarios
  WHERE mensagem_id = ANY(v_mensagem_ids);

  DELETE FROM public.mensagens_contato
  WHERE id = ANY(v_mensagem_ids);
END;
$$;

REVOKE ALL ON FUNCTION public.delete_conversa_mensagem(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.delete_conversa_mensagem(uuid) TO authenticated;
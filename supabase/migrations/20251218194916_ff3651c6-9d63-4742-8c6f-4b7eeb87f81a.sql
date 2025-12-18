-- Função SECURITY DEFINER para finalizar a resposta do fornecedor (atualiza protocolo/hash/url e cria o anexo PROPOSTA)
CREATE OR REPLACE FUNCTION public.finalizar_resposta_cotacao_fornecedor(
  p_resposta_id uuid,
  p_protocolo text,
  p_hash text,
  p_url_pdf_proposta text,
  p_pdf_path text,
  p_pdf_nome text,
  p_comprovantes_urls text[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- Atualizar campos principais da resposta
  UPDATE public.cotacao_respostas_fornecedor
  SET
    protocolo = p_protocolo,
    hash_certificacao = p_hash,
    url_pdf_proposta = p_url_pdf_proposta,
    comprovantes_urls = p_comprovantes_urls
  WHERE id = p_resposta_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Resposta de cotação não encontrada: %', p_resposta_id;
  END IF;

  -- Garantir que exista somente um anexo do tipo PROPOSTA
  DELETE FROM public.anexos_cotacao_fornecedor
  WHERE cotacao_resposta_fornecedor_id = p_resposta_id
    AND tipo_anexo = 'PROPOSTA';

  INSERT INTO public.anexos_cotacao_fornecedor (
    cotacao_resposta_fornecedor_id,
    nome_arquivo,
    tipo_anexo,
    url_arquivo,
    data_upload
  ) VALUES (
    p_resposta_id,
    p_pdf_nome,
    'PROPOSTA',
    p_pdf_path,
    now()
  );
END;
$$;
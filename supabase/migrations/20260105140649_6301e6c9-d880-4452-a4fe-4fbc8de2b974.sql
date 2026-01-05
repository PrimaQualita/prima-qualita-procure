-- Função RPC para registrar intenção de recurso via código de acesso
CREATE OR REPLACE FUNCTION public.registrar_intencao_recurso_por_codigo(
  p_selecao_id uuid,
  p_codigo_acesso text,
  p_deseja_recorrer boolean,
  p_motivo_intencao text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fornecedor_id uuid;
  v_intencao_existente uuid;
BEGIN
  -- Validar código de acesso e recuperar fornecedor
  SELECT spf.fornecedor_id
    INTO v_fornecedor_id
  FROM public.selecao_propostas_fornecedor spf
  WHERE spf.selecao_id = p_selecao_id
    AND spf.codigo_acesso = p_codigo_acesso
  LIMIT 1;

  IF v_fornecedor_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Código de acesso inválido');
  END IF;

  -- Verificar se já existe intenção registrada
  SELECT id INTO v_intencao_existente
  FROM public.intencoes_recurso_selecao
  WHERE selecao_id = p_selecao_id
    AND fornecedor_id = v_fornecedor_id
  LIMIT 1;

  IF v_intencao_existente IS NOT NULL THEN
    RETURN json_build_object('success', false, 'error', 'Intenção de recurso já registrada');
  END IF;

  -- Inserir intenção de recurso
  INSERT INTO public.intencoes_recurso_selecao (
    selecao_id,
    fornecedor_id,
    deseja_recorrer,
    motivo_intencao,
    data_intencao
  ) VALUES (
    p_selecao_id,
    v_fornecedor_id,
    p_deseja_recorrer,
    p_motivo_intencao,
    now()
  );

  RETURN json_build_object('success', true, 'fornecedor_id', v_fornecedor_id);
END;
$$;

-- Função RPC para criar recurso de inabilitação via código de acesso
CREATE OR REPLACE FUNCTION public.criar_recurso_inabilitacao_por_codigo(
  p_selecao_id uuid,
  p_codigo_acesso text,
  p_inabilitacao_id uuid,
  p_data_limite timestamp with time zone
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_fornecedor_id uuid;
  v_recurso_existente uuid;
BEGIN
  -- Validar código de acesso e recuperar fornecedor
  SELECT spf.fornecedor_id
    INTO v_fornecedor_id
  FROM public.selecao_propostas_fornecedor spf
  WHERE spf.selecao_id = p_selecao_id
    AND spf.codigo_acesso = p_codigo_acesso
  LIMIT 1;

  IF v_fornecedor_id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'Código de acesso inválido');
  END IF;

  -- Verificar se já existe recurso
  SELECT id INTO v_recurso_existente
  FROM public.recursos_inabilitacao_selecao
  WHERE inabilitacao_id = p_inabilitacao_id
  LIMIT 1;

  IF v_recurso_existente IS NOT NULL THEN
    RETURN json_build_object('success', true, 'message', 'Recurso já existe');
  END IF;

  -- Inserir recurso
  INSERT INTO public.recursos_inabilitacao_selecao (
    inabilitacao_id,
    selecao_id,
    fornecedor_id,
    motivo_recurso,
    data_limite_fornecedor,
    status_recurso
  ) VALUES (
    p_inabilitacao_id,
    p_selecao_id,
    v_fornecedor_id,
    '',
    p_data_limite,
    'aguardando_envio'
  );

  RETURN json_build_object('success', true);
END;
$$;
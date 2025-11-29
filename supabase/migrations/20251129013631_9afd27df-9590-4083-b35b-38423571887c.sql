-- Corrigir search_path da função para resolver warning de segurança
DROP FUNCTION IF EXISTS executar_delete_sem_trigger(TEXT, TEXT, TEXT);

CREATE OR REPLACE FUNCTION executar_delete_sem_trigger(
  p_tabela TEXT,
  p_coluna TEXT,
  p_path TEXT
) RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
  v_sql TEXT;
BEGIN
  -- Desabilitar triggers temporariamente para esta sessão
  SET session_replication_role = replica;
  
  -- Construir e executar DELETE dinamicamente
  v_sql := format('DELETE FROM %I WHERE %I ILIKE %L RETURNING 1', 
                  p_tabela, p_coluna, '%' || p_path || '%');
  
  EXECUTE v_sql;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  -- Reabilitar triggers
  SET session_replication_role = DEFAULT;
  
  RETURN v_count;
END;
$$;
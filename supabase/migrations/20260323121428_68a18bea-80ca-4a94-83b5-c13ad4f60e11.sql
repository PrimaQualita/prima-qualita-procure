-- Revert: drop the per-user constraint and restore global constraint
ALTER TABLE public.eventos_processo_cientes 
  DROP CONSTRAINT IF EXISTS eventos_processo_cientes_tipo_referencia_usuario_key;

-- Restore original global constraint (one ciente per event for all users)
ALTER TABLE public.eventos_processo_cientes 
  ADD CONSTRAINT eventos_processo_cientes_tipo_evento_referencia_id_key 
  UNIQUE (tipo_evento, referencia_id);
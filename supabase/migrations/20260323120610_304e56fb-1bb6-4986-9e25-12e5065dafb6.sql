-- Drop the old constraint that only allows ONE ciente per event globally
ALTER TABLE public.eventos_processo_cientes 
  DROP CONSTRAINT eventos_processo_cientes_tipo_evento_referencia_id_key;

-- Add new constraint that allows each user to mark ciente independently
ALTER TABLE public.eventos_processo_cientes 
  ADD CONSTRAINT eventos_processo_cientes_tipo_referencia_usuario_key 
  UNIQUE (tipo_evento, referencia_id, usuario_ciente_id);
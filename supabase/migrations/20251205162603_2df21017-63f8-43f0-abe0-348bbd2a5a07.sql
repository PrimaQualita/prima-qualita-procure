-- Remover constraint antiga e criar nova com "declinou_recurso"
ALTER TABLE public.fornecedores_rejeitados_cotacao 
DROP CONSTRAINT fornecedores_rejeitados_cotacao_status_recurso_check;

ALTER TABLE public.fornecedores_rejeitados_cotacao 
ADD CONSTRAINT fornecedores_rejeitados_cotacao_status_recurso_check 
CHECK (status_recurso = ANY (ARRAY['sem_recurso'::text, 'recurso_enviado'::text, 'recurso_deferido'::text, 'recurso_indeferido'::text, 'declinou_recurso'::text]));
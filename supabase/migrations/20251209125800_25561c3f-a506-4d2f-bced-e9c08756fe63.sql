-- Fix the SECURITY DEFINER view issue by recreating with SECURITY INVOKER
DROP VIEW IF EXISTS public.perguntas_due_diligence_publicas;

CREATE VIEW public.perguntas_due_diligence_publicas 
WITH (security_invoker = true) AS
SELECT 
  id,
  texto_pergunta,
  tipo_resposta,
  ordem,
  ativo
FROM public.perguntas_due_diligence
WHERE ativo = true;

-- Grant access to the view
GRANT SELECT ON public.perguntas_due_diligence_publicas TO anon;
GRANT SELECT ON public.perguntas_due_diligence_publicas TO authenticated;

-- Add RLS policy to the underlying table that allows reading via the view
-- The view with security_invoker will use the caller's permissions
CREATE POLICY "Anyone can view active questions via view" 
ON public.perguntas_due_diligence 
FOR SELECT 
USING (ativo = true);
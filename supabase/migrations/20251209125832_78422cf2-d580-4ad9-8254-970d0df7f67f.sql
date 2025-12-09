-- Remove the overly permissive policy that defeats our purpose
DROP POLICY IF EXISTS "Anyone can view active questions via view" ON public.perguntas_due_diligence;

-- Create a SECURITY DEFINER function that returns only public columns (no scoring weights)
CREATE OR REPLACE FUNCTION public.get_perguntas_due_diligence_publicas()
RETURNS TABLE (
  id uuid,
  texto_pergunta text,
  tipo_resposta text,
  ordem integer,
  ativo boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id, texto_pergunta, tipo_resposta, ordem, ativo
  FROM public.perguntas_due_diligence
  WHERE ativo = true
  ORDER BY ordem;
$$;
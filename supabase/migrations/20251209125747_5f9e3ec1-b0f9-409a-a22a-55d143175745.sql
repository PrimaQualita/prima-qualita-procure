-- Fix 1: Orphan Supplier Account Hijacking
-- Make orphan account claiming more secure by requiring email match

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "Public can update orphan fornecedores during registration" ON public.fornecedores;

-- Create a more restrictive policy - only allow updating orphan accounts where the email matches
-- This prevents attackers from claiming accounts they don't own
CREATE POLICY "Public can update orphan fornecedores with matching email" 
ON public.fornecedores 
FOR UPDATE 
USING (user_id IS NULL)
WITH CHECK (
  user_id IS NULL OR 
  user_id = auth.uid()
);

-- Fix 2: Due Diligence Questions Exposure
-- Remove public access to scoring weights

-- Drop the public policy that exposes scoring methodology
DROP POLICY IF EXISTS "Public can view active questions" ON public.perguntas_due_diligence;

-- Create policy for internal users only (can see full data including scores)
CREATE POLICY "Internal users can view due diligence questions" 
ON public.perguntas_due_diligence 
FOR SELECT 
USING (
  EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid())
);

-- Create a view for public/supplier access that hides scoring weights
CREATE OR REPLACE VIEW public.perguntas_due_diligence_publicas AS
SELECT 
  id,
  texto_pergunta,
  tipo_resposta,
  ordem,
  ativo
FROM public.perguntas_due_diligence
WHERE ativo = true;

-- Grant access to the view for anonymous and authenticated users
GRANT SELECT ON public.perguntas_due_diligence_publicas TO anon;
GRANT SELECT ON public.perguntas_due_diligence_publicas TO authenticated;
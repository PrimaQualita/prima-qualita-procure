-- Drop existing policy for gestores
DROP POLICY IF EXISTS "Gestores can update any profile" ON public.profiles;

-- Create new policy allowing both gestores and compliance to update any profile
CREATE POLICY "Gestores and Compliance can update any profile" 
ON public.profiles 
FOR UPDATE 
USING (
  has_role(auth.uid(), 'gestor'::app_role) OR 
  (SELECT compliance FROM public.profiles WHERE id = auth.uid()) = true
)
WITH CHECK (
  has_role(auth.uid(), 'gestor'::app_role) OR 
  (SELECT compliance FROM public.profiles WHERE id = auth.uid()) = true
);
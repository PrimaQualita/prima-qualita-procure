-- Adicionar política de DELETE para atas_selecao
CREATE POLICY "Internal users can delete atas" 
ON public.atas_selecao 
FOR DELETE 
USING (EXISTS ( SELECT 1
   FROM profiles
  WHERE (profiles.id = auth.uid())));

-- Adicionar política de UPDATE para atas_selecao
CREATE POLICY "Internal users can update atas" 
ON public.atas_selecao 
FOR UPDATE 
USING (EXISTS ( SELECT 1
   FROM profiles
  WHERE (profiles.id = auth.uid())));
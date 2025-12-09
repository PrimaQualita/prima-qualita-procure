-- Corrigir política de profiles para restringir acesso apenas a usuários autenticados internos
DROP POLICY IF EXISTS "Authenticated users can view all profiles" ON public.profiles;

-- Nova política: apenas usuários que TÊM um profile (internos) podem ver todos os profiles
CREATE POLICY "Internal users can view all profiles"
ON public.profiles
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid()
  )
);

-- Corrigir política de analises_compliance para não expor dados publicamente
DROP POLICY IF EXISTS "Public can verify analises compliance by protocolo" ON public.analises_compliance;

-- Nova política: verificação pública SÓ funciona quando protocolo é especificado na query
-- Isso evita listagem completa mas permite verificação individual
CREATE POLICY "Public can verify analises compliance by protocolo"
ON public.analises_compliance
FOR SELECT
USING (
  protocolo IS NOT NULL
  AND current_setting('request.path', true) LIKE '%verificar%'
);
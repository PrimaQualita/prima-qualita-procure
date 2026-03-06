
-- Add RLS policy for authenticated users to INSERT into propostas_cotacao_cientes
CREATE POLICY "Authenticated users can insert ciente"
ON public.propostas_cotacao_cientes
FOR INSERT TO authenticated
WITH CHECK (usuario_ciente_id = auth.uid());

-- Add RLS policy for authenticated users to SELECT from propostas_cotacao_cientes
CREATE POLICY "Authenticated users can select cientes"
ON public.propostas_cotacao_cientes
FOR SELECT TO authenticated
USING (true);

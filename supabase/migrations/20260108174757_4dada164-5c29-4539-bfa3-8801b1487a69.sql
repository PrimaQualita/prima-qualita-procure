-- Ajustar RLS do audit_logs para permitir visualização por superintendente executivo e compliance via profiles

DROP POLICY IF EXISTS "Gestores e Compliance can view audit logs" ON public.audit_logs;

CREATE POLICY "Gestores e Compliance can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  public.has_role(auth.uid(), 'gestor'::app_role)
  OR public.has_role(auth.uid(), 'compliance'::app_role)
  OR EXISTS (
    SELECT 1
    FROM public.profiles p
    WHERE p.id = auth.uid()
      AND (
        COALESCE(p.compliance, false) = true
        OR COALESCE(p.superintendente_executivo, false) = true
        OR COALESCE(p.gestor, false) = true
      )
  )
);
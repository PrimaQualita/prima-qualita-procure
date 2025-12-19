-- Atualizar policy de audit_logs para permitir acesso de compliance
DROP POLICY IF EXISTS "Gestores can view audit logs" ON public.audit_logs;

CREATE POLICY "Gestores e Compliance can view audit logs"
ON public.audit_logs
FOR SELECT
TO authenticated
USING (
  has_role(auth.uid(), 'gestor'::app_role)
  OR has_role(auth.uid(), 'compliance'::app_role)
);
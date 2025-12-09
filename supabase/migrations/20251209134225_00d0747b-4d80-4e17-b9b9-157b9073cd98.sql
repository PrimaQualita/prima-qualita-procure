-- Fix audit_logs integrity - prevent updates and deletes completely
-- Note: INSERT policy already exists for internal users, keeping that

-- Prevent updates to audit logs (immutable records)
CREATE POLICY "No updates to audit logs" ON public.audit_logs
FOR UPDATE USING (false);

-- Prevent deletes from audit logs (immutable records)
CREATE POLICY "No deletes from audit logs" ON public.audit_logs
FOR DELETE USING (false);
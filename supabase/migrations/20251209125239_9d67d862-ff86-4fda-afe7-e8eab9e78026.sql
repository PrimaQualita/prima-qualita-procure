-- Fix audit_logs RLS policy to prevent public insertion
-- Only authenticated internal users should be able to create audit logs

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can create audit logs" ON public.audit_logs;

-- Create a more restrictive policy that only allows authenticated internal users
CREATE POLICY "Internal users can create audit logs" 
ON public.audit_logs 
FOR INSERT 
WITH CHECK (
  EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid()
  )
);
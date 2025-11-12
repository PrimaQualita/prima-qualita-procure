-- Fix search_path for security functions to prevent search path manipulation attacks
-- Using CASCADE to drop dependent policies which will be recreated automatically
DROP FUNCTION IF EXISTS public.has_role(uuid, app_role) CASCADE;

CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role app_role)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
      AND role = _role
  )
$$;

-- Recreate the RLS policies that were dropped
CREATE POLICY "Gestores can manage roles" 
ON public.user_roles 
FOR ALL 
USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestores can delete contratos" 
ON public.contratos_gestao 
FOR DELETE 
USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestores can delete processos" 
ON public.processos_compras 
FOR DELETE 
USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestores can view audit logs" 
ON public.audit_logs 
FOR SELECT 
USING (has_role(auth.uid(), 'gestor'::app_role));

CREATE POLICY "Gestores can manage questions" 
ON public.perguntas_due_diligence 
FOR ALL 
USING (has_role(auth.uid(), 'gestor'::app_role));

-- Recreate update_updated_at_column with fixed search_path
DROP FUNCTION IF EXISTS public.update_updated_at_column() CASCADE;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

-- Recreate delete_fornecedor_auth_user with fixed search_path
DROP FUNCTION IF EXISTS public.delete_fornecedor_auth_user() CASCADE;

CREATE OR REPLACE FUNCTION public.delete_fornecedor_auth_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.user_id IS NOT NULL THEN
    RAISE LOG 'Fornecedor % deletado, user_id: %', OLD.id, OLD.user_id;
  END IF;
  
  RETURN OLD;
END;
$$;
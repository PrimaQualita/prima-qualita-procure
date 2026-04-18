-- Função temporária para exportar auth.users (apenas leitura, SECURITY DEFINER)
CREATE OR REPLACE FUNCTION public.export_auth_users_since(p_cutoff timestamptz)
RETURNS TABLE(
  id uuid,
  email text,
  encrypted_password text,
  email_confirmed_at timestamptz,
  raw_app_meta_data jsonb,
  raw_user_meta_data jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  role text,
  aud text,
  is_super_admin boolean,
  phone text,
  confirmed_at timestamptz,
  last_sign_in_at timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, auth
AS $$
  SELECT id, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
         created_at, updated_at, role, aud, is_super_admin, phone, confirmed_at, last_sign_in_at
  FROM auth.users
  WHERE created_at >= p_cutoff OR updated_at >= p_cutoff;
$$;

REVOKE ALL ON FUNCTION public.export_auth_users_since(timestamptz) FROM PUBLIC, anon, authenticated;
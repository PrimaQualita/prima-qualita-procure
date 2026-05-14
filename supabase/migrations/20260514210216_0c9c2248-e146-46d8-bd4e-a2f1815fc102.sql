CREATE OR REPLACE FUNCTION public._dump_auth_users()
RETURNS SETOF json
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT row_to_json(u) FROM auth.users u;
$$;
REVOKE ALL ON FUNCTION public._dump_auth_users() FROM public, anon, authenticated;
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    const { email, password, nomeCompleto, cpf, dataNascimento, role } = await req.json();

    // Criar usuário no auth usando admin API
    const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        nome_completo: nomeCompleto,
        cpf,
      },
    });

    if (authError) throw authError;

    if (authData.user) {
      // Criar profile
      const { error: profileError } = await supabaseAdmin.from("profiles").insert([
        {
          id: authData.user.id,
          nome_completo: nomeCompleto,
          cpf,
          email,
          data_nascimento: dataNascimento,
          primeiro_acesso: true,
          senha_temporaria: true,
          ativo: true,
        },
      ]);

      if (profileError) throw profileError;

      // Criar role
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert([
        {
          user_id: authData.user.id,
          role,
        },
      ]);

      if (roleError) throw roleError;

      return new Response(
        JSON.stringify({ success: true, userId: authData.user.id }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 200,
        }
      );
    }

    throw new Error("Falha ao criar usuário");
  } catch (error: any) {
    console.error("Erro:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

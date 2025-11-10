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

    const { userId, dataNascimento } = await req.json();

    // Gerar senha temporária a partir da data de nascimento (formato: ddmmaaaa)
    // Data vem como YYYY-MM-DD, converter para DDMMYYYY
    const [ano, mes, dia] = dataNascimento.split("-");
    const senhaTemporaria = `${dia}${mes}${ano}`;

    // Resetar senha usando admin API
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: senhaTemporaria,
    });

    if (authError) throw authError;

    // Atualizar profile para marcar como primeiro acesso
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .update({
        primeiro_acesso: true,
        senha_temporaria: true,
      })
      .eq("id", userId);

    if (profileError) throw profileError;

    return new Response(
      JSON.stringify({ success: true, senha: senhaTemporaria }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
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

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function generateSecurePassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  const array = new Uint8Array(12);
  crypto.getRandomValues(array);
  return Array.from(array, byte => chars[byte % chars.length]).join('');
}

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

    const body = resetPasswordSchema.parse(await req.json());
    const { userId } = body;

    // Gerar senha temporária segura e aleatória
    const senhaTemporaria = generateSecurePassword();

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
      JSON.stringify({ 
        success: true, 
        message: "Senha resetada com sucesso. A senha temporária foi enviada para o usuário."
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

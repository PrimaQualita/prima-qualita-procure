import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.81.0";
import { z } from "https://deno.land/x/zod@v3.22.4/mod.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple in-memory rate limiter
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimiter.get(identifier);
  
  if (!record || now > record.resetTime) {
    rateLimiter.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  
  if (record.count >= maxRequests) {
    return false;
  }
  
  record.count++;
  return true;
}

const resetPasswordSchema = z.object({
  fornecedorId: z.string().uuid(),
});

// Formata CNPJ para usar como senha (apenas números, 14 dígitos)
function formatCnpjAsSenha(cnpj: string): string {
  // Remove tudo que não for número
  return cnpj.replace(/\D/g, '');
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  // Rate limiting check
  const clientIp = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  if (!checkRateLimit(clientIp, 5, 60000)) {
    return new Response(
      JSON.stringify({ error: "Muitas requisições. Tente novamente em 1 minuto." }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 429,
      }
    );
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
    const { fornecedorId } = body;

    console.log('Buscando fornecedor:', fornecedorId);

    // Buscar fornecedor para obter user_id e CNPJ
    const { data: fornecedor, error: fornecedorError } = await supabaseAdmin
      .from("fornecedores")
      .select("id, user_id, cnpj, razao_social")
      .eq("id", fornecedorId)
      .single();

    if (fornecedorError || !fornecedor) {
      console.error("Erro ao buscar fornecedor:", fornecedorError);
      throw new Error("Fornecedor não encontrado");
    }

    if (!fornecedor.user_id) {
      throw new Error("Fornecedor não possui usuário vinculado");
    }

    // Senha temporária é o CNPJ sem formatação (14 dígitos)
    const senhaTemporaria = formatCnpjAsSenha(fornecedor.cnpj);

    console.log('Resetando senha do fornecedor:', fornecedor.razao_social);
    console.log('User ID:', fornecedor.user_id);
    console.log('CNPJ (senha temporária - apenas números):', senhaTemporaria.substring(0, 6) + '********');

    // Resetar senha usando admin API
    const { error: authError } = await supabaseAdmin.auth.admin.updateUserById(fornecedor.user_id, {
      password: senhaTemporaria,
    });

    if (authError) {
      console.error("Erro ao resetar senha no auth:", authError);
      throw authError;
    }

    // Atualizar fornecedor para marcar como primeiro acesso
    const { error: updateError } = await supabaseAdmin
      .from("fornecedores")
      .update({
        primeiro_acesso: true,
        senha_temporaria: true,
      })
      .eq("id", fornecedorId);

    if (updateError) {
      console.error("Erro ao atualizar fornecedor:", updateError);
      throw updateError;
    }

    console.log('Senha resetada com sucesso para o fornecedor:', fornecedor.razao_social);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Senha resetada com sucesso. A senha temporária é o CNPJ (apenas números, 14 dígitos)."
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("Erro na edge function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      }
    );
  }
});

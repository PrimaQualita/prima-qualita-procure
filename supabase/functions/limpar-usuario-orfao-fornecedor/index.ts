import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Rate limiter simples em memória
const rateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 3, windowMs: number = 60000): boolean {
  const now = Date.now();
  const record = rateLimiter.get(identifier);
  if (!record || now > record.resetTime) {
    rateLimiter.set(identifier, { count: 1, resetTime: now + windowMs });
    return true;
  }
  if (record.count >= maxRequests) return false;
  record.count++;
  return true;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const clientIp = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || "unknown";
  if (!checkRateLimit(clientIp, 3, 60000)) {
    return new Response(
      JSON.stringify({ error: "Muitas requisições. Tente novamente em 1 minuto." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
    );
  }

  try {
    const { email } = await req.json();

    if (!email || typeof email !== "string" || !email.includes("@")) {
      return new Response(
        JSON.stringify({ error: "E-mail inválido" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { autoRefreshToken: false, persistSession: false } }
    );

    // 1. Buscar o auth user pelo email
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new Error(`Erro ao buscar usuários: ${listError.message}`);

    const authUser = usersData.users.find((u) => u.email === email);
    if (!authUser) {
      // Não existe auth user - não precisa fazer nada
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum usuário encontrado para limpar" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // 2. SEGURANÇA: Verificar se é usuário INTERNO (profiles) - NÃO deletar internos
    const { data: profileCheck } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (profileCheck) {
      return new Response(
        JSON.stringify({ error: "Este email pertence a um usuário interno do sistema e não pode ser removido." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // 3. SEGURANÇA: Verificar se existe fornecedor ATIVO vinculado (user_id não nulo)
    const { data: fornecedorAtivo } = await supabaseAdmin
      .from("fornecedores")
      .select("id")
      .eq("user_id", authUser.id)
      .maybeSingle();

    if (fornecedorAtivo) {
      return new Response(
        JSON.stringify({ error: "Este email pertence a um fornecedor com cadastro ativo." }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 403 }
      );
    }

    // 4. É um auth user órfão (sem profile e sem fornecedor ativo) - pode deletar
    console.log(`Limpando auth user órfão: ${email} (${authUser.id})`);

    const { error: deleteError } = await supabaseAdmin.auth.admin.deleteUser(authUser.id);
    if (deleteError) throw new Error(`Erro ao deletar usuário órfão: ${deleteError.message}`);

    return new Response(
      JSON.stringify({ success: true, message: "Usuário órfão removido com sucesso" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
    );
  } catch (error: any) {
    console.error("Erro na limpeza de usuário órfão:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
    );
  }
});

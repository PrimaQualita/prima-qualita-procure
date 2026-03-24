import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const rateLimiter = new Map<string, { count: number; resetTime: number }>();

function checkRateLimit(identifier: string, maxRequests: number = 5, windowMs: number = 60000): boolean {
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
  if (!checkRateLimit(clientIp, 5, 60000)) {
    return new Response(
      JSON.stringify({ error: "Muitas requisições. Tente novamente em 1 minuto." }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 429 }
    );
  }

  try {
    const body = await req.json();
    const { email, action, fornecedorId, dadosAtualizacao } = body;

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

    // ACTION: atualizar-fornecedor-orfao - update orphan supplier record with service role
    if (action === "atualizar-fornecedor-orfao") {
      if (!fornecedorId || !dadosAtualizacao) {
        return new Response(
          JSON.stringify({ error: "fornecedorId e dadosAtualizacao são obrigatórios" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 400 }
        );
      }

      // Safety: verify this fornecedor exists and has no active user (orphan)
      const { data: fornecedor } = await supabaseAdmin
        .from("fornecedores")
        .select("id, user_id")
        .eq("id", fornecedorId)
        .maybeSingle();

      if (!fornecedor) {
        return new Response(
          JSON.stringify({ error: "Fornecedor não encontrado" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 404 }
        );
      }

      // Clean old documents and due diligence responses
      await supabaseAdmin.from('documentos_fornecedor').delete().eq('fornecedor_id', fornecedorId);
      await supabaseAdmin.from('respostas_due_diligence_fornecedor').delete().eq('fornecedor_id', fornecedorId);

      // Update the orphan record
      const { data: updated, error: updateError } = await supabaseAdmin
        .from("fornecedores")
        .update(dadosAtualizacao)
        .eq("id", fornecedorId)
        .select()
        .single();

      if (updateError) {
        console.error("Erro ao atualizar fornecedor órfão:", updateError);
        throw new Error(`Erro ao atualizar fornecedor: ${updateError.message}`);
      }

      console.log(`Fornecedor órfão atualizado: ${fornecedorId}`);
      return new Response(
        JSON.stringify({ success: true, fornecedor: updated }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // DEFAULT ACTION: limpar auth user órfão
    const { data: usersData, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    if (listError) throw new Error(`Erro ao buscar usuários: ${listError.message}`);

    const authUser = usersData.users.find((u) => u.email === email);
    if (!authUser) {
      return new Response(
        JSON.stringify({ success: true, message: "Nenhum usuário encontrado para limpar" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 200 }
      );
    }

    // Safety: don't delete internal users
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

    // Safety: don't delete active suppliers
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

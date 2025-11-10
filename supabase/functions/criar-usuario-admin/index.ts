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

    // Verificar se o usuário já existe
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) {
      console.error("Erro ao listar usuários:", listError);
      throw listError;
    }

    const userExists = existingUsers.users.find(u => u.email === email);

    let userId: string;

    if (userExists) {
      // Usuário já existe no auth, apenas atualizar senha e garantir que está confirmado
      console.log("Usuário já existe no auth, atualizando...", userExists.id);
      
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userExists.id, {
        password,
        email_confirm: true,
      });

      if (updateError) throw updateError;
      userId = userExists.id;
    } else {
      // Criar novo usuário
      console.log("Criando novo usuário...");
      
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
      if (!authData.user) throw new Error("Falha ao criar usuário");
      
      userId = authData.user.id;
    }

    // Verificar se profile já existe
    const { data: existingProfile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("id", userId)
      .maybeSingle();

    if (!existingProfile) {
      // Criar profile
      console.log("Criando profile...");
      const { error: profileError } = await supabaseAdmin.from("profiles").insert([
        {
          id: userId,
          nome_completo: nomeCompleto,
          cpf,
          email,
          data_nascimento: dataNascimento,
          primeiro_acesso: true,
          senha_temporaria: true,
          ativo: true,
        },
      ]);

      if (profileError) {
        console.error("Erro ao criar profile:", profileError);
        throw profileError;
      }
    } else {
      // Atualizar profile existente
      console.log("Atualizando profile existente...");
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          nome_completo: nomeCompleto,
          cpf,
          data_nascimento: dataNascimento,
          primeiro_acesso: true,
          senha_temporaria: true,
          ativo: true,
        })
        .eq("id", userId);

      if (profileError) {
        console.error("Erro ao atualizar profile:", profileError);
        throw profileError;
      }
    }

    // Verificar se role já existe
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingRole) {
      // Criar role
      console.log("Criando role...");
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert([
        {
          user_id: userId,
          role,
        },
      ]);

      if (roleError) {
        console.error("Erro ao criar role:", roleError);
        throw roleError;
      }
    } else {
      // Atualizar role existente
      console.log("Atualizando role existente...");
      const { error: deleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) {
        console.error("Erro ao deletar role antiga:", deleteError);
        throw deleteError;
      }

      const { error: roleError } = await supabaseAdmin.from("user_roles").insert([
        {
          user_id: userId,
          role,
        },
      ]);

      if (roleError) {
        console.error("Erro ao criar nova role:", roleError);
        throw roleError;
      }
    }

    console.log("Usuário criado/atualizado com sucesso:", userId);

    return new Response(
      JSON.stringify({ success: true, userId }),
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

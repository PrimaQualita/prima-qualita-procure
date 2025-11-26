import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
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

const createUserSchema = z.object({
  email: z.string().email().max(255),
  password: z.string().min(8).max(100),
  nomeCompleto: z.string().min(1).max(200),
  cpf: z.string().regex(/^\d{3}\.\d{3}\.\d{3}-\d{2}$/),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  role: z.enum(['gestor', 'colaborador']),
  responsavelLegal: z.boolean().optional(),
  compliance: z.boolean().optional(),
  cargo: z.string().max(100).optional(),
});

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

    const { email, password, nomeCompleto, cpf, dataNascimento, role, responsavelLegal, compliance, cargo } = createUserSchema.parse(await req.json());

    // Verificar se o usuário já existe
    const { data: existingUsers, error: listError } = await supabaseAdmin.auth.admin.listUsers();
    
    if (listError) throw listError;

    const userExists = existingUsers.users.find(u => u.email === email);

    let userId: string;

    if (userExists) {
      // Usuário já existe no auth, apenas atualizar senha e garantir que está confirmado
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userExists.id, {
        password,
        email_confirm: true,
      });

      if (updateError) throw updateError;
      userId = userExists.id;
    } else {
      // Criar novo usuário
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
          responsavel_legal: responsavelLegal || false,
          compliance: compliance || false,
          cargo: cargo || null,
        },
      ]);

      if (profileError) throw profileError;
    } else {
      // Atualizar profile existente
      const { error: profileError } = await supabaseAdmin
        .from("profiles")
        .update({
          nome_completo: nomeCompleto,
          cpf,
          data_nascimento: dataNascimento,
          primeiro_acesso: true,
          senha_temporaria: true,
          ativo: true,
          responsavel_legal: responsavelLegal || false,
          compliance: compliance || false,
          cargo: cargo || null,
        })
        .eq("id", userId);

      if (profileError) throw profileError;
    }

    // Verificar se role já existe
    const { data: existingRole } = await supabaseAdmin
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();

    if (!existingRole) {
      // Criar role
      const { error: roleError } = await supabaseAdmin.from("user_roles").insert([
        {
          user_id: userId,
          role,
        },
      ]);

      if (roleError) throw roleError;
    } else {
      // Atualizar role existente
      const { error: deleteError } = await supabaseAdmin
        .from("user_roles")
        .delete()
        .eq("user_id", userId);

      if (deleteError) throw deleteError;

      const { error: roleError } = await supabaseAdmin.from("user_roles").insert([
        {
          user_id: userId,
          role,
        },
      ]);

      if (roleError) throw roleError;
    }

    return new Response(
      JSON.stringify({ success: true, userId }),
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

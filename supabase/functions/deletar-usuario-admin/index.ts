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

const deleteUserSchema = z.object({
  userId: z.string().optional(),
  email: z.string().email().optional(),
}).refine(data => data.userId || data.email, {
  message: "Either userId or email must be provided",
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
    // Verify authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Autorização necessária" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

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

    // Verify the user making the request is a gestor (admin)
    const token = authHeader.replace('Bearer ', '');
    const { data: { user: requestingUser }, error: verifyError } = await supabaseAdmin.auth.getUser(token);
    
    if (verifyError || !requestingUser) {
      return new Response(
        JSON.stringify({ error: "Token inválido ou expirado" }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 401,
        }
      );
    }

    // Check if user has gestor role
    const { data: gestorRole, error: gestorRoleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .eq('role', 'gestor')
      .single();

    if (gestorRoleError || !gestorRole) {
      return new Response(
        JSON.stringify({ error: "Acesso negado. Apenas gestores podem deletar usuários." }),
        {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
          status: 403,
        }
      );
    }

    console.log(`Gestor ${requestingUser.email} solicitou deleção de usuário`);

    const body = deleteUserSchema.parse(await req.json());
    
    let userId = body.userId;

    // Se foi passado e-mail ao invés de userId, buscar o usuário
    if (!userId && body.email) {
      const { data: userData, error: userError } = await supabaseAdmin.auth.admin.listUsers();
      
      if (userError) {
        throw new Error(`Erro ao buscar usuário: ${userError.message}`);
      }

      const foundUser = userData.users.find(u => u.email === body.email);
      if (!foundUser) {
        throw new Error(`Usuário com e-mail ${body.email} não encontrado`);
      }
      
      userId = foundUser.id;
    }

    if (!userId) {
      throw new Error("userId não encontrado");
    }

    // Deletar roles
    const { error: deleteRoleError } = await supabaseAdmin
      .from("user_roles")
      .delete()
      .eq("user_id", userId);

    if (deleteRoleError) throw deleteRoleError;

    // Deletar profile
    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .delete()
      .eq("id", userId);

    if (profileError) throw profileError;

    // Deletar usuário do auth
    const { error: deleteAuthError } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (deleteAuthError) throw deleteAuthError;

    return new Response(
      JSON.stringify({ success: true }),
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

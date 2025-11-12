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

const resetPasswordSchema = z.object({
  userId: z.string().uuid(),
  dataNascimento: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

function formatDateToDDMMAAAA(dateString: string): string {
  // dateString está no formato YYYY-MM-DD
  const [year, month, day] = dateString.split('-');
  return `${day}${month}${year}`;
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
    const { userId, dataNascimento } = body;

    // Converter data de nascimento para formato DDMMAAAA (senha temporária)
    const senhaTemporaria = formatDateToDDMMAAAA(dataNascimento);

    console.log('Resetando senha do usuário:', userId);
    console.log('Data de nascimento recebida:', dataNascimento);
    console.log('Senha temporária gerada (DDMMAAAA):', senhaTemporaria);

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

    console.log('Senha resetada com sucesso para o usuário:', userId);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: "Senha resetada com sucesso. A senha temporária é a data de nascimento (DDMMAAAA)."
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

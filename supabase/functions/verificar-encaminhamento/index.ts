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
    const body = await req.json().catch(() => ({}));
    const protocolo = typeof body?.protocolo === "string" ? body.protocolo.trim() : "";

    if (!protocolo) {
      return new Response(
        JSON.stringify({ encaminhamento: null, error: "Protocolo não informado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });

    const { data, error } = await supabase
      .from("encaminhamentos_processo")
      .select("id, protocolo, processo_numero, url, created_at")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (error) {
      console.error("Erro ao buscar encaminhamento:", error);
      return new Response(
        JSON.stringify({ encaminhamento: null, error: "Erro ao verificar encaminhamento" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({ encaminhamento: data ?? null }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("Erro inesperado em verificar-encaminhamento:", e);
    return new Response(
      JSON.stringify({ encaminhamento: null, error: "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

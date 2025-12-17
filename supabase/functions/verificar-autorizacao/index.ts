import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function formatarProtocoloNumerico(proto: string) {
  const limpo = (proto ?? "").trim().replace(/-/g, "");
  if (/^\d{16}$/.test(limpo)) {
    return limpo.match(/.{1,4}/g)?.join("-") ?? proto;
  }
  return (proto ?? "").trim();
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const protocoloRaw = typeof body?.protocolo === "string" ? body.protocolo : "";
    const protocolo = formatarProtocoloNumerico(protocoloRaw);

    if (!protocolo) {
      return new Response(JSON.stringify({ autorizacao: null, error: "Protocolo não informado" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    console.log("[verificar-autorizacao] protocolo recebido:", protocoloRaw, "| formatado:", protocolo);

    const { data: autorizacao, error: autorizacaoError } = await supabase
      .from("autorizacoes_processo")
      .select(
        "id, protocolo, data_geracao, tipo_autorizacao, nome_arquivo, url_arquivo, cotacao_id, usuario_gerador_id",
      )
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (autorizacaoError) {
      console.error("[verificar-autorizacao] erro autorizacoes_processo:", autorizacaoError);
      return new Response(
        JSON.stringify({ autorizacao: null, error: "Erro ao verificar autorização" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!autorizacao) {
      return new Response(JSON.stringify({ autorizacao: null, error: "Autorização não encontrada" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cotacao } = await supabase
      .from("cotacoes_precos")
      .select("titulo_cotacao, processo_compra_id")
      .eq("id", autorizacao.cotacao_id)
      .maybeSingle();

    const processoCompraId = cotacao?.processo_compra_id ?? null;

    const { data: processo } = processoCompraId
      ? await supabase
          .from("processos_compras")
          .select("numero_processo_interno, objeto_resumido")
          .eq("id", processoCompraId)
          .maybeSingle()
      : { data: null };

    const { data: usuario } = autorizacao.usuario_gerador_id
      ? await supabase
          .from("profiles")
          .select("nome_completo, cpf")
          .eq("id", autorizacao.usuario_gerador_id)
          .maybeSingle()
      : { data: null };

    const payload = {
      ...autorizacao,
      cotacao: cotacao ? { ...cotacao, processo } : null,
      usuario: usuario ?? null,
    };

    return new Response(JSON.stringify({ autorizacao: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Erro inesperado em verificar-autorizacao:", e);
    return new Response(JSON.stringify({ autorizacao: null, error: "Erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

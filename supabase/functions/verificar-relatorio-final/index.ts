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
      return new Response(JSON.stringify({ relatorio: null, error: "Protocolo não informado" }), {
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

    console.log("[verificar-relatorio-final] protocolo recebido:", protocoloRaw, "| formatado:", protocolo);

    const { data: relatorio, error: relatorioError } = await supabase
      .from("relatorios_finais")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo, cotacao_id, usuario_gerador_id")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (relatorioError) {
      console.error("[verificar-relatorio-final] erro relatorios_finais:", relatorioError);
      return new Response(JSON.stringify({ relatorio: null, error: "Erro ao verificar relatório" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!relatorio) {
      return new Response(JSON.stringify({ relatorio: null, error: "Relatório não encontrado" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { data: cotacao } = await supabase
      .from("cotacoes_precos")
      .select("titulo_cotacao, processo_compra_id")
      .eq("id", relatorio.cotacao_id)
      .maybeSingle();

    const processoCompraId = cotacao?.processo_compra_id ?? null;

    const { data: processo } = processoCompraId
      ? await supabase
          .from("processos_compras")
          .select("numero_processo_interno, objeto_resumido")
          .eq("id", processoCompraId)
          .maybeSingle()
      : { data: null };

    const { data: usuario } = relatorio.usuario_gerador_id
      ? await supabase
          .from("profiles")
          .select("nome_completo, cpf")
          .eq("id", relatorio.usuario_gerador_id)
          .maybeSingle()
      : { data: null };

    const payload = {
      ...relatorio,
      cotacao: cotacao ? { ...cotacao, processo } : null,
      usuario: usuario ?? null,
    };

    return new Response(JSON.stringify({ relatorio: payload }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Erro inesperado em verificar-relatorio-final:", e);
    return new Response(JSON.stringify({ relatorio: null, error: "Erro inesperado" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

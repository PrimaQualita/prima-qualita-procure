import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    const codigo = url.searchParams.get("codigo");

    if (!codigo) {
      return new Response("Código não informado", { status: 400, headers: corsHeaders });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Buscar link curto
    const { data, error } = await supabase
      .from("links_curtos")
      .select("url_original, storage_path, bucket_name")
      .eq("codigo", codigo)
      .maybeSingle();

    if (error || !data) {
      return new Response("Link não encontrado", { status: 404, headers: corsHeaders });
    }

    // Se tem storage_path, gerar URL assinada fresca
    if (data.storage_path) {
      const bucket = data.bucket_name || "processo-anexos";
      const { data: signedData, error: signedError } = await supabase.storage
        .from(bucket)
        .createSignedUrl(data.storage_path, 3600);

      if (signedError || !signedData?.signedUrl) {
        return new Response("Erro ao gerar acesso ao documento", { status: 500, headers: corsHeaders });
      }

      return new Response(null, {
        status: 302,
        headers: { ...corsHeaders, Location: signedData.signedUrl },
      });
    }

    // Se não tem storage_path, redirecionar para URL original
    return new Response(null, {
      status: 302,
      headers: { ...corsHeaders, Location: data.url_original },
    });
  } catch (err) {
    console.error("Erro:", err);
    return new Response("Erro interno", { status: 500, headers: corsHeaders });
  }
});

import { createClient } from "npm:@supabase/supabase-js@2.81.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function decodePathFully(path: string): string {
  let decoded = path;
  try {
    // Decodificar recursivamente até estabilizar
    let prev = "";
    while (decoded !== prev) {
      prev = decoded;
      decoded = decodeURIComponent(decoded);
    }
  } catch {
    // Já decodificado ou inválido
  }
  return decoded;
}

function extractPath(urlOrPath: string | null, bucket: string): string | null {
  if (!urlOrPath) return null;

  // Remove query params
  let clean = urlOrPath.split("?")[0];
  
  // Decodificar URL completamente
  clean = decodePathFully(clean);

  // If already saved as "bucket/path"
  if (clean.startsWith(`${bucket}/`)) {
    clean = clean.substring(bucket.length + 1);
  }

  // Full URL
  if (clean.startsWith("http")) {
    const marker = `${bucket}/`;
    if (clean.includes(marker)) return clean.split(marker)[1] || null;

    const publicMarker = "/object/public/";
    const signedMarker = "/object/sign/";

    if (clean.includes(publicMarker)) {
      const after = clean.split(publicMarker)[1];
      if (after?.startsWith(`${bucket}/`)) return after.substring(bucket.length + 1);
      return after || null;
    }

    if (clean.includes(signedMarker)) {
      const after = clean.split(signedMarker)[1];
      if (after?.startsWith(`${bucket}/`)) return after.substring(bucket.length + 1);
      return after || null;
    }

    return null;
  }

  // Relative path
  return clean;
}

function pushFile(
  urls: string[],
  urlOrPath: string | null,
  bucket: "processo-anexos" | "documents"
) {
  const path = extractPath(urlOrPath, bucket);
  if (path) urls.push(path);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { selecaoId } = await req.json();

    if (!selecaoId) {
      return new Response(JSON.stringify({ error: "selecaoId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const sb = createClient(supabaseUrl, serviceKey);

    console.log(`🗑️ Deletar seleção: ${selecaoId}`);

    const arquivosProcessoAnexos: string[] = [];
    const arquivosDocuments: string[] = [];

    // 1) anexos_selecao
    const { data: anexosSelecao } = await sb
      .from("anexos_selecao")
      .select("url_arquivo")
      .eq("selecao_id", selecaoId);

    anexosSelecao?.forEach((a) => {
      const url = a.url_arquivo as string | null;
      if (url?.includes("/documents/") || url?.includes("documents/")) {
        pushFile(arquivosDocuments, url, "documents");
      } else {
        pushFile(arquivosProcessoAnexos, url, "processo-anexos");
      }
    });

    // 2) planilhas_lances_selecao
    const { data: planilhasLances } = await sb
      .from("planilhas_lances_selecao")
      .select("url_arquivo")
      .eq("selecao_id", selecaoId);

    planilhasLances?.forEach((p) => pushFile(arquivosProcessoAnexos, (p as any).url_arquivo, "processo-anexos"));

    // 3) atas_selecao
    const { data: atas } = await sb
      .from("atas_selecao")
      .select("url_arquivo, url_arquivo_original")
      .eq("selecao_id", selecaoId);

    console.log(`📄 Atas encontradas: ${atas?.length || 0}`);
    atas?.forEach((a: any) => {
      console.log(`   - url_arquivo: ${a.url_arquivo}`);
      console.log(`   - url_arquivo_original: ${a.url_arquivo_original}`);
      pushFile(arquivosProcessoAnexos, a.url_arquivo, "processo-anexos");
      pushFile(arquivosProcessoAnexos, a.url_arquivo_original, "processo-anexos");
    });

    // 4) homologacoes_selecao
    const { data: homologacoes } = await sb
      .from("homologacoes_selecao")
      .select("url_arquivo")
      .eq("selecao_id", selecaoId);

    console.log(`📄 Homologações encontradas: ${homologacoes?.length || 0}`);
    homologacoes?.forEach((h: any) => {
      console.log(`   - url_arquivo: ${h.url_arquivo}`);
      pushFile(arquivosProcessoAnexos, h.url_arquivo, "processo-anexos");
    });

    // 5) selecao_propostas_fornecedor
    const { data: propostasSelecao } = await sb
      .from("selecao_propostas_fornecedor")
      .select("url_pdf_proposta")
      .eq("selecao_id", selecaoId);

    propostasSelecao?.forEach((p: any) => pushFile(arquivosProcessoAnexos, p.url_pdf_proposta, "processo-anexos"));

    // 6) propostas_realinhadas
    const { data: propostasRealinhadas } = await sb
      .from("propostas_realinhadas")
      .select("url_pdf_proposta")
      .eq("selecao_id", selecaoId);

    propostasRealinhadas?.forEach((p: any) => pushFile(arquivosProcessoAnexos, p.url_pdf_proposta, "processo-anexos"));

    // 7) recursos_inabilitacao_selecao
    const { data: recursosInabilitacao } = await sb
      .from("recursos_inabilitacao_selecao")
      .select("url_pdf_recurso, url_pdf_resposta")
      .eq("selecao_id", selecaoId);

    recursosInabilitacao?.forEach((r: any) => {
      pushFile(arquivosProcessoAnexos, r.url_pdf_recurso, "processo-anexos");
      pushFile(arquivosProcessoAnexos, r.url_pdf_resposta, "processo-anexos");
    });

    // 8) encaminhamentos_contabilidade (selecao)
    const { data: encaminhamentosContab } = await sb
      .from("encaminhamentos_contabilidade")
      .select("url_arquivo, storage_path, url_resposta_pdf, storage_path_resposta")
      .eq("selecao_id", selecaoId);

    encaminhamentosContab?.forEach((enc: any) => {
      pushFile(arquivosProcessoAnexos, enc.storage_path || enc.url_arquivo, "processo-anexos");
      pushFile(
        arquivosProcessoAnexos,
        enc.storage_path_resposta || enc.url_resposta_pdf,
        "processo-anexos"
      );
    });

    // 9) documentos de finalização (seleção)
    const { data: campos } = await sb
      .from("campos_documentos_finalizacao")
      .select("id")
      .eq("selecao_id", selecaoId);

    const campoIds = (campos || []).map((c: any) => c.id).filter(Boolean);
    if (campoIds.length > 0) {
      const { data: docsFinalizacao } = await sb
        .from("documentos_finalizacao_fornecedor")
        .select("url_arquivo")
        .in("campo_documento_id", campoIds);

      docsFinalizacao?.forEach((d: any) => pushFile(arquivosProcessoAnexos, d.url_arquivo, "processo-anexos"));
    }

    const uniqProcesso = [...new Set(arquivosProcessoAnexos)];
    const uniqDocs = [...new Set(arquivosDocuments)];

    console.log(`📦 processo-anexos: ${uniqProcesso.length} arquivo(s)`);
    if (uniqProcesso.length > 0) {
      console.log(`   Caminhos a deletar:`, uniqProcesso.slice(0, 5)); // Mostrar primeiros 5
    }
    console.log(`📦 documents: ${uniqDocs.length} arquivo(s)`);

    let deletados = 0;
    const batchSize = 100;

    for (let i = 0; i < uniqProcesso.length; i += batchSize) {
      const batch = uniqProcesso.slice(i, i + batchSize);
      console.log(`🗑️ Deletando batch de ${batch.length} arquivos de processo-anexos...`);
      const { data, error } = await sb.storage.from("processo-anexos").remove(batch);
      if (error) {
        console.error("❌ Erro ao deletar processo-anexos:", error);
      } else {
        console.log(`✅ Deletados ${data?.length || 0} arquivos`);
        deletados += data?.length || batch.length;
      }
    }

    for (let i = 0; i < uniqDocs.length; i += batchSize) {
      const batch = uniqDocs.slice(i, i + batchSize);
      const { error } = await sb.storage.from("documents").remove(batch);
      if (error) console.error("❌ Erro ao deletar documents:", error);
      else deletados += batch.length;
    }

    // === LIMPEZA DE FORNECEDORES FICTÍCIOS ÓRFÃOS (preços públicos) ===
    // Coletar fornecedores das propostas desta seleção
    const { data: propostasFornIds } = await sb
      .from("selecao_propostas_fornecedor")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId);

    const fornIdsSelecao = [...new Set((propostasFornIds || []).map((p: any) => p.fornecedor_id).filter(Boolean))];

    // Por último, deletar a seleção (cascatas do banco mantêm o mesmo comportamento atual)
    const { error: delError } = await sb.from("selecoes_fornecedores").delete().eq("id", selecaoId);
    if (delError) {
      console.error("❌ Erro ao deletar seleção:", delError);
      return new Response(JSON.stringify({ error: delError.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Após deletar a seleção, limpar fornecedores fictícios órfãos
    if (fornIdsSelecao.length > 0) {
      const { data: ficticios } = await sb
        .from("fornecedores")
        .select("id, email")
        .in("id", fornIdsSelecao)
        .like("email", "%precos.publicos%");

      if (ficticios && ficticios.length > 0) {
        for (const f of ficticios) {
          // Verificar se ainda tem respostas em cotações
          const { count: countCot } = await sb
            .from("cotacao_respostas_fornecedor")
            .select("id", { count: "exact", head: true })
            .eq("fornecedor_id", f.id);

          // Verificar se ainda tem propostas em outras seleções
          const { count: countSel } = await sb
            .from("selecao_propostas_fornecedor")
            .select("id", { count: "exact", head: true })
            .eq("fornecedor_id", f.id);

          if ((countCot || 0) === 0 && (countSel || 0) === 0) {
            console.log(`🗑️ Deletando fornecedor fictício órfão: ${f.id}`);
            await sb.from("fornecedores").delete().eq("id", f.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        arquivosEncontrados: uniqProcesso.length + uniqDocs.length,
        arquivosDeletados: deletados,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("❌ Erro:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    // Verify the caller is authenticated
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const { data: { user: caller }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !caller) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Check if caller is gestor
    const { data: roleData } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", caller.id)
      .eq("role", "gestor")
      .maybeSingle();

    if (!roleData) {
      return new Response(JSON.stringify({ error: "Apenas gestores podem excluir fornecedores" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { fornecedorId } = await req.json();
    if (!fornecedorId) {
      return new Response(JSON.stringify({ error: "fornecedorId é obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // 1. Get fornecedor data
    const { data: fornecedor, error: fetchError } = await supabase
      .from("fornecedores")
      .select("id, user_id")
      .eq("id", fornecedorId)
      .single();

    if (fetchError || !fornecedor) {
      return new Response(JSON.stringify({ error: "Fornecedor não encontrado" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("Deletando fornecedor:", fornecedorId, "user_id:", fornecedor.user_id);

    // ========== COLLECT STORAGE PATHS FOR CLEANUP ==========
    const storagePaths: string[] = [];

    const extractPath = (url: string | null): string | null => {
      if (!url) return null;
      let path = url;
      // Remove query strings
      path = path.split('?')[0];
      // Extract path after bucket name
      const match = path.match(/processo-anexos\/(.+)/);
      if (match) path = match[1];
      // Remove leading bucket name if present
      if (path.startsWith('processo-anexos/')) path = path.replace('processo-anexos/', '');
      // Decode URI
      try { path = decodeURIComponent(path); } catch {}
      try { path = decodeURIComponent(path); } catch {}
      return path || null;
    };

    // Collect docs from documentos_fornecedor
    const { data: docsFornecedor } = await supabase
      .from("documentos_fornecedor")
      .select("url_arquivo")
      .eq("fornecedor_id", fornecedorId);
    docsFornecedor?.forEach(d => {
      const p = extractPath(d.url_arquivo);
      if (p) storagePaths.push(p);
    });

    // Collect docs from documentos_antigos
    const { data: docsAntigos } = await supabase
      .from("documentos_antigos")
      .select("url_arquivo")
      .eq("fornecedor_id", fornecedorId);
    docsAntigos?.forEach(d => {
      const p = extractPath(d.url_arquivo);
      if (p) storagePaths.push(p);
    });

    // Collect docs from documentos_processo_finalizado
    const { data: docsProcessoFin } = await supabase
      .from("documentos_processo_finalizado")
      .select("url_arquivo")
      .eq("fornecedor_id", fornecedorId);
    docsProcessoFin?.forEach(d => {
      const p = extractPath(d.url_arquivo);
      if (p) storagePaths.push(p);
    });

    // Collect docs from documentos_finalizacao_fornecedor
    const { data: docsFinalizacao } = await supabase
      .from("documentos_finalizacao_fornecedor")
      .select("url_arquivo")
      .eq("fornecedor_id", fornecedorId);
    docsFinalizacao?.forEach(d => {
      const p = extractPath(d.url_arquivo);
      if (p) storagePaths.push(p);
    });

    // Collect PDFs from cotacao_respostas_fornecedor
    const { data: respostasCotacao } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select("id, url_pdf_proposta, comprovantes_urls")
      .eq("fornecedor_id", fornecedorId);
    
    const respostaIds = respostasCotacao?.map(r => r.id) || [];
    
    respostasCotacao?.forEach(r => {
      const p = extractPath(r.url_pdf_proposta);
      if (p) storagePaths.push(p);
      if (r.comprovantes_urls) {
        r.comprovantes_urls.forEach((url: string) => {
          const cp = extractPath(url);
          if (cp) storagePaths.push(cp);
        });
      }
    });

    // Collect anexos from anexos_cotacao_fornecedor (via resposta IDs)
    if (respostaIds.length > 0) {
      const { data: anexosCotacao } = await supabase
        .from("anexos_cotacao_fornecedor")
        .select("url_arquivo")
        .in("cotacao_resposta_fornecedor_id", respostaIds);
      anexosCotacao?.forEach(a => {
        const p = extractPath(a.url_arquivo);
        if (p) storagePaths.push(p);
      });
    }

    // Collect PDFs from selecao_propostas_fornecedor
    const { data: propostasSelecao } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("url_pdf_proposta")
      .eq("fornecedor_id", fornecedorId);
    propostasSelecao?.forEach(p => {
      const path = extractPath(p.url_pdf_proposta);
      if (path) storagePaths.push(path);
    });

    // Collect PDFs from propostas_realinhadas
    const { data: propostasRealinhadas } = await supabase
      .from("propostas_realinhadas")
      .select("url_pdf_proposta")
      .eq("fornecedor_id", fornecedorId);
    propostasRealinhadas?.forEach(p => {
      const path = extractPath(p.url_pdf_proposta);
      if (path) storagePaths.push(path);
    });

    // Collect recursos_fornecedor
    const { data: recursosForn } = await supabase
      .from("recursos_fornecedor")
      .select("url_arquivo")
      .eq("fornecedor_id", fornecedorId);
    recursosForn?.forEach(r => {
      const p = extractPath(r.url_arquivo);
      if (p) storagePaths.push(p);
    });

    // Collect recursos_inabilitacao_selecao
    const { data: recursosInab } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select("url_pdf_recurso, url_pdf_resposta")
      .eq("fornecedor_id", fornecedorId);
    recursosInab?.forEach(r => {
      const p1 = extractPath(r.url_pdf_recurso);
      if (p1) storagePaths.push(p1);
      const p2 = extractPath(r.url_pdf_resposta);
      if (p2) storagePaths.push(p2);
    });

    // Also collect storage paths for the fornecedor folder itself
    const { data: fornecedorFiles } = await supabase.storage
      .from("processo-anexos")
      .list(`fornecedor_${fornecedorId}`, { limit: 1000 });
    if (fornecedorFiles && fornecedorFiles.length > 0) {
      fornecedorFiles.forEach(f => {
        storagePaths.push(`fornecedor_${fornecedorId}/${f.name}`);
      });
    }

    console.log(`Coletados ${storagePaths.length} caminhos de storage para deletar`);

    // ========== DELETE DATABASE RECORDS (order matters for FK constraints) ==========

    // Delete mensagens_contato_destinatarios where the fornecedor is a destinatario
    await supabase
      .from("mensagens_contato_destinatarios")
      .delete()
      .eq("destinatario_fornecedor_id", fornecedorId);

    // Delete mensagens_contato_destinatarios for messages sent by this fornecedor
    const { data: msgsSent } = await supabase
      .from("mensagens_contato")
      .select("id")
      .eq("remetente_fornecedor_id", fornecedorId);
    
    if (msgsSent && msgsSent.length > 0) {
      const msgIds = msgsSent.map(m => m.id);
      await supabase
        .from("mensagens_contato_destinatarios")
        .delete()
        .in("mensagem_id", msgIds);
    }

    // Delete mensagens_contato sent by this fornecedor
    await supabase
      .from("mensagens_contato")
      .delete()
      .eq("remetente_fornecedor_id", fornecedorId);

    // Delete contatos
    await supabase.from("contatos").delete().eq("fornecedor_id", fornecedorId);

    // Delete mensagens_selecao
    await supabase.from("mensagens_selecao").delete().eq("fornecedor_id", fornecedorId);

    // Delete mensagens_negociacao
    await supabase.from("mensagens_negociacao").delete().eq("fornecedor_id", fornecedorId);

    // Delete anexos_cotacao_fornecedor (via respostas)
    if (respostaIds.length > 0) {
      await supabase.from("anexos_cotacao_fornecedor").delete().in("cotacao_resposta_fornecedor_id", respostaIds);
    }

    // Delete respostas_itens_fornecedor (via respostas)
    if (respostaIds.length > 0) {
      await supabase.from("respostas_itens_fornecedor").delete().in("cotacao_resposta_fornecedor_id", respostaIds);
    }

    // Delete cotacao_respostas_fornecedor
    await supabase.from("cotacao_respostas_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete cotacao_fornecedor_convites
    await supabase.from("cotacao_fornecedor_convites").delete().eq("fornecedor_id", fornecedorId);

    // Delete selecao_respostas_itens_fornecedor (via propostas de seleção)
    const { data: propostasSelIds } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("id")
      .eq("fornecedor_id", fornecedorId);
    if (propostasSelIds && propostasSelIds.length > 0) {
      await supabase.from("selecao_respostas_itens_fornecedor").delete().in("proposta_id", propostasSelIds.map(p => p.id));
    }

    // Delete selecao_propostas_fornecedor
    await supabase.from("selecao_propostas_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete propostas_realinhadas
    await supabase.from("propostas_realinhadas").delete().eq("fornecedor_id", fornecedorId);

    // Delete lances_fornecedores
    await supabase.from("lances_fornecedores").delete().eq("fornecedor_id", fornecedorId);

    // Delete intencoes_recurso_selecao
    await supabase.from("intencoes_recurso_selecao").delete().eq("fornecedor_id", fornecedorId);

    // Delete recursos_inabilitacao_selecao
    await supabase.from("recursos_inabilitacao_selecao").delete().eq("fornecedor_id", fornecedorId);

    // Delete recursos_fornecedor
    await supabase.from("recursos_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete fornecedores_inabilitados_selecao
    await supabase.from("fornecedores_inabilitados_selecao").delete().eq("fornecedor_id", fornecedorId);

    // Delete fornecedores_rejeitados_cotacao
    await supabase.from("fornecedores_rejeitados_cotacao").delete().eq("fornecedor_id", fornecedorId);

    // Delete atas_assinaturas_fornecedor
    await supabase.from("atas_assinaturas_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete campos_documentos_finalizacao
    await supabase.from("campos_documentos_finalizacao").delete().eq("fornecedor_id", fornecedorId);

    // Delete documentos_finalizacao_fornecedor
    await supabase.from("documentos_finalizacao_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete documentos_processo_finalizado
    await supabase.from("documentos_processo_finalizado").delete().eq("fornecedor_id", fornecedorId);

    // Delete documentos_antigos
    await supabase.from("documentos_antigos").delete().eq("fornecedor_id", fornecedorId);

    // Delete documentos_fornecedor
    await supabase.from("documentos_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete respostas_due_diligence_fornecedor
    await supabase.from("respostas_due_diligence_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Delete avaliacoes_cadastro_fornecedor
    await supabase.from("avaliacoes_cadastro_fornecedor").delete().eq("fornecedor_id", fornecedorId);

    // Nullify fornecedor_vencedor_id in cotacoes_precos
    await supabase.from("cotacoes_precos").update({ fornecedor_vencedor_id: null }).eq("fornecedor_vencedor_id", fornecedorId);

    // Nullify fornecedor_id in contratos_terceiros
    await supabase.from("contratos_terceiros").update({ fornecedor_id: null }).eq("fornecedor_id", fornecedorId);

    // Delete fornecedor record
    const { error: deleteError } = await supabase
      .from("fornecedores")
      .delete()
      .eq("id", fornecedorId);

    if (deleteError) {
      console.error("Erro ao deletar registro do fornecedor:", deleteError);
      throw new Error(`Erro ao deletar fornecedor: ${deleteError.message}`);
    }

    // Delete auth user if exists
    if (fornecedor.user_id) {
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(fornecedor.user_id);
      if (authDeleteError) {
        console.error("Erro ao deletar usuário auth:", authDeleteError);
        // Don't fail - fornecedor already deleted
      }
    }

    // ========== DELETE STORAGE FILES ==========
    if (storagePaths.length > 0) {
      // Delete in batches of 100
      for (let i = 0; i < storagePaths.length; i += 100) {
        const batch = storagePaths.slice(i, i + 100);
        const { error: storageError } = await supabase.storage
          .from("processo-anexos")
          .remove(batch);
        if (storageError) {
          console.error(`Erro ao deletar batch ${i} de storage:`, storageError);
        }
      }
      console.log(`${storagePaths.length} arquivos deletados do storage`);
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: any) {
    console.error("Erro na exclusão do fornecedor:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

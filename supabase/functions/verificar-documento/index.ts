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
    const tipo = typeof body?.tipo === "string" ? body.tipo : null;

    if (!protocolo) {
      return new Response(
        JSON.stringify({ documento: null, error: "Protocolo não informado" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    console.log("Verificando protocolo:", protocolo, "tipo:", tipo);

    // Se tipo específico foi solicitado, buscar apenas naquela tabela
    if (tipo === "proposta_selecao") {
      const { data } = await supabase
        .from("selecao_propostas_fornecedor")
        .select(`
          id, protocolo, valor_total_proposta, data_envio_proposta,
          fornecedores (razao_social, cnpj),
          selecoes_fornecedores (
            titulo_selecao,
            processos_compras (numero_processo_interno)
          )
        `)
        .eq("protocolo", protocolo)
        .maybeSingle();

      if (data) {
        return new Response(
          JSON.stringify({ documento: data, tipo: "proposta_selecao" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (tipo === "proposta_realinhada") {
      const { data } = await supabase
        .from("propostas_realinhadas")
        .select(`
          id, protocolo, valor_total_proposta, data_envio,
          fornecedores (razao_social, cnpj),
          selecoes_fornecedores (
            titulo_selecao,
            processos_compras (numero_processo_interno)
          )
        `)
        .eq("protocolo", protocolo)
        .maybeSingle();

      if (data) {
        return new Response(
          JSON.stringify({ documento: data, tipo: "proposta_realinhada" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    if (tipo === "proposta_cotacao") {
      const { data } = await supabase
        .from("cotacao_respostas_fornecedor")
        .select(`
          id, protocolo, valor_total_anual_ofertado, data_envio_resposta,
          fornecedores (razao_social, cnpj),
          cotacoes_precos (
            titulo_cotacao,
            processos_compras (numero_processo_interno)
          )
        `)
        .eq("protocolo", protocolo)
        .maybeSingle();

      if (data) {
        return new Response(
          JSON.stringify({ documento: data, tipo: "proposta_cotacao" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Busca genérica em todas as tabelas
    // 1. Autorizações de Processo
    const { data: autorizacao } = await supabase
      .from("autorizacoes_processo")
      .select("id, protocolo, data_geracao, tipo_autorizacao, nome_arquivo, url_arquivo")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (autorizacao) {
      return new Response(
        JSON.stringify({ documento: autorizacao, tipo: "autorizacao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 2. Relatórios Finais
    const { data: relatorio } = await supabase
      .from("relatorios_finais")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (relatorio) {
      return new Response(
        JSON.stringify({ documento: relatorio, tipo: "relatorio_final" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Planilhas Consolidadas
    const { data: planilhaConsolidada } = await supabase
      .from("planilhas_consolidadas")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo, fornecedores_incluidos")
      .eq("protocolo", protocolo)
      .order("data_geracao", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (planilhaConsolidada) {
      return new Response(
        JSON.stringify({ documento: planilhaConsolidada, tipo: "planilha_consolidada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 4. Encaminhamentos de Processo
    const { data: encaminhamento } = await supabase
      .from("encaminhamentos_processo")
      .select("id, protocolo, processo_numero, url, created_at")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (encaminhamento) {
      return new Response(
        JSON.stringify({ documento: encaminhamento, tipo: "encaminhamento" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 5. Planilhas de Habilitação
    const { data: planilhaHabilitacao } = await supabase
      .from("planilhas_habilitacao")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (planilhaHabilitacao) {
      return new Response(
        JSON.stringify({ documento: planilhaHabilitacao, tipo: "planilha_habilitacao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 6. Planilhas de Lances (Seleção)
    const { data: planilhaLances } = await supabase
      .from("planilhas_lances_selecao")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (planilhaLances) {
      return new Response(
        JSON.stringify({ documento: planilhaLances, tipo: "planilha_lances" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 7. Atas de Seleção
    const { data: ata } = await supabase
      .from("atas_selecao")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (ata) {
      return new Response(
        JSON.stringify({ documento: ata, tipo: "ata_selecao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 8. Homologações de Seleção
    const { data: homologacao } = await supabase
      .from("homologacoes_selecao")
      .select("id, protocolo, data_geracao, nome_arquivo, url_arquivo")
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (homologacao) {
      return new Response(
        JSON.stringify({ documento: homologacao, tipo: "homologacao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 9. Propostas de Seleção
    const { data: propostaSelecao } = await supabase
      .from("selecao_propostas_fornecedor")
      .select(`
        id, protocolo, valor_total_proposta, data_envio_proposta,
        fornecedores (razao_social, cnpj),
        selecoes_fornecedores (
          titulo_selecao,
          processos_compras (numero_processo_interno)
        )
      `)
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (propostaSelecao) {
      return new Response(
        JSON.stringify({ documento: propostaSelecao, tipo: "proposta_selecao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 10. Propostas Realinhadas
    const { data: propostaRealinhada } = await supabase
      .from("propostas_realinhadas")
      .select(`
        id, protocolo, valor_total_proposta, data_envio,
        fornecedores (razao_social, cnpj),
        selecoes_fornecedores (
          titulo_selecao,
          processos_compras (numero_processo_interno)
        )
      `)
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (propostaRealinhada) {
      return new Response(
        JSON.stringify({ documento: propostaRealinhada, tipo: "proposta_realinhada" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 11. Propostas de Cotação
    const { data: propostaCotacao } = await supabase
      .from("cotacao_respostas_fornecedor")
      .select(`
        id, protocolo, valor_total_anual_ofertado, data_envio_resposta,
        fornecedores (razao_social, cnpj),
        cotacoes_precos (
          titulo_cotacao,
          processos_compras (numero_processo_interno)
        )
      `)
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (propostaCotacao) {
      return new Response(
        JSON.stringify({ documento: propostaCotacao, tipo: "proposta_cotacao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 12. Recursos de Fornecedor (Compra Direta)
    const { data: recursoFornecedor } = await supabase
      .from("recursos_fornecedor")
      .select(`
        id, protocolo, data_envio, nome_arquivo, url_arquivo, mensagem_fornecedor,
        fornecedores (razao_social, cnpj),
        fornecedores_rejeitados_cotacao:rejeicao_id (
          cotacoes_precos (
            titulo_cotacao,
            processos_compras (numero_processo_interno)
          )
        )
      `)
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (recursoFornecedor) {
      return new Response(
        JSON.stringify({ documento: recursoFornecedor, tipo: "recurso_fornecedor" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 13. Recursos de Inabilitação (Seleção) - por protocolo_recurso
    const { data: recursoInabilitacao } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select(`
        id, protocolo_recurso, data_envio_recurso, motivo_recurso, url_pdf_recurso, nome_arquivo_recurso,
        fornecedores (razao_social, cnpj),
        selecoes_fornecedores:selecao_id (
          titulo_selecao,
          processos_compras (numero_processo_interno)
        )
      `)
      .eq("protocolo_recurso", protocolo)
      .maybeSingle();

    if (recursoInabilitacao) {
      return new Response(
        JSON.stringify({ documento: recursoInabilitacao, tipo: "recurso_inabilitacao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 14. Respostas de Recursos de Inabilitação (Seleção) - por protocolo_resposta
    const { data: respostaRecursoInab } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select(`
        id, protocolo_resposta, data_resposta_gestor, resposta_gestor, url_pdf_resposta, nome_arquivo_resposta, status_recurso, tipo_provimento,
        fornecedores (razao_social, cnpj),
        selecoes_fornecedores:selecao_id (
          titulo_selecao,
          processos_compras (numero_processo_interno)
        )
      `)
      .eq("protocolo_resposta", protocolo)
      .maybeSingle();

    if (respostaRecursoInab) {
      return new Response(
        JSON.stringify({ documento: respostaRecursoInab, tipo: "resposta_recurso_inabilitacao" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 15. Respostas de Recursos (Compra Direta)
    const { data: respostaRecurso } = await supabase
      .from("respostas_recursos")
      .select(`
        id, protocolo, data_resposta, decisao, texto_resposta, url_documento, nome_arquivo, tipo_provimento,
        recursos_fornecedor:recurso_id (
          fornecedores (razao_social, cnpj),
          fornecedores_rejeitados_cotacao:rejeicao_id (
            cotacoes_precos (
              titulo_cotacao,
              processos_compras (numero_processo_interno)
            )
          )
        )
      `)
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (respostaRecurso) {
      return new Response(
        JSON.stringify({ documento: respostaRecurso, tipo: "resposta_recurso" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 16. Protocolos de Documentos de Processo (requisição, capa, etc.)
    const { data: protocoloDocumento } = await supabase
      .from("protocolos_documentos_processo")
      .select(`
        id, protocolo, tipo_documento, nome_arquivo, url_arquivo, 
        responsavel_nome, data_geracao,
        processos_compras (numero_processo_interno)
      `)
      .eq("protocolo", protocolo)
      .maybeSingle();

    if (protocoloDocumento) {
      // Mapear tipo para label
      const tipoMap: Record<string, string> = {
        requisicao: "requisicao_compras",
        capa_processo: "capa_processo",
        autorizacao_despesa: "autorizacao_despesa"
      };
      const tipoRetorno = tipoMap[protocoloDocumento.tipo_documento] || protocoloDocumento.tipo_documento;
      
      return new Response(
        JSON.stringify({ documento: protocoloDocumento, tipo: tipoRetorno }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Não encontrou
    return new Response(
      JSON.stringify({ documento: null, tipo: null, error: "Documento não encontrado" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("Erro inesperado em verificar-documento:", e);
    return new Response(
      JSON.stringify({ documento: null, error: "Erro inesperado" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

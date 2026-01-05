import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "https://esm.sh/pdf-lib@1.17.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function calcularProximoDiaUtil(dataBase: Date, diasUteis: number): Date {
  const result = new Date(dataBase);
  let diasAdicionados = 0;
  while (diasAdicionados < diasUteis) {
    result.setDate(result.getDate() + 1);
    const diaSemana = result.getDay();
    if (diaSemana !== 0 && diaSemana !== 6) diasAdicionados++;
  }
  return result;
}

function sanitizeFilePart(value: string): string {
  return (value || "")
    .replace(/\s+/g, "-")
    .replace(/[^a-zA-Z0-9\-_.]/g, "")
    .slice(0, 80);
}

function gerarProtocolo(date: Date): string {
  const protocoloNumerico = String(date.getTime()).padStart(16, "0");
  return protocoloNumerico.match(/.{1,4}/g)?.join("-") || protocoloNumerico;
}

function wrapText(text: string, maxLen: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    if (next.length <= maxLen) {
      current = next;
    } else {
      if (current) lines.push(current);
      current = w;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));

    const selecaoId = typeof body?.selecao_id === "string" ? body.selecao_id : "";
    const codigoAcesso = typeof body?.codigo_acesso === "string" ? body.codigo_acesso : "";
    const recursoId = typeof body?.recurso_id === "string" ? body.recurso_id : "";
    const motivoRecurso = typeof body?.motivo_recurso === "string" ? body.motivo_recurso : "";

    const fornecedorNome = typeof body?.fornecedor_nome === "string" ? body.fornecedor_nome : "Fornecedor";
    const fornecedorCnpj = typeof body?.fornecedor_cnpj === "string" ? body.fornecedor_cnpj : "";
    const numeroProcesso = typeof body?.numero_processo === "string" ? body.numero_processo : "";
    const motivoInabilitacao = typeof body?.motivo_inabilitacao === "string" ? body.motivo_inabilitacao : "";
    const numeroSelecao = typeof body?.numero_selecao === "string" ? body.numero_selecao : "";

    if (!selecaoId || !codigoAcesso || !recursoId || !motivoRecurso.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: "Dados inválidos" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });

    // Validar código de acesso e obter fornecedor
    const { data: proposta, error: propostaError } = await supabase
      .from("selecao_propostas_fornecedor")
      .select("fornecedor_id")
      .eq("selecao_id", selecaoId)
      .eq("codigo_acesso", codigoAcesso)
      .limit(1)
      .maybeSingle();

    if (propostaError || !proposta?.fornecedor_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Código de acesso inválido" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const fornecedorId = String(proposta.fornecedor_id);

    // Validar recurso
    const { data: recurso, error: recursoError } = await supabase
      .from("recursos_inabilitacao_selecao")
      .select("id, status_recurso, data_limite_fornecedor, selecao_id, fornecedor_id")
      .eq("id", recursoId)
      .maybeSingle();

    if (recursoError || !recurso) {
      return new Response(
        JSON.stringify({ success: false, error: "Recurso não encontrado" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (String(recurso.selecao_id) !== selecaoId || String(recurso.fornecedor_id) !== fornecedorId) {
      return new Response(
        JSON.stringify({ success: false, error: "Recurso não pertence ao fornecedor" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (recurso.status_recurso !== "aguardando_envio") {
      return new Response(
        JSON.stringify({ success: false, error: "Recurso já foi enviado" }),
        { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (recurso.data_limite_fornecedor) {
      const limite = new Date(String(recurso.data_limite_fornecedor)).getTime();
      if (!Number.isNaN(limite) && Date.now() > limite) {
        return new Response(
          JSON.stringify({ success: false, error: "Prazo do recurso expirado" }),
          { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Gerar PDF
    const agora = new Date();
    const protocolo = gerarProtocolo(agora);

    const pdfDoc = await PDFDocument.create();
    const page = pdfDoc.addPage([595.28, 841.89]); // A4 em pontos
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const marginX = 48;
    let y = 841.89 - 48;

    // Faixa superior (teal)
    page.drawRectangle({ x: 0, y: 841.89 - 56, width: 595.28, height: 56, color: rgb(0, 0.502, 0.502) });
    page.drawText("RECURSO DE INABILITAÇÃO", {
      x: 595.28 / 2 - fontBold.widthOfTextAtSize("RECURSO DE INABILITAÇÃO", 16) / 2,
      y: 841.89 - 40,
      size: 16,
      font: fontBold,
      color: rgb(1, 1, 1),
    });

    y -= 72;

    const infoLines: string[] = [
      `Processo: ${numeroProcesso || "-"}`,
      numeroSelecao ? `Seleção: ${numeroSelecao}` : "",
      `Recorrente: ${fornecedorNome}`,
      `CNPJ: ${fornecedorCnpj || "-"}`,
      `Data: ${agora.toLocaleString("pt-BR")}`,
      `Protocolo: ${protocolo}`,
    ].filter(Boolean);

    for (const line of infoLines) {
      page.drawText(line, { x: marginX, y, size: 11, font });
      y -= 16;
    }

    y -= 8;

    const drawSection = (title: string, content: string) => {
      page.drawText(title, { x: marginX, y, size: 12, font: fontBold, color: rgb(0, 0.502, 0.502) });
      y -= 18;

      const lines = wrapText(content || "-", 110);
      for (const line of lines) {
        if (y < 72) {
          // nova página
          const p = pdfDoc.addPage([595.28, 841.89]);
          y = 841.89 - 48;
          p.drawRectangle({ x: 0, y: 841.89 - 56, width: 595.28, height: 56, color: rgb(0, 0.502, 0.502) });
          p.drawText("RECURSO DE INABILITAÇÃO", {
            x: 595.28 / 2 - fontBold.widthOfTextAtSize("RECURSO DE INABILITAÇÃO", 16) / 2,
            y: 841.89 - 40,
            size: 16,
            font: fontBold,
            color: rgb(1, 1, 1),
          });
          y -= 72;

          // trocar referência de page por closure hack: desenhar sempre na última página
        }

        const currentPage = pdfDoc.getPages()[pdfDoc.getPageCount() - 1];
        currentPage.drawText(line, { x: marginX, y, size: 11, font, color: rgb(0, 0, 0) });
        y -= 14;
      }
      y -= 12;
    };

    drawSection("MOTIVO DA INABILITAÇÃO", motivoInabilitacao || "-");
    drawSection("RAZÕES DO RECURSO", motivoRecurso);

    // Upload
    const fileName = `recurso_${sanitizeFilePart(numeroProcesso || "processo")}_${Date.now()}.pdf`;
    const storagePath = `recursos/enviados/${fileName}`;

    const pdfBytes = await pdfDoc.save();

    const { error: uploadError } = await supabase.storage
      .from("processo-anexos")
      .upload(storagePath, pdfBytes, { contentType: "application/pdf", upsert: false });

    if (uploadError) {
      console.error("Erro upload PDF recurso:", uploadError);
      return new Response(
        JSON.stringify({ success: false, error: "Falha ao salvar PDF" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const { data: urlData } = supabase.storage.from("processo-anexos").getPublicUrl(storagePath);
    const pdfUrl = urlData.publicUrl;

    // Atualizar registro
    const dataEnvio = agora.toISOString();
    const dataLimiteGestor = calcularProximoDiaUtil(agora, 1).toISOString();

    const { error: updateError } = await supabase
      .from("recursos_inabilitacao_selecao")
      .update({
        motivo_recurso: motivoRecurso,
        data_envio_recurso: dataEnvio,
        status_recurso: "enviado",
        data_limite_gestor: dataLimiteGestor,
        url_pdf_recurso: pdfUrl,
        nome_arquivo_recurso: fileName,
        protocolo_recurso: protocolo,
      })
      .eq("id", recursoId);

    if (updateError) {
      console.error("Erro update recurso_inabilitacao_selecao:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Falha ao registrar envio" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        url: pdfUrl,
        fileName,
        protocolo,
        data_envio_recurso: dataEnvio,
        data_limite_gestor: dataLimiteGestor,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    console.error("Erro em enviar-recurso-inabilitacao:", err);
    const msg = err instanceof Error ? err.message : "Erro desconhecido";
    return new Response(
      JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

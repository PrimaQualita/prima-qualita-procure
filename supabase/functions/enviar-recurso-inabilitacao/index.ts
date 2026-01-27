import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "npm:@supabase/supabase-js@2.81.0";
import {
  PDFDocument,
  StandardFonts,
  rgb,
} from "npm:pdf-lib@1.17.1";

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

function decodeHtmlEntities(input: string): string {
  return (input || "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function normalizeToParagraphs(text: string): string[] {
  const normalized = decodeHtmlEntities(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    // converter quebras HTML comuns em quebras reais
    .replace(/<br\s*\/?\s*>/gi, "\n")
    .replace(/<\/?p\s*>/gi, "\n\n")
    // remover demais tags
    .replace(/<[^>]*>/g, " ")
    // normalizar múltiplas quebras e espaços
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n[ \t]+/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  if (!normalized) return [""];

  // parágrafos: quebras duplas; dentro do parágrafo, quebras simples viram espaço
  const paragraphs = normalized
    .split(/\n{2,}/)
    .map((p) => p.replace(/\n/g, " ").replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return paragraphs.length ? paragraphs : [""];
}

function wrapTextToWidth(text: string, font: any, fontSize: number, maxWidth: number): string[] {
  const words = (text || "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";

  for (const w of words) {
    const next = current ? `${current} ${w}` : w;
    const width = font.widthOfTextAtSize(next, fontSize);

    if (width <= maxWidth) {
      current = next;
      continue;
    }

    if (current) lines.push(current);
    current = w;
  }

  if (current) lines.push(current);
  return lines.length ? lines : [""];
}

function drawTextLine(
  page: any,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  font: any,
  fontSize: number,
  color: any,
  justify: boolean,
) {
  const line = (text || "").trim();
  if (!justify) {
    page.drawText(line, { x, y, size: fontSize, font, color });
    return;
  }

  const words = line.split(/\s+/).filter(Boolean);
  if (words.length <= 1) {
    page.drawText(line, { x, y, size: fontSize, font, color });
    return;
  }

  const normalSpace = font.widthOfTextAtSize(" ", fontSize);

  const wordsWidth = words.reduce((sum: number, w: string) => sum + font.widthOfTextAtSize(w, fontSize), 0);
  const gaps = words.length - 1;
  const extra = maxWidth - wordsWidth;
  const gapWidth = extra / gaps;

  // se ficar “estourado”, não justifica
  if (!Number.isFinite(gapWidth) || gapWidth > normalSpace * 3 || gapWidth < 0) {
    page.drawText(line, { x, y, size: fontSize, font, color });
    return;
  }

  let cursorX = x;
  for (let i = 0; i < words.length; i++) {
    const w = words[i];
    page.drawText(w, { x: cursorX, y, size: fontSize, font, color });
    cursorX += font.widthOfTextAtSize(w, fontSize);
    if (i < words.length - 1) cursorX += gapWidth;
  }
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

    // Gerar PDF (com formatação automática: parágrafos, quebra por largura e justificação)
    const agora = new Date();
    const protocolo = gerarProtocolo(agora);

    const pageWidth = 595.28;
    const pageHeight = 841.89;
    const marginX = 48;
    const marginBottom = 72;
    const maxWidth = pageWidth - marginX * 2;

    const bodyFontSize = 11;
    const sectionTitleSize = 12;
    const headerTitleSize = 16;
    const lineHeight = 14;

    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    let currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
    let y = 0;

    const drawHeader = (p: any) => {
      p.drawRectangle({ x: 0, y: pageHeight - 56, width: pageWidth, height: 56, color: rgb(0, 0.502, 0.502) });
      const titulo = "RECURSO DE INABILITAÇÃO";
      p.drawText(titulo, {
        x: pageWidth / 2 - fontBold.widthOfTextAtSize(titulo, headerTitleSize) / 2,
        y: pageHeight - 40,
        size: headerTitleSize,
        font: fontBold,
        color: rgb(1, 1, 1),
      });
    };

    const newPage = () => {
      currentPage = pdfDoc.addPage([pageWidth, pageHeight]);
      drawHeader(currentPage);
      // mesma folga do layout atual (topo + respiro após o cabeçalho)
      y = pageHeight - 48 - 72;
    };

    drawHeader(currentPage);
    y = pageHeight - 48 - 72;

    const ensureSpace = (needed: number) => {
      if (y - needed < marginBottom) newPage();
    };

    const infoLines: string[] = [
      `Processo: ${numeroProcesso || "-"}`,
      numeroSelecao ? `Seleção: ${numeroSelecao}` : "",
      `Recorrente: ${fornecedorNome}`,
      `CNPJ: ${fornecedorCnpj || "-"}`,
      `Data: ${agora.toLocaleString("pt-BR")}`,
      `Protocolo: ${protocolo}`,
    ].filter(Boolean);

    for (const line of infoLines) {
      ensureSpace(16);
      currentPage.drawText(line, { x: marginX, y, size: bodyFontSize, font, color: rgb(0, 0, 0) });
      y -= 16;
    }

    y -= 8;

    const drawSection = (title: string, content: string) => {
      ensureSpace(18 + lineHeight);
      currentPage.drawText(title, { x: marginX, y, size: sectionTitleSize, font: fontBold, color: rgb(0, 0.502, 0.502) });
      y -= 18;

      const paragraphs = normalizeToParagraphs(content || "-");
      paragraphs.forEach((p, pIndex) => {
        if (pIndex > 0) y -= lineHeight * 0.6;

        const lines = wrapTextToWidth(p, font, bodyFontSize, maxWidth);
        lines.forEach((line, idx) => {
          ensureSpace(lineHeight);
          const isLastLine = idx === lines.length - 1;
          drawTextLine(currentPage, line, marginX, y, maxWidth, font, bodyFontSize, rgb(0, 0, 0), !isLastLine);
          y -= lineHeight;
        });
      });

      y -= 12;
    };

    drawSection("MOTIVO DA INABILITAÇÃO", motivoInabilitacao || "-");
    drawSection("RAZÕES DO RECURSO", motivoRecurso);

    // ===== CERTIFICAÇÃO DIGITAL (igual ao frontend) =====
    const certHeight = 85;
    ensureSpace(certHeight + 10);
    y -= 15; // espaço antes da certificação

    const certX = marginX;
    const certWidth = maxWidth;
    const certBoxY = y - certHeight;

    // Fundo cinza claro (245/255 = 0.96)
    currentPage.drawRectangle({
      x: certX,
      y: certBoxY,
      width: certWidth,
      height: certHeight,
      color: rgb(0.96, 0.96, 0.96),
    });

    // Borda preta
    currentPage.drawRectangle({
      x: certX,
      y: certBoxY,
      width: certWidth,
      height: certHeight,
      borderColor: rgb(0, 0, 0),
      borderWidth: 0.5,
    });

    // Título "CERTIFICAÇÃO DIGITAL" centralizado em azul escuro
    const certTitleSize = 12;
    const certBodySize = 10;
    const certSmallSize = 8;
    let certY = certBoxY + certHeight - 16;
    
    const titleText = "CERTIFICAÇÃO DIGITAL";
    const titleWidth = fontBold.widthOfTextAtSize(titleText, certTitleSize);
    currentPage.drawText(titleText, {
      x: certX + (certWidth - titleWidth) / 2,
      y: certY,
      size: certTitleSize,
      font: fontBold,
      color: rgb(0, 0, 0.545), // azul escuro (0, 0, 139) / 255
    });

    certY -= 16;
    currentPage.drawText(`Protocolo: ${protocolo}`, {
      x: certX + 8,
      y: certY,
      size: certBodySize,
      font,
      color: rgb(0, 0, 0),
    });

    certY -= 14;
    currentPage.drawText(`Responsável: ${fornecedorNome}`, {
      x: certX + 8,
      y: certY,
      size: certBodySize,
      font,
      color: rgb(0, 0, 0),
    });

    // "Verificar autenticidade em:" em negrito
    certY -= 12;
    currentPage.drawText("Verificar autenticidade em:", {
      x: certX + 8,
      y: certY,
      size: certBodySize,
      font: fontBold,
      color: rgb(0, 0, 0),
    });

    // Link em azul
    certY -= 12;
    const siteUrlFromClient =
      (typeof body?.site_url === "string" && body.site_url.trim()) ||
      (typeof body?.siteUrl === "string" && body.siteUrl.trim()) ||
      "";
    const baseUrl = (siteUrlFromClient || Deno.env.get("SITE_URL") || "https://primaqualita.lovable.app")
      .trim()
      .replace(/\/+$/, "");
    const linkUrl = `${baseUrl}/verificar-documento?protocolo=${encodeURIComponent(protocolo)}`;
    currentPage.drawText(linkUrl, {
      x: certX + 8,
      y: certY,
      size: certSmallSize,
      font,
      color: rgb(0, 0, 1), // azul
    });

    // Texto legal
    certY -= 12;
    currentPage.drawText("Este documento possui certificação digital conforme Lei 14.063/2020", {
      x: certX + 8,
      y: certY,
      size: 7,
      font,
      color: rgb(0.31, 0.31, 0.31), // cinza (80/255)
    });

    y = certBoxY - 8;

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

    // ===== AUDITORIA =====
    // Buscar dados adicionais para auditoria
    const { data: selecaoData, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select(`
        titulo_selecao,
        processos_compras!inner(
          numero_processo_interno,
          contratos_gestao(nome_contrato)
        )
      `)
      .eq("id", selecaoId)
      .maybeSingle();

    if (selecaoError) {
      console.warn("Erro ao buscar dados da seleção para auditoria:", selecaoError);
    }

    const numeroProcessoAudit = (selecaoData as any)?.processos_compras?.numero_processo_interno || numeroProcesso || "";
    const contratoGestao = (selecaoData as any)?.processos_compras?.contratos_gestao?.nome_contrato || "";
    const tituloSelecao = selecaoData?.titulo_selecao || numeroSelecao || "";

    const { error: auditError } = await supabase
      .from("audit_logs")
      .insert({
        acao: "criação",
        entidade: "Recurso Inabilitação",
        entidade_id: recursoId,
        usuario_nome: fornecedorNome || "Fornecedor",
        usuario_tipo: "fornecedor",
        detalhes: {
          tipo: "Recurso de Inabilitação - Envio Fornecedor",
          protocolo: protocolo,
          fornecedor: fornecedorNome,
          cnpj: fornecedorCnpj,
          numero_processo: numeroProcessoAudit,
          contrato_gestao: contratoGestao,
          titulo_selecao: tituloSelecao,
          motivo_inabilitacao: motivoInabilitacao,
        },
      });

    if (auditError) {
      console.error("Erro ao registrar auditoria do recurso:", auditError);
    } else {
      console.log("Auditoria de recurso registrada com sucesso:", protocolo);
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

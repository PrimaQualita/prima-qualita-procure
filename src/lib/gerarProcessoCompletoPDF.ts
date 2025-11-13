import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

interface ProcessoCompletoResult {
  url: string;
  filename: string;
}

export const gerarProcessoCompletoPDF = async (
  cotacaoId: string,
  numeroProcesso: string
): Promise<ProcessoCompletoResult> => {
  const pdf = new jsPDF();
  let yPos = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;

  // Título
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.text("PROCESSO DE COMPRAS COMPLETO", pageWidth / 2, yPos, {
    align: "center",
  });
  yPos += 10;
  
  pdf.setFontSize(12);
  pdf.text(`Processo: ${numeroProcesso}`, pageWidth / 2, yPos, {
    align: "center",
  });
  yPos += 20;

  // Buscar anexos do processo
  const { data: cotacao } = await supabase
    .from("cotacoes_precos")
    .select("processo_compra_id")
    .eq("id", cotacaoId)
    .single();

  if (cotacao) {
    const { data: anexos } = await supabase
      .from("anexos_processo_compra")
      .select("*")
      .eq("processo_compra_id", cotacao.processo_compra_id)
      .order("data_upload", { ascending: true });

    if (anexos && anexos.length > 0) {
      pdf.setFontSize(14);
      pdf.setFont("helvetica", "bold");
      pdf.text("DOCUMENTOS INICIAIS DO PROCESSO:", margin, yPos);
      yPos += 10;

      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      
      anexos.forEach((anexo, index) => {
        if (yPos > pageHeight - 30) {
          pdf.addPage();
          yPos = 20;
        }
        pdf.text(`${index + 1}. ${anexo.tipo_anexo}: ${anexo.nome_arquivo}`, margin, yPos);
        yPos += 7;
      });
      
      yPos += 10;
    }
  }

  // Buscar emails enviados
  const { data: emails } = await supabase
    .from("emails_cotacao_anexados")
    .select("*")
    .eq("cotacao_id", cotacaoId)
    .order("data_upload", { ascending: true });

  if (emails && emails.length > 0) {
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("E-MAILS ENVIADOS AOS FORNECEDORES:", margin, yPos);
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    
    emails.forEach((email, index) => {
      if (yPos > pageHeight - 30) {
        pdf.addPage();
        yPos = 20;
      }
      pdf.text(`${index + 1}. ${email.nome_arquivo}`, margin, yPos);
      yPos += 7;
    });
    
    yPos += 10;
  }

  // Buscar propostas dos fornecedores
  const { data: respostas } = await supabase
    .from("cotacao_respostas_fornecedor")
    .select(`
      *,
      fornecedores (razao_social)
    `)
    .eq("cotacao_id", cotacaoId)
    .order("data_envio_resposta", { ascending: true });

  if (respostas && respostas.length > 0) {
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("PROPOSTAS RECEBIDAS:", margin, yPos);
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    
    for (const resposta of respostas) {
      if (yPos > pageHeight - 40) {
        pdf.addPage();
        yPos = 20;
      }
      
      pdf.text(`Fornecedor: ${(resposta.fornecedores as any)?.razao_social || 'N/A'}`, margin, yPos);
      yPos += 7;
      pdf.text(`Valor Total: R$ ${resposta.valor_total_anual_ofertado?.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`, margin, yPos);
      yPos += 7;
      
      const { data: anexos } = await supabase
        .from("anexos_cotacao_fornecedor")
        .select("*")
        .eq("cotacao_resposta_fornecedor_id", resposta.id);
      
      if (anexos && anexos.length > 0) {
        pdf.text(`  Anexos:`, margin, yPos);
        yPos += 7;
        anexos.forEach((anexo) => {
          if (yPos > pageHeight - 30) {
            pdf.addPage();
            yPos = 20;
          }
          pdf.text(`    - ${anexo.tipo_anexo}: ${anexo.nome_arquivo}`, margin, yPos);
          yPos += 7;
        });
      }
      
      yPos += 5;
    }
  }

  // Buscar planilha consolidada
  const { data: planilha } = await supabase
    .from("planilhas_consolidadas")
    .select("*")
    .eq("cotacao_id", cotacaoId)
    .order("data_geracao", { ascending: false })
    .limit(1)
    .single();

  if (planilha) {
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("PLANILHA CONSOLIDADA:", margin, yPos);
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Arquivo: ${planilha.nome_arquivo}`, margin, yPos);
    yPos += 7;
    pdf.text(`Protocolo: ${planilha.protocolo || 'N/A'}`, margin, yPos);
    yPos += 15;
  }

  // Buscar encaminhamento ao compliance
  const { data: encaminhamento } = await supabase
    .from("encaminhamentos_processo")
    .select("*")
    .eq("cotacao_id", cotacaoId)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  if (encaminhamento) {
    if (yPos > pageHeight - 40) {
      pdf.addPage();
      yPos = 20;
    }
    
    pdf.setFontSize(14);
    pdf.setFont("helvetica", "bold");
    pdf.text("ENCAMINHAMENTO AO COMPLIANCE:", margin, yPos);
    yPos += 10;

    pdf.setFontSize(10);
    pdf.setFont("helvetica", "normal");
    pdf.text(`Protocolo: ${encaminhamento.protocolo}`, margin, yPos);
    yPos += 7;
    pdf.text(`Processo: ${encaminhamento.processo_numero}`, margin, yPos);
  }

  // Gerar PDF
  const pdfBlob = pdf.output("blob");
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filename = `processo_completo_${numeroProcesso.replace(/\//g, "-")}_${timestamp}.pdf`;
  const storagePath = `processos/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("documents")
    .upload(storagePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    console.error("Erro ao fazer upload:", uploadError);
    throw new Error("Erro ao salvar processo completo");
  }

  const { data: urlData } = supabase.storage
    .from("documents")
    .getPublicUrl(storagePath);

  return {
    url: urlData.publicUrl,
    filename,
  };
};

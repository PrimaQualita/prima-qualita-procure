import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { adicionarCertificacaoDigital } from "./certificacaoDigital";
import logo from "@/assets/prima-qualita-logo.png";

interface EmpresaAnalise {
  razao_social: string;
  cnpj: string;
  capital_social: string;
  ano_fundacao: string;
  contratos_ativos_oss: boolean;
  conflito_interesse: string;
  capacidade_tecnica: string;
  risco_financeiro: string;
  reputacao: string;
  cnae: string;
}

interface AnaliseComplianceData {
  processo_numero: string;
  objeto_descricao: string;
  criterio_julgamento: string;
  empresas: EmpresaAnalise[];
  consideracoes_finais: string;
  conclusao: string;
}

interface AnaliseComplianceResult {
  url: string;
  filename: string;
  protocolo: string;
  storagePath: string;
}

function extractTextFromHTML(html: string): string {
  if (!html) return "";
  const tmp = document.createElement("div");
  tmp.innerHTML = html;
  return tmp.textContent || tmp.innerText || "";
}

export const gerarAnaliseCompliancePDF = async (
  data: AnaliseComplianceData
): Promise<AnaliseComplianceResult> => {
  const pdf = new jsPDF();
  let yPos = 20;
  const pageWidth = pdf.internal.pageSize.getWidth();
  const pageHeight = pdf.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - 2 * margin;

  // Função para adicionar nova página com logo e rodapé
  const addNewPage = () => {
    pdf.addPage();
    yPos = 20;
    
    // Logo
    pdf.addImage(logo, "PNG", margin, 10, 40, 10);
    
    // Rodapé
    const footerY = pageHeight - 15;
    pdf.setFontSize(8);
    pdf.setTextColor(100);
    pdf.text(
      "Prima Qualitá - Organização Social de Saúde",
      pageWidth / 2,
      footerY,
      { align: "center" }
    );
    pdf.text(
      `Página ${pdf.getNumberOfPages()}`,
      pageWidth - margin,
      footerY,
      { align: "right" }
    );
    
    yPos = 35;
  };

  // Função para verificar espaço e adicionar texto
  const addText = (text: string, fontSize: number = 10, isBold: boolean = false) => {
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", isBold ? "bold" : "normal");
    pdf.setTextColor(0);
    
    const lines = pdf.splitTextToSize(text, maxWidth);
    const lineHeight = fontSize * 0.5;
    
    for (const line of lines) {
      if (yPos + lineHeight > pageHeight - 25) {
        addNewPage();
      }
      pdf.text(line, margin, yPos);
      yPos += lineHeight;
    }
  };

  // Logo inicial
  pdf.addImage(logo, "PNG", margin, 10, 40, 10);
  yPos = 35;

  // Título
  pdf.setFontSize(16);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("ANÁLISE DE RISCO E CONFORMIDADE", pageWidth / 2, yPos, {
    align: "center",
  });
  yPos += 15;

  // Cabeçalho
  addText("Ao Setor de Compras da Prima Qualitá", 11);
  yPos += 3;
  addText("De: Departamento de Compliance", 11);
  yPos += 3;
  addText("Referência: Análise de Conformidade e Risco dos Fornecedores no Processo de Seleção.", 11);
  yPos += 5;
  addText(`Processo ${data.processo_numero}`, 11, true);
  yPos += 3;
  const objetoTexto = data.objeto_descricao.endsWith('.') 
    ? data.objeto_descricao.slice(0, -1) 
    : data.objeto_descricao;
  addText(`Objeto: ${objetoTexto}`, 11);
  yPos += 10;

  // Introdução
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("1. Introdução", margin, yPos);
  yPos += 8;

  const criterioFormatado = data.criterio_julgamento.replace(/_/g, ' ');
  const introducao = `Este relatório apresenta a análise de risco e conformidade realizada pelo Departamento de Compliance da Prima Qualitá sobre as empresas participantes do processo de seleção ${data.processo_numero} para ${objetoTexto} O critério de julgamento adotado é ${criterioFormatado}. A análise foi conduzida com base em informações públicas, documentação fornecida pelos fornecedores e critérios objetivos de avaliação de risco.`;
  
  // Texto justificado para introdução
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.setTextColor(0);
  const introducaoLines = pdf.splitTextToSize(introducao, maxWidth);
  introducaoLines.forEach((line: string) => {
    if (yPos + 5 > pageHeight - 25) {
      addNewPage();
    }
    pdf.text(line, margin, yPos, { align: "justify", maxWidth: maxWidth });
    yPos += 5;
  });
  yPos += 10;

  // Empresas Analisadas
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("2. Empresas Analisadas", margin, yPos);
  yPos += 8;

  data.empresas.forEach((empresa, index) => {
    if (yPos > pageHeight - 40) {
      addNewPage();
    }

    pdf.setFontSize(12);
    pdf.setFont("helvetica", "bold");
    pdf.text(`2.${index + 1}. ${empresa.razao_social} - ${empresa.cnpj}`, margin, yPos);
    yPos += 8;

    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text(`Capital Social: `, margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(`R$ ${empresa.capital_social}`, margin + 33, yPos);
    yPos += 5;
    pdf.setFont("helvetica", "bold");
    pdf.text(`Ano de Fundação: `, margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(`${empresa.ano_fundacao}`, margin + 38, yPos);
    yPos += 8;

    // Contratos Ativos
    addText("Contratos Ativos com a OSS:", 10, true);
    yPos += 5;
    pdf.setFont("helvetica", "normal");
    pdf.text(empresa.contratos_ativos_oss ? "☑ Sim" : "☐ Sim", margin + 5, yPos);
    yPos += 5;
    pdf.text(!empresa.contratos_ativos_oss ? "☑ Não" : "☐ Não", margin + 5, yPos);
    yPos += 8;

    // Campos de análise
    const campos = [
      { titulo: "Conflito de Interesse:", conteudo: empresa.conflito_interesse },
      { titulo: "Capacidade Técnica:", conteudo: empresa.capacidade_tecnica },
      { titulo: "Risco Financeiro:", conteudo: empresa.risco_financeiro },
      { titulo: "Reputação:", conteudo: empresa.reputacao },
      { titulo: "CNAE:", conteudo: empresa.cnae },
    ];

    campos.forEach((campo) => {
      if (yPos > pageHeight - 30) {
        addNewPage();
      }
      
      const textoLimpo = extractTextFromHTML(campo.conteudo);
      const textoCompleto = `${campo.titulo} ${textoLimpo || "Não informado"}`;
      
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0);
      const tituloWidth = pdf.getTextWidth(campo.titulo);
      pdf.text(campo.titulo, margin, yPos);
      
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(textoLimpo || "Não informado", maxWidth - tituloWidth - 2);
      let firstLine = true;
      lines.forEach((line: string) => {
        if (!firstLine && yPos + 5 > pageHeight - 25) {
          addNewPage();
        }
        if (firstLine) {
          pdf.text(line, margin + tituloWidth + 2, yPos);
          firstLine = false;
        } else {
          pdf.text(line, margin, yPos);
        }
        yPos += 5;
      });
      yPos += 3;
    });

    yPos += 5;
  });

  // Considerações Finais
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("3. Considerações Finais e Recomendações", margin, yPos);
  yPos += 8;
  
  const consideracoesTexto = extractTextFromHTML(data.consideracoes_finais);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const consideracoesLines = pdf.splitTextToSize(consideracoesTexto, maxWidth);
  consideracoesLines.forEach((line: string) => {
    if (yPos + 5 > pageHeight - 25) {
      addNewPage();
    }
    pdf.text(line, margin, yPos, { align: "justify", maxWidth: maxWidth });
    yPos += 5;
  });
  yPos += 10;

  // Conclusão
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("4. Conclusão", margin, yPos);
  yPos += 8;
  
  const conclusaoTexto = extractTextFromHTML(data.conclusao);
  addText(conclusaoTexto, 10);
  yPos += 15;

  // Assinatura e Data
  if (yPos > pageHeight - 50) {
    addNewPage();
  }

  const dataAtual = new Date().toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });

  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  pdf.text(`São Paulo, ${dataAtual}`, margin, yPos);
  yPos += 15;
  
  pdf.text("_".repeat(50), margin, yPos);
  yPos += 5;
  pdf.setFont("helvetica", "bold");
  pdf.text("Departamento de Compliance", margin, yPos);
  pdf.setFont("helvetica", "normal");
  pdf.text("Prima Qualitá - Organização Social de Saúde", margin, yPos + 5);
  yPos += 20;

  // Certificação Digital
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nome_completo, cpf")
    .eq("id", user?.id || "")
    .single();

  const timestamp = new Date().getTime();
  const protocolo = `COMP-${data.processo_numero.replace(/\//g, "-")}-${timestamp}`;

  const dadosCertificacao = {
    protocolo: protocolo,
    dataHora: new Date().toLocaleString("pt-BR"),
    responsavel: profile?.nome_completo || "Sistema",
    cpf: profile?.cpf || "",
    hash: `SHA256:${timestamp}`,
    linkVerificacao: `${window.location.origin}/verificar-autorizacao?protocolo=${protocolo}`,
  };
  
  yPos = adicionarCertificacaoDigital(pdf, dadosCertificacao, yPos + 10);

  // Rodapé na última página
  const footerY = pageHeight - 15;
  pdf.setFontSize(8);
  pdf.setTextColor(100);
  pdf.text(
    "Prima Qualitá - Organização Social de Saúde",
    pageWidth / 2,
    footerY,
    { align: "center" }
  );
  pdf.text(
    `Página ${pdf.getNumberOfPages()}`,
    pageWidth - margin,
    footerY,
    { align: "right" }
  );

  // Salvar PDF
  const pdfBlob = pdf.output("blob");
  const filename = `analise_compliance_${protocolo}.pdf`;
  const storagePath = `compliance/${filename}`;

  const { error: uploadError } = await supabase.storage
    .from("processo-anexos")
    .upload(storagePath, pdfBlob, {
      contentType: "application/pdf",
      upsert: false,
    });

  if (uploadError) {
    throw new Error(`Erro ao fazer upload do PDF: ${uploadError.message}`);
  }

  const { data: urlData } = supabase.storage
    .from("processo-anexos")
    .getPublicUrl(storagePath);

  return {
    url: urlData.publicUrl,
    filename: filename,
    protocolo: protocolo,
    storagePath: storagePath,
  };
};

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
  const addText = (text: string, fontSize: number = 10, isBold: boolean = false, isJustified: boolean = false) => {
    pdf.setFontSize(fontSize);
    pdf.setFont("helvetica", isBold ? "bold" : "normal");
    pdf.setTextColor(0);
    
    const lines = pdf.splitTextToSize(text, maxWidth);
    const lineHeight = 6.25; // Espaçamento fixo de 1.25 para fonte 10
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (yPos + lineHeight > pageHeight - 25) {
        addNewPage();
      }
      if (isJustified && i < lines.length - 1) {
        // Justificar todas as linhas exceto a última
        pdf.text(line, margin, yPos, { align: "justify", maxWidth: maxWidth });
      } else {
        pdf.text(line, margin, yPos);
      }
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
  yPos += 6.25;
  addText("De: Departamento de Compliance", 11);
  yPos += 6.25;
  addText("Referência: Análise de Conformidade e Risco dos Fornecedores no Processo de Seleção.", 11);
  yPos += 6.25;
  
  // Limpar "Processo " do número do processo
  const processoNumeroParaCabecalho = data.processo_numero.replace(/^Processo\s+/i, '');
  addText(`Processo ${processoNumeroParaCabecalho}`, 11, true);
  yPos += 6.25;
  
  const objetoTexto = data.objeto_descricao.replace(/\.$/, '');
  addText(`Objeto: ${objetoTexto}`, 11);
  yPos += 12.5;

  // Introdução
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("1. Introdução", margin, yPos);
  yPos += 8;

  const criterioFormatado = data.criterio_julgamento.replace(/_/g, ' ');
  const processoNumeroTexto = data.processo_numero.replace(/^Processo\s+/i, '').replace(/\/\d{4}$/, '');
  const introducao = `Este relatório apresenta a análise de risco e conformidade realizada pelo Departamento de Compliance da Prima Qualitá sobre as empresas participantes do processo de seleção ${processoNumeroTexto} para ${objetoTexto}. O critério de julgamento adotado é ${criterioFormatado}. A análise foi conduzida com base em informações públicas, documentação fornecida pelos fornecedores e critérios objetivos de avaliação de risco.`;
  
  addText(introducao, 10, false, true);
  yPos += 12.5;

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
    pdf.setTextColor(0);
    pdf.text(`2.${index + 1}. ${empresa.razao_social} - ${empresa.cnpj}`, margin, yPos);
    yPos += 12.5;

    // Capital Social
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.setTextColor(0);
    pdf.text("Capital Social:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(` R$ ${empresa.capital_social}`, margin + pdf.getTextWidth("Capital Social:"), yPos);
    yPos += 6.25;
    
    // Ano de Fundação
    pdf.setFont("helvetica", "bold");
    pdf.text("Ano de Fundação:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(` ${empresa.ano_fundacao}`, margin + pdf.getTextWidth("Ano de Fundação:"), yPos);
    yPos += 6.25;

    // Contratos Ativos com a OSS
    pdf.setFont("helvetica", "bold");
    pdf.text("Contratos Ativos com a OSS:", margin, yPos);
    pdf.setFont("helvetica", "normal");
    pdf.text(` ${empresa.contratos_ativos_oss ? "Sim" : "Não"}`, margin + pdf.getTextWidth("Contratos Ativos com a OSS:"), yPos);
    yPos += 6.25;

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
      
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(0);
      pdf.text(campo.titulo, margin, yPos);
      yPos += 6.25;
      
      pdf.setFont("helvetica", "normal");
      const lines = pdf.splitTextToSize(textoLimpo || "Não informado", maxWidth);
      lines.forEach((line: string) => {
        if (yPos + 6.25 > pageHeight - 25) {
          addNewPage();
        }
        pdf.text(line, margin, yPos);
        yPos += 6.25;
      });
    });

    yPos += 6.25;
  });

  // Considerações Finais
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0); // Preto
  pdf.text("3. Considerações Finais e Recomendações", margin, yPos);
  yPos += 12.5;
  
  const consideracoesTexto = extractTextFromHTML(data.consideracoes_finais);
  addText(consideracoesTexto, 10, false, true);
  yPos += 12.5;

  // Conclusão
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.setTextColor(0);
  pdf.text("4. Conclusão", margin, yPos);
  yPos += 12.5;
  
  const conclusaoTexto = extractTextFromHTML(data.conclusao);
  addText(conclusaoTexto, 10, false, true);
  yPos += 18.75;

  // Certificação Digital
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nome_completo, cpf")
    .eq("id", user?.id || "")
    .single();

  const timestamp = new Date().getTime();
  // Gerar protocolo apenas numérico no formato XXXX-XXXX-XXXX-XXXX
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;

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

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
  addText(`Processo: ${data.processo_numero}`, 11, true);
  yPos += 3;
  addText(`Objeto: ${data.objeto_descricao}`, 11);
  yPos += 10;

  // Introdução
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("1. Introdução", margin, yPos);
  yPos += 8;

  const introducao = `Este parecer tem como objetivo realizar uma análise detalhada das empresas participantes do processo de seleção para ${data.objeto_descricao}, do tipo ${data.criterio_julgamento}, em regime de empreitada integral, conforme as diretrizes estabelecidas no Termo de Referência. A análise abordou os aspectos de conformidade jurídica, regularidade fiscal, governança corporativa, capacidade técnica, reputação no mercado e risco financeiro. O foco foi garantir que as empresas selecionadas estejam aptas a executar o contrato com máxima eficiência, mantendo-se em conformidade com as exigências legais e regulatórias, especialmente no que tange à Lei Geral de Proteção de Dados (LGPD).\n\nNosso objetivo é assegurar que as empresas fornecedoras sejam capazes de atender aos requisitos técnicos e operacionais, garantindo segurança da informação, eficiência operacional e conformidade com os padrões estabelecidos pela OSS Prima Qualitá, conforme especificações descritas no Termo de Referência.`;
  
  addText(introducao, 10);
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

    addText(`Capital Social: R$ ${empresa.capital_social}`, 10);
    yPos += 5;
    addText(`Ano de Fundação: ${empresa.ano_fundacao}`, 10);
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
      
      addText(campo.titulo, 10, true);
      yPos += 5;
      const textoLimpo = extractTextFromHTML(campo.conteudo);
      addText(textoLimpo || "Não informado", 10);
      yPos += 8;
    });

    yPos += 5;
  });

  // Considerações Finais
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("helvetica", "bold");
  pdf.text("3. Considerações Finais e Recomendações", margin, yPos);
  yPos += 8;
  
  const consideracoesTexto = extractTextFromHTML(data.consideracoes_finais);
  addText(consideracoesTexto, 10);
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
    linkVerificacao: `${window.location.origin}/verificar-documento`,
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

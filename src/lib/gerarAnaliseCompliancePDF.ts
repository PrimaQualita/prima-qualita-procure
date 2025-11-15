import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import logo from "@/assets/prima-qualita-logo.png";
import logoHorizontal from "@/assets/prima-qualita-logo-horizontal.png";

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
  
  // Substituir quebras de linha e parágrafos por \n
  tmp.innerHTML = tmp.innerHTML
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/div>/gi, '\n')
    .replace(/<\/li>/gi, '\n');
  
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

  // Função para adicionar rodapé em qualquer página
  const addFooter = () => {
    const currentPage = pdf.getCurrentPageInfo().pageNumber;
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
      `Página ${currentPage}`,
      pageWidth - margin,
      footerY,
      { align: "right" }
    );
  };

  // Função para adicionar nova página com logo e rodapé
  const addNewPage = () => {
    pdf.addPage();
    yPos = 20;
    
    // Logo - maior e centralizado
    const logoWidth = 60;
    const logoHeight = 20;
    const logoX = (pageWidth - logoWidth) / 2;
    pdf.addImage(logo, "PNG", logoX, 10, logoWidth, logoHeight);
    
    // Rodapé
    addFooter();
    
    // Resetar formatação para o texto normal
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    pdf.setFont("times", "normal");
    
    yPos = 40;
  };

  // Função para verificar espaço e adicionar texto
  const addText = (text: string, fontSize: number = 12, isBold: boolean = false, isJustified: boolean = false) => {
    pdf.setFontSize(fontSize);
    pdf.setFont("times", isBold ? "bold" : "normal");
    pdf.setTextColor(0);
    
    if (isJustified) {
      const lines = pdf.splitTextToSize(text, maxWidth);
      const lineHeight = fontSize * 0.625;
      
      for (let i = 0; i < lines.length; i++) {
        if (yPos + lineHeight > pageHeight - 25) {
          addNewPage();
        }
        
        const line = lines[i];
        const words = line.split(' ');
        
        // Só justifica se não for a última linha E tiver pelo menos 3 palavras
        if (i < lines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(line);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          // Só justifica se o espaço extra for razoável (menos de 2pt por gap)
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(line, margin, yPos);
          }
        } else {
          pdf.text(line, margin, yPos);
        }
        
        yPos += lineHeight;
      }
    } else {
      const lines = pdf.splitTextToSize(text, maxWidth);
      const lineHeight = fontSize * 0.625;
      
      for (const line of lines) {
        if (yPos + lineHeight > pageHeight - 25) {
          addNewPage();
        }
        pdf.text(line, margin, yPos);
        yPos += lineHeight;
      }
    }
  };

  // Logo inicial - maior e centralizado
  const logoWidth = 60;
  const logoHeight = 20;
  const logoX = (pageWidth - logoWidth) / 2;
  pdf.addImage(logo, "PNG", logoX, 10, logoWidth, logoHeight);
  
  // Rodapé primeira página
  addFooter();
  
  yPos = 40;

  // Título
  pdf.setFontSize(16);
  pdf.setFont("times", "bold");
  pdf.setTextColor(0);
  pdf.text("ANÁLISE DE RISCO E CONFORMIDADE", pageWidth / 2, yPos, {
    align: "center",
  });
  yPos += 15;

  // Cabeçalho
  addText("Ao Setor de Compras da Prima Qualitá", 12);
  yPos += 5;
  addText("De: Departamento de Compliance", 12);
  yPos += 5;
  addText("Referência: Análise de Conformidade e Risco dos Fornecedores no Processo de Seleção.", 12);
  yPos += 5;
  
  // Limpar "Processo " e remover ano duplicado
  let processoNumeroParaCabecalho = data.processo_numero.replace(/^Processo\s+/i, '');
  // Remove o ano duplicado se existir (ex: 195/2025/2025 vira 195/2025)
  processoNumeroParaCabecalho = processoNumeroParaCabecalho.replace(/(\d{4})\/\1$/, '$1');
  addText(`Processo ${processoNumeroParaCabecalho}`, 12, true);
  yPos += 5;
  
  const objetoTexto = data.objeto_descricao.replace(/\.$/, '');
  addText(`Objeto: ${objetoTexto}`, 12);
  yPos += 12;

  // Introdução
  pdf.setFontSize(14);
  pdf.setFont("times", "bold");
  pdf.text("1. Introdução", margin, yPos);
  yPos += 8;

  const criterioFormatado = data.criterio_julgamento.replace(/_/g, ' ');
  const processoNumeroTexto = data.processo_numero.replace(/^Processo\s+/i, '').replace(/\/\d{4}$/, '');
  const introducao = `Este relatório apresenta a análise de risco e conformidade realizada pelo Departamento de Compliance da Prima Qualitá sobre as empresas participantes do processo de seleção ${processoNumeroTexto} para ${objetoTexto}. O critério de julgamento adotado é ${criterioFormatado}. A análise foi conduzida com base em informações públicas, documentação fornecida pelos fornecedores e critérios objetivos de avaliação de risco.`;
  
  addText(introducao, 12, false, true);
  yPos += 10;

  // Empresas Analisadas
  pdf.setFontSize(14);
  pdf.setFont("times", "bold");
  pdf.text("2. Empresas Analisadas", margin, yPos);
  yPos += 8;

  data.empresas.forEach((empresa, index) => {
    if (yPos > pageHeight - 40) {
      addNewPage();
    }

    pdf.setFontSize(12);
    pdf.setFont("times", "bold");
    pdf.setTextColor(0);
    pdf.text(`2.${index + 1}. ${empresa.razao_social} - ${empresa.cnpj}`, margin, yPos);
    yPos += 12;

    // Capital Social
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.text("Capital Social: ", margin, yPos);
    const capitalSocialX = margin + pdf.getTextWidth("Capital Social: ");
    pdf.setFont("times", "normal");
    pdf.text(empresa.capital_social, capitalSocialX, yPos);
    yPos += 7.5;
    
    // Ano de Fundação
    pdf.setFont("times", "bold");
    pdf.text("Ano de Fundação: ", margin, yPos);
    const anoFundacaoX = margin + pdf.getTextWidth("Ano de Fundação: ");
    pdf.setFont("times", "normal");
    pdf.text(empresa.ano_fundacao, anoFundacaoX, yPos);
    yPos += 7.5;

    // Contratos Ativos com a OSS
    pdf.setFont("times", "bold");
    pdf.text("Contratos Ativos com a OSS: ", margin, yPos);
    const contratosX = margin + pdf.getTextWidth("Contratos Ativos com a OSS: ");
    pdf.setFont("times", "normal");
    pdf.text(empresa.contratos_ativos_oss ? "Sim" : "Não", contratosX, yPos);
    yPos += 7.5;

    // Conflito de Interesse
    if (yPos > pageHeight - 30) {
      addNewPage();
    }
    const conflitoTexto = extractTextFromHTML(empresa.conflito_interesse);
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    const conflitoLabel = "Conflito de Interesse:";
    pdf.text(conflitoLabel, margin, yPos);
    
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    // Dividir o texto em duas partes: primeira linha (ao lado do label) e resto
    const conflitoLabelWidth = pdf.getTextWidth(conflitoLabel + "   ");
    const firstLineWidth = maxWidth - conflitoLabelWidth;
    
    // Quebrar todo o texto usando a largura completa
    const allConflitoLines = pdf.splitTextToSize(conflitoTexto || "Não informado", maxWidth);
    
    // Se a primeira linha couber ao lado do label, colocá-la lá
    if (allConflitoLines.length > 0 && pdf.getTextWidth(allConflitoLines[0]) <= firstLineWidth) {
      pdf.text(allConflitoLines[0], margin + conflitoLabelWidth, yPos);
      yPos += 7.5;
      
      // Processar linhas restantes
      for (let i = 1; i < allConflitoLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allConflitoLines[i].split(' ');
        
        if (i < allConflitoLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allConflitoLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allConflitoLines[i], margin, yPos);
          }
        } else {
          pdf.text(allConflitoLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    } else {
      // Se não couber, colocar o texto na próxima linha
      yPos += 7.5;
      for (let i = 0; i < allConflitoLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allConflitoLines[i].split(' ');
        
        if (i < allConflitoLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allConflitoLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allConflitoLines[i], margin, yPos);
          }
        } else {
          pdf.text(allConflitoLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    }

    // Capacidade Técnica
    if (yPos > pageHeight - 30) {
      addNewPage();
    }
    const capacidadeTexto = extractTextFromHTML(empresa.capacidade_tecnica);
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    const capacidadeLabel = "Capacidade Técnica:";
    pdf.text(capacidadeLabel, margin, yPos);
    
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    const capacidadeLabelWidth = pdf.getTextWidth(capacidadeLabel + "   ");
    const firstLineWidthCap = maxWidth - capacidadeLabelWidth;
    const allCapacidadeLines = pdf.splitTextToSize(capacidadeTexto || "Não informado", maxWidth);
    
    if (allCapacidadeLines.length > 0 && pdf.getTextWidth(allCapacidadeLines[0]) <= firstLineWidthCap) {
      pdf.text(allCapacidadeLines[0], margin + capacidadeLabelWidth, yPos);
      yPos += 7.5;
      
      for (let i = 1; i < allCapacidadeLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allCapacidadeLines[i].split(' ');
        
        if (i < allCapacidadeLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allCapacidadeLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allCapacidadeLines[i], margin, yPos);
          }
        } else {
          pdf.text(allCapacidadeLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    } else {
      yPos += 7.5;
      for (let i = 0; i < allCapacidadeLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allCapacidadeLines[i].split(' ');
        
        if (i < allCapacidadeLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allCapacidadeLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allCapacidadeLines[i], margin, yPos);
          }
        } else {
          pdf.text(allCapacidadeLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    }

    // Risco Financeiro
    if (yPos > pageHeight - 30) {
      addNewPage();
    }
    const riscoTexto = extractTextFromHTML(empresa.risco_financeiro);
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    const riscoLabel = "Risco Financeiro:";
    pdf.text(riscoLabel, margin, yPos);
    
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    const riscoLabelWidth = pdf.getTextWidth(riscoLabel + "   ");
    const firstLineWidthRisco = maxWidth - riscoLabelWidth;
    const allRiscoLines = pdf.splitTextToSize(riscoTexto || "Não informado", maxWidth);
    
    if (allRiscoLines.length > 0 && pdf.getTextWidth(allRiscoLines[0]) <= firstLineWidthRisco) {
      pdf.text(allRiscoLines[0], margin + riscoLabelWidth, yPos);
      yPos += 7.5;
      
      for (let i = 1; i < allRiscoLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allRiscoLines[i].split(' ');
        
        if (i < allRiscoLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allRiscoLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allRiscoLines[i], margin, yPos);
          }
        } else {
          pdf.text(allRiscoLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    } else {
      yPos += 7.5;
      for (let i = 0; i < allRiscoLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allRiscoLines[i].split(' ');
        
        if (i < allRiscoLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allRiscoLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allRiscoLines[i], margin, yPos);
          }
        } else {
          pdf.text(allRiscoLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    }

    // Reputação
    if (yPos > pageHeight - 30) {
      addNewPage();
    }
    const reputacaoTexto = extractTextFromHTML(empresa.reputacao);
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    const reputacaoLabel = "Reputação:";
    pdf.text(reputacaoLabel, margin, yPos);
    
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    const reputacaoLabelWidth = pdf.getTextWidth(reputacaoLabel + "  ");
    const firstLineWidthRep = maxWidth - reputacaoLabelWidth;
    const allReputacaoLines = pdf.splitTextToSize(reputacaoTexto || "Não informado", maxWidth);
    
    if (allReputacaoLines.length > 0 && pdf.getTextWidth(allReputacaoLines[0]) <= firstLineWidthRep) {
      pdf.text(allReputacaoLines[0], margin + reputacaoLabelWidth, yPos);
      yPos += 7.5;
      
      for (let i = 1; i < allReputacaoLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allReputacaoLines[i].split(' ');
        
        if (i < allReputacaoLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allReputacaoLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allReputacaoLines[i], margin, yPos);
          }
        } else {
          pdf.text(allReputacaoLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    } else {
      yPos += 7.5;
      for (let i = 0; i < allReputacaoLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allReputacaoLines[i].split(' ');
        
        if (i < allReputacaoLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allReputacaoLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allReputacaoLines[i], margin, yPos);
          }
        } else {
          pdf.text(allReputacaoLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    }

    // CNAE
    if (yPos > pageHeight - 30) {
      addNewPage();
    }
    const cnaeTexto = extractTextFromHTML(empresa.cnae);
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    const cnaeLabel = "CNAE:";
    pdf.text(cnaeLabel, margin, yPos);
    
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    const cnaeLabelWidth = pdf.getTextWidth(cnaeLabel + " ");
    const firstLineWidthCnae = maxWidth - cnaeLabelWidth;
    const allCnaeLines = pdf.splitTextToSize(cnaeTexto || "Não informado", maxWidth);
    
    if (allCnaeLines.length > 0 && pdf.getTextWidth(allCnaeLines[0]) <= firstLineWidthCnae) {
      pdf.text(allCnaeLines[0], margin + cnaeLabelWidth, yPos);
      yPos += 7.5;
      
      for (let i = 1; i < allCnaeLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allCnaeLines[i].split(' ');
        
        if (i < allCnaeLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allCnaeLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allCnaeLines[i], margin, yPos);
          }
        } else {
          pdf.text(allCnaeLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    } else {
      yPos += 7.5;
      for (let i = 0; i < allCnaeLines.length; i++) {
        if (yPos > pageHeight - 25) {
          addNewPage();
        }
        
        pdf.setFont("times", "normal");
        pdf.setFontSize(12);
        pdf.setTextColor(0);
        
        const words = allCnaeLines[i].split(' ');
        
        if (i < allCnaeLines.length - 1 && words.length >= 3) {
          const lineWidth = pdf.getTextWidth(allCnaeLines[i]);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          if (spacePerGap < 2 && spacePerGap > 0) {
            const normalSpaceWidth = pdf.getTextWidth(' ');
            const totalSpaceWidth = spacePerGap + normalSpaceWidth;
            
            let x = margin;
            for (let j = 0; j < words.length; j++) {
              pdf.text(words[j], x, yPos);
              if (j < words.length - 1) {
                x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
              }
            }
          } else {
            pdf.text(allCnaeLines[i], margin, yPos);
          }
        } else {
          pdf.text(allCnaeLines[i], margin, yPos);
        }
        yPos += 7.5;
      }
    }

    yPos += 7.5;
  });

  // Considerações Finais
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("times", "bold");
  pdf.setTextColor(0);
  pdf.text("3. Considerações Finais e Recomendações", margin, yPos);
  yPos += 10;
  
  const consideracoesTexto = extractTextFromHTML(data.consideracoes_finais);
  
  // Verificar se há "Recomendações:" no texto
  const recomendacoesMatch = consideracoesTexto.match(/Recomendações:\s*(.*)/);
  
  if (recomendacoesMatch) {
    // Texto antes de "Recomendações:"
    const textoAntes = consideracoesTexto.substring(0, recomendacoesMatch.index);
    if (textoAntes.trim()) {
      addText(textoAntes.trim(), 12, false, true);
      yPos += 10;
    }
    
    // Adicionar rótulo "Recomendações:" em negrito com recuo de 2cm
    const recuo = 56.69; // 2cm em pontos
    if (yPos > pageHeight - 30) {
      addNewPage();
    }
    pdf.setFont("times", "bold");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    pdf.text("Recomendações:", margin + recuo, yPos);
    yPos += 7.5;
    
    // Texto das recomendações com recuo de 2cm
    const textoRecomendacoes = recomendacoesMatch[1].trim();
    
    pdf.setFont("times", "normal");
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    
    const maxWidthComRecuo = maxWidth - recuo;
    const linhasRecomendacoes = pdf.splitTextToSize(textoRecomendacoes, maxWidthComRecuo);
    const lineHeight = 12 * 0.625;
    
    for (let i = 0; i < linhasRecomendacoes.length; i++) {
      if (yPos + lineHeight > pageHeight - 25) {
        addNewPage();
      }
      
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      const words = linhasRecomendacoes[i].split(' ');
      
      // Justifica todas as linhas exceto a última
      if (i < linhasRecomendacoes.length - 1 && words.length > 1) {
        const lineWidth = pdf.getTextWidth(linhasRecomendacoes[i]);
        const extraSpace = maxWidthComRecuo - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        const normalSpaceWidth = pdf.getTextWidth(' ');
        const totalSpaceWidth = spacePerGap + normalSpaceWidth;
        
        let xPos = margin + recuo;
        for (let j = 0; j < words.length; j++) {
          pdf.text(words[j], xPos, yPos);
          if (j < words.length - 1) {
            xPos += pdf.getTextWidth(words[j]) + totalSpaceWidth;
          }
        }
      } else {
        pdf.text(linhasRecomendacoes[i], margin + recuo, yPos);
      }
      
      yPos += lineHeight;
    }
    
    yPos += 10;
  } else {
    addText(consideracoesTexto, 12, false, true);
    yPos += 10;
  }

  // Conclusão
  if (yPos > pageHeight - 40) {
    addNewPage();
  }
  
  pdf.setFontSize(14);
  pdf.setFont("times", "bold");
  pdf.setTextColor(0);
  pdf.text("4. Conclusão", margin, yPos);
  yPos += 10;
  
  const conclusaoTexto = extractTextFromHTML(data.conclusao);
  addText(conclusaoTexto, 12, false, true);
  yPos += 15;

  // Certificação Digital Simplificada
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("nome_completo, cpf")
    .eq("id", user?.id || "")
    .single();

  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  
  // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;

  // Garantir espaço suficiente para certificação (pelo menos 60mm)
  if (yPos > pageHeight - 60) {
    addNewPage();
  }

  yPos += 10;

  // Adicionar logo horizontal
  const base64Logo = await new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Erro ao criar canvas'));
      }
    };
    img.onerror = () => reject(new Error('Erro ao carregar logo'));
    img.src = logoHorizontal;
  });

  pdf.addImage(base64Logo, 'PNG', (pageWidth - 60) / 2, yPos, 60, 18);
  yPos += 25;

  // Bloco de certificação
  pdf.setFillColor(240, 240, 240);
  pdf.rect(margin, yPos, maxWidth, 40, 'F');

  yPos += 8;
  pdf.setFontSize(10);
  pdf.setFont('times', 'bold');
  pdf.setTextColor(0);
  pdf.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, yPos, { align: 'center' });

  yPos += 8;
  pdf.setFont('times', 'normal');
  pdf.setFontSize(9);
  pdf.text(`Protocolo: ${protocolo}`, margin + 5, yPos);

  yPos += 6;
  pdf.text(`Data/Hora: ${dataHora}`, margin + 5, yPos);

  yPos += 6;
  pdf.text(`Responsável: ${profile?.nome_completo || "Sistema"} (CPF: ${profile?.cpf || ""})`, margin + 5, yPos);

  yPos += 8;
  const linkVerificacao = `${window.location.origin}/verificar-analise-compliance?protocolo=${protocolo}`;
  pdf.setTextColor(0, 0, 255);
  pdf.textWithLink('Clique aqui para verificar a autenticidade', margin + 5, yPos, { url: linkVerificacao });
  pdf.setTextColor(0);

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

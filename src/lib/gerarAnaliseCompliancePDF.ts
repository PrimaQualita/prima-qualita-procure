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
    
    // Logo - maior e centralizado
    const logoWidth = 60;
    const logoHeight = 15;
    const logoX = (pageWidth - logoWidth) / 2;
    pdf.addImage(logo, "PNG", logoX, 10, logoWidth, logoHeight);
    
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
    
    // Resetar formatação para o texto normal
    pdf.setFontSize(12);
    pdf.setTextColor(0);
    pdf.setFont("times", "normal");
    
    yPos = 35;
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
        
        // Só justifica se não for a última linha E tiver pelo menos 4 palavras E o espaço extra não for excessivo
        if (i < lines.length - 1 && words.length >= 4) {
          const lineWidth = pdf.getTextWidth(line);
          const extraSpace = maxWidth - lineWidth;
          const spacePerGap = extraSpace / (words.length - 1);
          
          // Só justifica se o espaço extra por gap for razoável (menos de 3pt)
          if (spacePerGap < 3) {
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
  const logoHeight = 15;
  const logoX = (pageWidth - logoWidth) / 2;
  pdf.addImage(logo, "PNG", logoX, 10, logoWidth, logoHeight);
  yPos = 35;

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
  yPos += 7.5;
  addText("De: Departamento de Compliance", 12);
  yPos += 7.5;
  addText("Referência: Análise de Conformidade e Risco dos Fornecedores no Processo de Seleção.", 12);
  yPos += 7.5;
  
  // Limpar "Processo " do número do processo
  const processoNumeroParaCabecalho = data.processo_numero.replace(/^Processo\s+/i, '');
  addText(`Processo ${processoNumeroParaCabecalho}`, 12, true);
  yPos += 7.5;
  
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
    const conflitoLabelWidth = pdf.getTextWidth(conflitoLabel + "   ");
    const conflitoWidth = maxWidth - conflitoLabelWidth;
    const conflitoLines = pdf.splitTextToSize(conflitoTexto || "Não informado", conflitoWidth);
    
    // Primeira linha na mesma linha do rótulo - justificar se apropriado
    if (conflitoLines.length > 1 && conflitoLines[0]) {
      const words = conflitoLines[0].split(' ');
      if (words.length >= 4) {
        const lineWidth = pdf.getTextWidth(conflitoLines[0]);
        const extraSpace = conflitoWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        // Só justifica se o espaço extra não for excessivo
        if (spacePerGap < 3) {
          const normalSpaceWidth = pdf.getTextWidth(' ');
          const totalSpaceWidth = spacePerGap + normalSpaceWidth;
          
          let x = margin + conflitoLabelWidth;
          for (let j = 0; j < words.length; j++) {
            pdf.text(words[j], x, yPos);
            if (j < words.length - 1) {
              x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
            }
          }
        } else {
          pdf.text(conflitoLines[0], margin + conflitoLabelWidth, yPos);
        }
      } else {
        pdf.text(conflitoLines[0], margin + conflitoLabelWidth, yPos);
      }
    } else {
      pdf.text(conflitoLines[0] || "", margin + conflitoLabelWidth, yPos);
    }
    yPos += 7.5;
    
    // Linhas seguintes
    for (let i = 1; i < conflitoLines.length; i++) {
      if (yPos > pageHeight - 25) {
        addNewPage();
      }
      
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      const words = conflitoLines[i].split(' ');
      
      // Só justifica se não for a última linha E tiver palavras suficientes E espaço razoável
      if (i < conflitoLines.length - 1 && words.length >= 4) {
        const lineWidth = pdf.getTextWidth(conflitoLines[i]);
        const extraSpace = maxWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
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
          pdf.text(conflitoLines[i], margin, yPos);
        }
      } else {
        pdf.text(conflitoLines[i], margin, yPos);
      }
      yPos += 7.5;
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
    const capacidadeWidth = maxWidth - capacidadeLabelWidth;
    const capacidadeLines = pdf.splitTextToSize(capacidadeTexto || "Não informado", capacidadeWidth);
    
    // Primeira linha na mesma linha do rótulo
    if (capacidadeLines.length > 1 && capacidadeLines[0]) {
      const words = capacidadeLines[0].split(' ');
      if (words.length >= 4) {
        const lineWidth = pdf.getTextWidth(capacidadeLines[0]);
        const extraSpace = capacidadeWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
          const normalSpaceWidth = pdf.getTextWidth(' ');
          const totalSpaceWidth = spacePerGap + normalSpaceWidth;
          
          let x = margin + capacidadeLabelWidth;
          for (let j = 0; j < words.length; j++) {
            pdf.text(words[j], x, yPos);
            if (j < words.length - 1) {
              x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
            }
          }
        } else {
          pdf.text(capacidadeLines[0], margin + capacidadeLabelWidth, yPos);
        }
      } else {
        pdf.text(capacidadeLines[0], margin + capacidadeLabelWidth, yPos);
      }
    } else {
      pdf.text(capacidadeLines[0] || "", margin + capacidadeLabelWidth, yPos);
    }
    yPos += 7.5;
    
    for (let i = 1; i < capacidadeLines.length; i++) {
      if (yPos > pageHeight - 25) {
        addNewPage();
      }
      
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      const words = capacidadeLines[i].split(' ');
      
      if (i < capacidadeLines.length - 1 && words.length >= 4) {
        const lineWidth = pdf.getTextWidth(capacidadeLines[i]);
        const extraSpace = maxWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
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
          pdf.text(capacidadeLines[i], margin, yPos);
        }
      } else {
        pdf.text(capacidadeLines[i], margin, yPos);
      }
      yPos += 7.5;
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
    const riscoLabelWidth = pdf.getTextWidth(riscoLabel + "  ");
    const riscoWidth = maxWidth - riscoLabelWidth;
    const riscoLines = pdf.splitTextToSize(riscoTexto || "Não informado", riscoWidth);
    
    // Primeira linha na mesma linha do rótulo
    if (riscoLines.length > 1 && riscoLines[0]) {
      const words = riscoLines[0].split(' ');
      if (words.length >= 4) {
        const lineWidth = pdf.getTextWidth(riscoLines[0]);
        const extraSpace = riscoWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
          const normalSpaceWidth = pdf.getTextWidth(' ');
          const totalSpaceWidth = spacePerGap + normalSpaceWidth;
          
          let x = margin + riscoLabelWidth;
          for (let j = 0; j < words.length; j++) {
            pdf.text(words[j], x, yPos);
            if (j < words.length - 1) {
              x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
            }
          }
        } else {
          pdf.text(riscoLines[0], margin + riscoLabelWidth, yPos);
        }
      } else {
        pdf.text(riscoLines[0], margin + riscoLabelWidth, yPos);
      }
    } else {
      pdf.text(riscoLines[0] || "", margin + riscoLabelWidth, yPos);
    }
    yPos += 7.5;
    
    for (let i = 1; i < riscoLines.length; i++) {
      if (yPos > pageHeight - 25) {
        addNewPage();
      }
      
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      const words = riscoLines[i].split(' ');
      
      if (i < riscoLines.length - 1 && words.length >= 4) {
        const lineWidth = pdf.getTextWidth(riscoLines[i]);
        const extraSpace = maxWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
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
          pdf.text(riscoLines[i], margin, yPos);
        }
      } else {
        pdf.text(riscoLines[i], margin, yPos);
      }
      yPos += 7.5;
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
    const reputacaoWidth = maxWidth - reputacaoLabelWidth;
    const reputacaoLines = pdf.splitTextToSize(reputacaoTexto || "Não informado", reputacaoWidth);
    
    // Primeira linha na mesma linha do rótulo
    if (reputacaoLines.length > 1 && reputacaoLines[0]) {
      const words = reputacaoLines[0].split(' ');
      if (words.length >= 4) {
        const lineWidth = pdf.getTextWidth(reputacaoLines[0]);
        const extraSpace = reputacaoWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
          const normalSpaceWidth = pdf.getTextWidth(' ');
          const totalSpaceWidth = spacePerGap + normalSpaceWidth;
          
          let x = margin + reputacaoLabelWidth;
          for (let j = 0; j < words.length; j++) {
            pdf.text(words[j], x, yPos);
            if (j < words.length - 1) {
              x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
            }
          }
        } else {
          pdf.text(reputacaoLines[0], margin + reputacaoLabelWidth, yPos);
        }
      } else {
        pdf.text(reputacaoLines[0], margin + reputacaoLabelWidth, yPos);
      }
    } else {
      pdf.text(reputacaoLines[0] || "", margin + reputacaoLabelWidth, yPos);
    }
    yPos += 7.5;
    
    for (let i = 1; i < reputacaoLines.length; i++) {
      if (yPos > pageHeight - 25) {
        addNewPage();
      }
      
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      const words = reputacaoLines[i].split(' ');
      
      if (i < reputacaoLines.length - 1 && words.length >= 4) {
        const lineWidth = pdf.getTextWidth(reputacaoLines[i]);
        const extraSpace = maxWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
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
          pdf.text(reputacaoLines[i], margin, yPos);
        }
      } else {
        pdf.text(reputacaoLines[i], margin, yPos);
      }
      yPos += 7.5;
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
    const cnaeWidth = maxWidth - cnaeLabelWidth;
    const cnaeLines = pdf.splitTextToSize(cnaeTexto || "Não informado", cnaeWidth);
    
    // Primeira linha na mesma linha do rótulo
    if (cnaeLines.length > 1 && cnaeLines[0]) {
      const words = cnaeLines[0].split(' ');
      if (words.length >= 4) {
        const lineWidth = pdf.getTextWidth(cnaeLines[0]);
        const extraSpace = cnaeWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
          const normalSpaceWidth = pdf.getTextWidth(' ');
          const totalSpaceWidth = spacePerGap + normalSpaceWidth;
          
          let x = margin + cnaeLabelWidth;
          for (let j = 0; j < words.length; j++) {
            pdf.text(words[j], x, yPos);
            if (j < words.length - 1) {
              x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
            }
          }
        } else {
          pdf.text(cnaeLines[0], margin + cnaeLabelWidth, yPos);
        }
      } else {
        pdf.text(cnaeLines[0], margin + cnaeLabelWidth, yPos);
      }
    } else {
      pdf.text(cnaeLines[0] || "", margin + cnaeLabelWidth, yPos);
    }
    yPos += 7.5;
    
    for (let i = 1; i < cnaeLines.length; i++) {
      if (yPos > pageHeight - 25) {
        addNewPage();
      }
      
      pdf.setFont("times", "normal");
      pdf.setFontSize(12);
      pdf.setTextColor(0);
      
      const words = cnaeLines[i].split(' ');
      
      if (i < cnaeLines.length - 1 && words.length >= 4) {
        const lineWidth = pdf.getTextWidth(cnaeLines[i]);
        const extraSpace = maxWidth - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
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
          pdf.text(cnaeLines[i], margin, yPos);
        }
      } else {
        pdf.text(cnaeLines[i], margin, yPos);
      }
      yPos += 7.5;
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
      
      // Justificar se não for a última linha E tiver palavras suficientes E espaço razoável
      if (i < linhasRecomendacoes.length - 1 && words.length >= 4) {
        const lineWidth = pdf.getTextWidth(linhasRecomendacoes[i]);
        const extraSpace = maxWidthComRecuo - lineWidth;
        const spacePerGap = extraSpace / (words.length - 1);
        
        if (spacePerGap < 3) {
          const normalSpaceWidth = pdf.getTextWidth(' ');
          const totalSpaceWidth = spacePerGap + normalSpaceWidth;
          
          let x = margin + recuo;
          for (let j = 0; j < words.length; j++) {
            pdf.text(words[j], x, yPos);
            if (j < words.length - 1) {
              x += pdf.getTextWidth(words[j]) + totalSpaceWidth;
            }
          }
        } else {
          pdf.text(linhasRecomendacoes[i], margin + recuo, yPos);
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

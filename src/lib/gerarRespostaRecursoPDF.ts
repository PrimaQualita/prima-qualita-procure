import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoRecurso from '@/assets/logo-recurso.png';
import rodapeRecurso from '@/assets/rodape-recurso.png';

interface RespostaRecursoResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

// Função auxiliar para converter imagem em base64 usando fetch (mais robusto)
const loadImageAsBase64 = async (src: string): Promise<string> => {
  try {
    const response = await fetch(src);
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}`);
    }
    const blob = await response.blob();
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error('Erro ao ler blob'));
      reader.readAsDataURL(blob);
    });
  } catch (error) {
    console.error('[PDF] Erro ao carregar imagem:', src, error);
    throw new Error(`Erro ao carregar imagem: ${src}`);
  }
};

// Função para justificar texto de forma mais natural
const justifyText = (doc: jsPDF, text: string, x: number, y: number, width: number, lineHeight: number): number => {
  const paragraphs = text.split('\n\n');
  let currentY = y;
  
  paragraphs.forEach((paragraph, pIndex) => {
    if (pIndex > 0) {
      currentY += lineHeight * 0.5; // Espaço entre parágrafos
    }
    
    const lines = doc.splitTextToSize(paragraph.trim(), width);
    
    lines.forEach((line: string, lineIndex: number) => {
      const isLastLine = lineIndex === lines.length - 1;
      const words = line.trim().split(/\s+/);
      
      if (isLastLine || words.length <= 1) {
        // Última linha do parágrafo ou linha com apenas uma palavra - alinhamento à esquerda
        doc.text(line, x, currentY);
      } else {
        // Justificar a linha
        const textWidth = doc.getTextWidth(words.join(''));
        const totalSpaceNeeded = width - textWidth;
        const spaceCount = words.length - 1;
        const spaceWidth = totalSpaceNeeded / spaceCount;
        
        let currentX = x;
        words.forEach((word, wordIndex) => {
          doc.text(word, currentX, currentY);
          if (wordIndex < words.length - 1) {
            currentX += doc.getTextWidth(word) + spaceWidth;
          }
        });
      }
      currentY += lineHeight;
    });
  });
  
  return currentY;
};

export const gerarRespostaRecursoPDF = async (
  decisao: 'provimento' | 'negado' | 'provimento_parcial',
  textoResposta: string,
  usuarioNome: string,
  usuarioCpf: string,
  fornecedorNome: string,
  numeroProcesso: string,
  numeroSelecao?: string
): Promise<RespostaRecursoResult> => {
  console.log('[PDF] Iniciando geração - Resposta de Recurso');
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  
  // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemLateral = 1.5; // 1.5mm das bordas para logo e rodapé
  const margemTexto = 20; // margem para o texto
  const larguraUtil = pageWidth - (margemTexto * 2);
  
  // Carregar imagens
  const [base64Logo, base64Rodape] = await Promise.all([
    loadImageAsBase64(logoRecurso),
    loadImageAsBase64(rodapeRecurso)
  ]);
  
  // Função para adicionar logo e rodapé em todas as páginas
  const adicionarLogoERodape = () => {
    // Logo no topo - expandido nas margens laterais de 1.5mm
    const logoWidth = pageWidth - (margemLateral * 2);
    const logoHeight = 30; // Altura aumentada para manter proporção correta
    doc.addImage(base64Logo, 'PNG', margemLateral, margemLateral, logoWidth, logoHeight);
    
    // Rodapé no final - expandido nas margens laterais de 1.5mm
    const rodapeWidth = pageWidth - (margemLateral * 2);
    const rodapeHeight = 25; // Altura proporcional
    doc.addImage(base64Rodape, 'PNG', margemLateral, pageHeight - rodapeHeight - margemLateral, rodapeWidth, rodapeHeight);
  };
  
  adicionarLogoERodape();
  
  // Título - posição ajustada para acomodar logo maior
  let y = 45;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128); // Cor verde/teal
  doc.text('RESPOSTA DE RECURSO', pageWidth / 2, y, { align: 'center' });
  
  y += 12;
  
  // Informações do processo
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Processo:  ', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(numeroProcesso, margemTexto + doc.getTextWidth('Processo:  '), y);
  
  if (numeroSelecao) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    const labelSelecao = 'Seleção de Fornecedores:';
    doc.text(labelSelecao, margemTexto, y);
    doc.setFont('helvetica', 'normal');
    doc.text('   ' + numeroSelecao, margemTexto + doc.getTextWidth(labelSelecao), y);
  }
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Recorrente:  ', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fornecedorNome, margemTexto + doc.getTextWidth('Recorrente:  '), y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Decisão:  ', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  const decisaoTexto = decisao === 'provimento' ? 'DAR PROVIMENTO AO RECURSO' : 
                       decisao === 'provimento_parcial' ? 'DAR PROVIMENTO PARCIAL AO RECURSO' : 
                       'NEGAR PROVIMENTO AO RECURSO';
  doc.text(decisaoTexto, margemTexto + doc.getTextWidth('Decisão:  '), y);
  
  y += 12;
  
  // Fundamentação - título em negrito
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128); // Cor verde/teal
  doc.text('FUNDAMENTAÇÃO:', margemTexto, y);
  
  y += 8;
  
  // Texto da fundamentação - justificado
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  
  // Função para verificar quebra de página durante o texto
  const maxY = pageHeight - 40; // Espaço para rodapé
  const lineHeight = 5;
  
  const paragraphs = textoResposta.split('\n\n');
  const espacoNormal = doc.getTextWidth(' ');
  const espacoMaximo = espacoNormal * 3; // Máximo 3x o espaço normal
  
  paragraphs.forEach((paragraph, pIndex) => {
    if (pIndex > 0) {
      y += lineHeight * 0.5;
    }
    
    const lines = doc.splitTextToSize(paragraph.trim(), larguraUtil);
    
    lines.forEach((line: string, lineIndex: number) => {
      // Verificar se precisa de nova página
      if (y > maxY) {
        doc.addPage();
        adicionarLogoERodape();
        y = 45; // Posição ajustada para logo maior
      }
      
      const isLastLine = lineIndex === lines.length - 1;
      const words = line.trim().split(/\s+/);
      
      // Justificar apenas se não for última linha, tiver mais de 3 palavras,
      // e o espaço calculado não for exagerado
      if (!isLastLine && words.length > 3) {
        const textWidth = doc.getTextWidth(words.join(''));
        const totalSpaceNeeded = larguraUtil - textWidth;
        const spaceCount = words.length - 1;
        const spaceWidth = totalSpaceNeeded / spaceCount;
        
        // Se o espaço ficar muito grande, usar alinhamento normal
        if (spaceWidth <= espacoMaximo) {
          let currentX = margemTexto;
          words.forEach((word, wordIndex) => {
            doc.text(word, currentX, y);
            if (wordIndex < words.length - 1) {
              currentX += doc.getTextWidth(word) + spaceWidth;
            }
          });
        } else {
          doc.text(line, margemTexto, y);
        }
      } else {
        doc.text(line, margemTexto, y);
      }
      y += lineHeight;
    });
  });
  
  y += 4;
  
  // Verificar espaço para certificação (certificação logo após o texto)
  if (y > pageHeight - 50) {
    doc.addPage();
    adicionarLogoERodape();
    y = 45; // Posição ajustada para logo maior
  }
  
  // Certificação Digital Simplificada
  const { adicionarCertificacaoSimplificada } = await import('./certificacaoSimplificada');
  
  adicionarCertificacaoSimplificada(doc, {
    protocolo,
    responsavel: usuarioNome,
    linkVerificacao: `${window.location.origin}/verificar-documento?protocolo=${protocolo}`
  }, y);
  
  // Gerar PDF como blob
  const pdfBlob = doc.output('blob');
  const fileName = `resposta_recurso_${numeroProcesso.replace(/\//g, '-')}_${Date.now()}.pdf`;
  const storagePath = `recursos/respostas/${fileName}`;
  
  console.log('[PDF] Fazendo upload para storage:', storagePath);
  
  // Upload para Supabase Storage
  const { data: uploadData, error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false
    });
  
  if (uploadError) {
    console.error('[PDF] Erro no upload:', uploadError);
    throw new Error('Erro ao fazer upload da resposta de recurso');
  }
  
  console.log('[PDF] Upload concluído:', uploadData);
  
  // Gerar URL pública
  const { data: urlData } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);
  
  console.log('[PDF] Resposta de recurso gerada com sucesso');
  
  return {
    url: urlData.publicUrl,
    fileName,
    protocolo,
    storagePath
  };
};

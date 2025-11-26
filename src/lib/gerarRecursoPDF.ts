import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoPrimaQualita from '@/assets/prima-qualita-logo-horizontal.png';

interface RecursoResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

// Função auxiliar para converter imagem em base64
const loadImageAsBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
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
    img.onerror = () => reject(new Error('Erro ao carregar imagem'));
    img.src = src;
  });
};

export const gerarRecursoPDF = async (
  motivoRecurso: string,
  fornecedorNome: string,
  fornecedorCnpj: string,
  numeroProcesso: string,
  motivoInabilitacao: string
): Promise<RecursoResult> => {
  console.log('[PDF] Iniciando geração - Recurso de Inabilitação');
  
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
  const margemLateral = 1.5;
  const margemTexto = 20;
  const larguraUtil = pageWidth - (margemTexto * 2);
  
  // Carregar logo verde
  const base64Logo = await loadImageAsBase64(logoPrimaQualita);
  
  // Função para adicionar logo centralizado no topo
  const adicionarLogo = () => {
    const logoWidth = 60;
    const logoHeight = 15;
    doc.addImage(base64Logo, 'PNG', (pageWidth - logoWidth) / 2, 10, logoWidth, logoHeight);
  };
  
  adicionarLogo();
  
  // Título
  let y = 35;
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128);
  doc.text('RECURSO DE INABILITAÇÃO', pageWidth / 2, y, { align: 'center' });
  
  y += 12;
  
  // Informações do processo
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Processo:', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(' ' + numeroProcesso, margemTexto + doc.getTextWidth('Processo:'), y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Recorrente:', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(' ' + fornecedorNome, margemTexto + doc.getTextWidth('Recorrente:'), y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('CNPJ:', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(' ' + fornecedorCnpj, margemTexto + doc.getTextWidth('CNPJ:'), y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Data:', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(' ' + dataHora, margemTexto + doc.getTextWidth('Data:'), y);
  
  y += 12;
  
  // Motivo da Inabilitação
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128);
  doc.text('MOTIVO DA INABILITAÇÃO:', margemTexto, y);
  
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const linhasMotivo = doc.splitTextToSize(motivoInabilitacao, larguraUtil);
  const maxY = pageHeight - 30;
  const lineHeight = 5;
  
  linhasMotivo.forEach((linha: string) => {
    if (y > maxY) {
      doc.addPage();
      adicionarLogo();
      y = 35;
    }
    doc.text(linha, margemTexto, y);
    y += lineHeight;
  });
  
  y += 10;
  
  // Razões do Recurso
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 128, 128);
  doc.text('RAZÕES DO RECURSO:', margemTexto, y);
  
  y += 8;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  const paragraphs = motivoRecurso.split('\n\n');
  const espacoNormal = doc.getTextWidth(' ');
  const espacoMaximo = espacoNormal * 3; // Máximo 3x o espaço normal
  
  paragraphs.forEach((paragraph, pIndex) => {
    if (pIndex > 0) {
      y += lineHeight * 0.5;
    }
    
    const lines = doc.splitTextToSize(paragraph.trim(), larguraUtil);
    
    lines.forEach((line: string, lineIndex: number) => {
      if (y > maxY) {
        doc.addPage();
        adicionarLogo();
        y = 35;
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
  
  y += 8;
  
  // Verificar espaço para certificação (logo após o texto)
  if (y > pageHeight - 60) {
    doc.addPage();
    adicionarLogo();
    y = 35;
  }
  
  // Certificação Digital
  const { adicionarCertificacaoDigital } = await import('./certificacaoDigital');
  const hash = btoa(protocolo + dataHora).substring(0, 32).toUpperCase();
  
  adicionarCertificacaoDigital(doc, {
    protocolo,
    dataHora,
    responsavel: fornecedorNome,
    cpf: fornecedorCnpj,
    hash,
    linkVerificacao: `${window.location.origin}/verificar-autorizacao?protocolo=${protocolo}`
  }, y);
  
  // Gerar PDF como blob
  const pdfBlob = doc.output('blob');
  const fileName = `recurso_${numeroProcesso.replace(/\//g, '-')}_${Date.now()}.pdf`;
  const storagePath = `recursos/enviados/${fileName}`;
  
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
    throw new Error('Erro ao fazer upload do recurso');
  }
  
  console.log('[PDF] Upload concluído:', uploadData);
  
  // Gerar URL pública
  const { data: urlData } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);
  
  console.log('[PDF] Recurso gerado com sucesso');
  
  return {
    url: urlData.publicUrl,
    fileName,
    protocolo,
    storagePath
  };
};

import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface RecursoResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

export const gerarRecursoPDF = async (
  motivoRecurso: string,
  fornecedorNome: string,
  fornecedorCnpj: string,
  numeroProcesso: string,
  motivoInabilitacao: string,
  numeroSelecao?: string,
  tituloCotacao?: string, protocoloOverride?: string, dataHoraOverride?: string, fileNamePrefix?: string
): Promise<RecursoResult> => {
  console.log('[PDF] Iniciando geração - Recurso de Inabilitação');
  
  const agora = new Date();
  const dataHora = dataHoraOverride ?? agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  
  // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloOverride ?? (protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico);
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemTexto = 20;
  const larguraUtil = pageWidth - (margemTexto * 2);
  
  // Função para adicionar faixa verde no topo com título
  const adicionarFaixaVerde = () => {
    // Faixa verde (cor do logo Prima Qualitá: #008080 - teal)
    doc.setFillColor(0, 128, 128);
    doc.rect(0, 0, pageWidth, 20, 'F');
    
    // Título dentro da faixa
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('RECURSO DE INABILITAÇÃO', pageWidth / 2, 13, { align: 'center' });
  };
  
  adicionarFaixaVerde();
  
  // Informações do processo
  let y = 30;
  
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
  
  if (tituloCotacao) {
    y += 6;
    doc.setFont('helvetica', 'bold');
    const labelCotacao = 'Cotação de Preços:';
    doc.text(labelCotacao, margemTexto, y);
    doc.setFont('helvetica', 'normal');
    doc.text('   ' + tituloCotacao, margemTexto + doc.getTextWidth(labelCotacao), y);
  }
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Recorrente:  ', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fornecedorNome, margemTexto + doc.getTextWidth('Recorrente:  '), y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('CNPJ:  ', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(fornecedorCnpj, margemTexto + doc.getTextWidth('CNPJ:  '), y);
  
  y += 6;
  doc.setFont('helvetica', 'bold');
  doc.text('Data:  ', margemTexto, y);
  doc.setFont('helvetica', 'normal');
  doc.text(dataHora, margemTexto + doc.getTextWidth('Data:  '), y);
  
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
      adicionarFaixaVerde();
      y = 30;
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
  
  // Normalizar texto: converter quebras de linha simples em espaços
  // Manter apenas quebras duplas como separadores de parágrafo
  const textoNormalizado = motivoRecurso
    .replace(/\r\n/g, '\n')           // Windows line endings
    .replace(/\r/g, '\n')             // Old Mac line endings
    .replace(/\n([^\n])/g, ' $1')     // Single newline followed by non-newline = space
    .replace(/\n{2,}/g, '\n\n')       // Multiple newlines = double newline
    .replace(/ {2,}/g, ' ')           // Multiple spaces = single space
    .trim();
  
  const paragraphs = textoNormalizado.split('\n\n').filter(p => p.trim() !== '');
  
  paragraphs.forEach((paragraph, pIndex) => {
    if (pIndex > 0) {
      y += lineHeight * 1.2; // Espaço entre parágrafos
    }
    
    // Limpar parágrafo de espaços extras
    const paragrafoLimpo = paragraph.trim().replace(/ {2,}/g, ' ');
    const lines = doc.splitTextToSize(paragrafoLimpo, larguraUtil);
    
    lines.forEach((line: string, lineIndex: number) => {
      if (y > maxY) {
        doc.addPage();
        adicionarFaixaVerde();
        y = 30;
      }
      
      const isLastLineOfParagraph = lineIndex === lines.length - 1;
      const linhaLimpa = line.trim();
      const words = linhaLimpa.split(/\s+/).filter(w => w.length > 0);
      
      // Justificar TODAS as linhas exceto a última do parágrafo
      // Mínimo 2 palavras para justificar
      if (!isLastLineOfParagraph && words.length >= 2) {
        // Calcular largura total das palavras (sem espaços)
        let totalWordWidth = 0;
        words.forEach(word => {
          totalWordWidth += doc.getTextWidth(word);
        });
        
        // Calcular espaço entre palavras para preencher a largura total
        const spaceCount = words.length - 1;
        const totalSpaceNeeded = larguraUtil - totalWordWidth;
        const spaceWidth = totalSpaceNeeded / spaceCount;
        
        // Desenhar cada palavra com espaçamento calculado
        let currentX = margemTexto;
        words.forEach((word, wordIndex) => {
          doc.text(word, currentX, y);
          if (wordIndex < words.length - 1) {
            currentX += doc.getTextWidth(word) + spaceWidth;
          }
        });
      } else {
        // Última linha do parágrafo: alinhamento à esquerda
        doc.text(linhaLimpa, margemTexto, y);
      }
      y += lineHeight;
    });
  });
  
  y += 4;
  
  // Verificar espaço para certificação
  if (y > pageHeight - 50) {
    doc.addPage();
    adicionarFaixaVerde();
    y = 30;
  }
  
  // Certificação Digital Simplificada
  const { adicionarCertificacaoSimplificada } = await import('./certificacaoSimplificada');
  
  adicionarCertificacaoSimplificada(doc, {
    protocolo,
    responsavel: fornecedorNome,
    linkVerificacao: `${window.location.origin}/verificar-documento?protocolo=${protocolo}`
  }, y);
  
  // Gerar PDF como blob
  const pdfBlob = doc.output('blob');
  const safeNumeroProcesso = (numeroProcesso || 'processo').replace(/\//g, '-');
  const prefix = fileNamePrefix ?? 'recurso_';
  const fileName = `${prefix}${safeNumeroProcesso}_${Date.now()}.pdf`;
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

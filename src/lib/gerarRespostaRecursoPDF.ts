import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';

interface RespostaRecursoResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

export const gerarRespostaRecursoPDF = async (
  decisao: 'provimento' | 'negado',
  textoResposta: string,
  usuarioNome: string,
  usuarioCpf: string,
  fornecedorNome: string,
  numeroProcesso: string
): Promise<RespostaRecursoResult> => {
  console.log('[PDF] Iniciando geração - Resposta de Recurso');
  
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `RESP-REC-${numeroProcesso}-${Date.now()}`;
  
  // Criar PDF
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemEsquerda = 15;
  const margemDireita = 15;
  const larguraUtil = pageWidth - margemEsquerda - margemDireita;
  
  // Função para adicionar logo e rodapé em todas as páginas
  const adicionarLogoERodape = async () => {
    // Logo
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
    
    doc.addImage(base64Logo, 'PNG', (pageWidth - 80) / 2, 10, 80, 20);
    
    // Rodapé
    const yRodape = pageHeight - 20;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    doc.text('PRIMA QUALITA SAUDE', pageWidth / 2, yRodape, { align: 'center' });
    doc.text('www.primaqualitasaude.org', pageWidth / 2, yRodape + 5, { align: 'center' });
    doc.text('Travessa do Ouvidor, 21, Sala 503, Centro, Rio de Janeiro - RJ, CEP: 20.040-040', pageWidth / 2, yRodape + 10, { align: 'center' });
    doc.text('CNPJ: 40.289.134/0001-99', pageWidth / 2, yRodape + 15, { align: 'center' });
  };
  
  await adicionarLogoERodape();
  
  // Título
  let y = 40;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('RESPOSTA DE RECURSO', pageWidth / 2, y, { align: 'center' });
  
  y += 15;
  
  // Informações do processo
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo: ${numeroProcesso}`, margemEsquerda, y);
  y += 7;
  doc.text(`Fornecedor: ${fornecedorNome}`, margemEsquerda, y);
  y += 7;
  doc.text(`Decisão: ${decisao === 'provimento' ? 'DAR PROVIMENTO AO RECURSO' : 'NEGAR PROVIMENTO AO RECURSO'}`, margemEsquerda, y);
  y += 10;
  
  // Texto da resposta
  doc.setFont('helvetica', 'bold');
  doc.text('FUNDAMENTAÇÃO:', margemEsquerda, y);
  y += 7;
  
  doc.setFont('helvetica', 'normal');
  const linhasResposta = doc.splitTextToSize(textoResposta, larguraUtil);
  
  linhasResposta.forEach((linha: string) => {
    if (y > pageHeight - 40) {
      doc.addPage();
      adicionarLogoERodape();
      y = 40;
    }
    doc.text(linha, margemEsquerda, y, { align: 'justify' });
    y += 6;
  });
  
  y += 10;
  
  // Certificação Digital
  if (y > pageHeight - 80) {
    doc.addPage();
    await adicionarLogoERodape();
    y = 40;
  }
  
  doc.setFillColor(240, 240, 240);
  doc.rect(margemEsquerda, y, larguraUtil, 45, 'F');
  
  y += 7;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, y, { align: 'center' });
  
  y += 6;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Protocolo: ${protocolo}`, margemEsquerda + 5, y);
  
  y += 5;
  doc.text(`Emitido em: ${dataHora}`, margemEsquerda + 5, y);
  
  y += 5;
  doc.text(`Responsável: ${usuarioNome}`, margemEsquerda + 5, y);
  
  y += 5;
  doc.text(`CPF: ${usuarioCpf}`, margemEsquerda + 5, y);
  
  y += 5;
  const hash = btoa(protocolo + dataHora).substring(0, 32);
  doc.text(`Hash de verificação: ${hash}`, margemEsquerda + 5, y);
  
  y += 5;
  const linkVerificacao = `https://prima-qualita-procure.lovable.app/verificar-autorizacao?protocolo=${protocolo}`;
  doc.setTextColor(0, 0, 255);
  doc.textWithLink('Verificar autenticidade deste documento', margemEsquerda + 5, y, { url: linkVerificacao });
  doc.setTextColor(0, 0, 0);
  
  // Gerar PDF como blob
  const pdfBlob = doc.output('blob');
  const fileName = `resposta_recurso_${numeroProcesso}_${Date.now()}.pdf`;
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
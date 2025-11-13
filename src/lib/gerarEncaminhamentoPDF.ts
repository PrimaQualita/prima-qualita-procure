import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import logoHorizontal from '@/assets/prima-qualita-logo-horizontal.png';

interface EncaminhamentoResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
}

const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

export const gerarEncaminhamentoPDF = async (
  numeroProcesso: string,
  objetoProcesso: string,
  usuarioNome: string,
  usuarioCpf: string
): Promise<EncaminhamentoResult> => {
  const agora = new Date();
  const dataHora = agora.toLocaleString('pt-BR', { 
    dateStyle: 'long', 
    timeStyle: 'medium' 
  });
  const protocolo = `ENC-${numeroProcesso}-${Date.now()}`;
  
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });
  
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Função para adicionar logo e rodapé
  const adicionarLogoERodape = async () => {
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
    
    doc.addImage(base64Logo, 'PNG', (pageWidth - 60) / 2, 10, 60, 18);
    
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
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('AUTORIZAÇÃO', pageWidth / 2, 50, { align: 'center' });
  
  // Processo
  doc.setFontSize(14);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo ${numeroProcesso}`, pageWidth / 2, 65, { align: 'center' });
  
  // Assunto
  doc.setFontSize(12);
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, 20, 77, { align: 'justify', maxWidth: 170 });
  
  let yPos = 77 + (linhasAssunto.length * 7) + 10;
  
  // Texto principal
  doc.setFontSize(11);
  const textoPrincipal = `Na qualidade de representante legal da PRIMA QUALITÁ SAÚDE, autorizo a presente contratação por SELEÇÃO DE FORNECEDORES, conforme requisição e termo de referência anexos, nos termos do art.4° do Regulamento para Aquisição de Bens, Contratação de Obras, Serviços e Locações da Instituição.`;
  const linhasPrincipal = doc.splitTextToSize(textoPrincipal, 170);
  doc.text(linhasPrincipal, 20, yPos, { align: 'justify', maxWidth: 170 });
  
  yPos += linhasPrincipal.length * 6 + 10;
  
  // Texto de encaminhamento
  const textoEncaminhamento = `Encaminha-se ao Departamento de Compras, para as providências cabíveis.`;
  const linhasEncaminhamento = doc.splitTextToSize(textoEncaminhamento, 170);
  doc.text(linhasEncaminhamento, 20, yPos, { align: 'justify', maxWidth: 170 });
  
  yPos += linhasEncaminhamento.length * 6 + 30;
  
  // Certificação Digital
  if (yPos > pageHeight - 70) {
    doc.addPage();
    await adicionarLogoERodape();
    yPos = 40;
  }
  
  // Desenhar quadro da certificação digital
  const certBoxY = yPos;
  const certBoxHeight = 60;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(15, certBoxY, pageWidth - 30, certBoxHeight);
  
  yPos = certBoxY + 8;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, yPos, { align: 'center' });
  
  yPos += 8;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  doc.text(`Protocolo: ${protocolo}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.text(`Data e hora de emissão: ${dataHora}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.text(`Responsável pela emissão: ${usuarioNome}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.text(`CPF: ${usuarioCpf}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 7;
  
  doc.text('Este documento foi gerado digitalmente pelo sistema Prima Qualitá Procure.', pageWidth / 2, yPos, { align: 'center' });
  yPos += 4;
  doc.text('Para verificar a autenticidade deste documento, acesse:', pageWidth / 2, yPos, { align: 'center' });
  yPos += 4;
  doc.text(`${window.location.origin}/verificar-autorizacao`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 4;
  doc.text(`e informe o protocolo: ${protocolo}`, pageWidth / 2, yPos, { align: 'center' });
  
  // Salvar no Supabase Storage
  const pdfBlob = doc.output('blob');
  const fileName = `encaminhamento_${numeroProcesso}_${Date.now()}.pdf`;
  const storagePath = `encaminhamentos/${fileName}`;
  
  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      cacheControl: '3600',
      upsert: false
    });
  
  if (uploadError) {
    console.error('Erro ao fazer upload do encaminhamento:', uploadError);
    throw uploadError;
  }
  
  // Obter URL público
  const { data: urlData } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);
  
  return {
    url: urlData.publicUrl,
    fileName,
    protocolo,
    storagePath
  };
};

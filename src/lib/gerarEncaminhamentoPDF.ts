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
  
  // Gerar protocolo numérico no formato XXXX-XXXX-XXXX-XXXX
  const timestamp = agora.getTime();
  const protocoloNumerico = timestamp.toString().padStart(16, '0');
  const protocolo = protocoloNumerico.match(/.{1,4}/g)?.join('-') || protocoloNumerico;
  
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
  
  // De/Para
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('De: Departamento de Compras', 20, 50);
  doc.text('Para: Departamento de Compliance', 20, 58);
  
  // Processo
  doc.text(`Processo ${numeroProcesso}`, 20, 70);
  
  // Assunto
  const textoLimpo = extractTextFromHTML(objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(`Assunto: ${textoLimpo}`, 170);
  doc.text(linhasAssunto, 20, 82, { align: 'justify', maxWidth: 170 });
  
  let yPos = 82 + (linhasAssunto.length * 7) + 10;
  
  // Texto principal
  const textoPrincipal = `Encaminhamos o Presente Processo para análise e verificação de regularidade jurídica e reputacional dos fornecedores, em atendimento ao procedimento interno definido por requisitos legais e normativos da OS Prima Qualitá Saúde, nos processos de aquisição e serviços.`;
  const linhasPrincipal = doc.splitTextToSize(textoPrincipal, 170);
  doc.text(linhasPrincipal, 20, yPos, { align: 'justify', maxWidth: 170 });
  
  yPos += linhasPrincipal.length * 6 + 10;
  
  // Certificação Digital
  if (yPos > pageHeight - 70) {
    doc.addPage();
    await adicionarLogoERodape();
    yPos = 40;
  }
  
  // Certificação Digital
  const { adicionarCertificacaoDigital } = await import('./certificacaoDigital');
  const hash = protocolo.replace(/-/g, '').substring(0, 32).toUpperCase();
  
  adicionarCertificacaoDigital(doc, {
    protocolo,
    dataHora,
    responsavel: usuarioNome,
    cpf: usuarioCpf,
    hash,
    linkVerificacao: `${window.location.origin}/verificar-documento?protocolo=${protocolo}`
  }, yPos);
  
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

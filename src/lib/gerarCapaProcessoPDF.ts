import { jsPDF } from 'jspdf';
import { supabase } from '@/integrations/supabase/client';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';

interface DadosCapaProcesso {
  numeroProcesso: string;
  numeroContrato: string;
  observacoesContrato: string;
  objetoProcesso: string;
}

export const gerarCapaProcessoPDF = async (dados: DadosCapaProcesso) => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Carregar logo da capa
  const base64CapaLogo = await new Promise<string>((resolve, reject) => {
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
    img.src = capaLogo;
  });

  // Carregar marca d'água
  const base64MarcaDagua = await new Promise<string>((resolve, reject) => {
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
    img.onerror = () => reject(new Error('Erro ao carregar marca d\'água'));
    img.src = logoMarcaDagua;
  });

  // Carregar rodapé
  const base64Rodape = await new Promise<string>((resolve, reject) => {
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
    img.onerror = () => reject(new Error('Erro ao carregar rodapé'));
    img.src = capaRodape;
  });

  // Adicionar marca d'água
  doc.saveGraphicsState();
  const gState = doc.GState({ opacity: 0.08 });
  doc.setGState(gState);
  const marcaDaguaWidth = 160;
  const marcaDaguaHeight = 80;
  doc.addImage(
    base64MarcaDagua,
    'PNG',
    (pageWidth - marcaDaguaWidth) / 2,
    (pageHeight - marcaDaguaHeight) / 2,
    marcaDaguaWidth,
    marcaDaguaHeight
  );
  doc.restoreGraphicsState();

  // Logo no topo - largura total
  const logoHeight = 40;
  doc.addImage(base64CapaLogo, 'PNG', 0, 0, pageWidth, logoHeight);

  // Rodapé no fundo - largura total
  const rodapeHeight = 25;
  const yRodape = pageHeight - rodapeHeight;
  doc.addImage(base64Rodape, 'PNG', 0, yRodape, pageWidth, rodapeHeight);

  // Conteúdo
  let yPos = logoHeight + 15;

  // Processo
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 84, 144);
  doc.text(`Processo: ${dados.numeroProcesso}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 10;

  // Contrato
  doc.text(`Contrato de Gestão: ${dados.numeroContrato}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Objeto
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Objeto:', 20, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  const linhasObjeto = doc.splitTextToSize(dados.observacoesContrato || 'Não informado', 170);
  doc.text(linhasObjeto, 20, yPos);
  yPos += linhasObjeto.length * 5 + 20;

  // Data
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 84, 144);
  const dataTexto = `Rio de Janeiro, ${new Date().toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  })}`;
  doc.text(dataTexto, pageWidth / 2, yPos, { align: 'center' });
  yPos += 20;

  // Assunto
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Assunto:', 20, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  const linhasAssunto = doc.splitTextToSize(dados.objetoProcesso, 170);
  doc.text(linhasAssunto, 20, yPos, { align: 'justify', maxWidth: 170 });

  return doc.output('blob');
};

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

// Função para extrair texto limpo de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

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

  // Logo no topo - 1.5mm de margem lateral
  const logoHeight = 40;
  doc.addImage(base64CapaLogo, 'PNG', 1.5, 0, pageWidth - 3, logoHeight);

  // Rodapé no fundo - 1.5mm de margem lateral
  const rodapeHeight = 25;
  const yRodape = pageHeight - rodapeHeight;
  doc.addImage(base64Rodape, 'PNG', 1.5, yRodape, pageWidth - 3, rodapeHeight);

  // Conteúdo
  let yPos = logoHeight + 25;

  // Processo - CAIXA ALTA
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`PROCESSO: ${dados.numeroProcesso}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 18;

  // Contrato - CAIXA ALTA (com quebra de linha para textos longos)
  const textoContrato = `CONTRATO DE GESTÃO: ${dados.numeroContrato}`;
  const maxWidthContrato = pageWidth - 30; // Margem de 15mm de cada lado
  const linhasContrato = doc.splitTextToSize(textoContrato, maxWidthContrato);
  doc.text(linhasContrato, pageWidth / 2, yPos, { align: 'center' });
  yPos += linhasContrato.length * 8 + 15;

  // Objeto - texto justificado
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Objeto:', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  const textoObjetoLimpo = extractTextFromHTML(dados.observacoesContrato || 'Não informado');
  const linhasObjeto = doc.splitTextToSize(textoObjetoLimpo, 170);
  doc.text(linhasObjeto, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasObjeto.length * 6 + 35;

  // Data - CAIXA ALTA
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  const dataTexto = `RIO DE JANEIRO, ${new Date().toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: 'long', 
    year: 'numeric' 
  }).toUpperCase()}`;
  doc.text(dataTexto, pageWidth / 2, yPos, { align: 'center' });
  yPos += 35;

  // Assunto - texto justificado e limpo de HTML
  doc.setFontSize(15);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Assunto:', 20, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'normal');
  const textoAssuntoLimpo = extractTextFromHTML(dados.objetoProcesso);
  const linhasAssunto = doc.splitTextToSize(textoAssuntoLimpo, 170);
  doc.text(linhasAssunto, 20, yPos, { align: 'justify', maxWidth: 170 });

  return doc.output('blob');
};

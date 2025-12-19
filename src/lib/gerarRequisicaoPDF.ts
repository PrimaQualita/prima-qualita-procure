import { jsPDF } from 'jspdf';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';

interface DadosRequisicao {
  numeroProcesso: string;
  numeroContrato: string;
  objetoProcesso: string;
  valorEstimado: number;
  centroCusto?: string;
  gerenteNome: string;
  gerenteCargo?: string;
}

// Função para extrair texto limpo de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

// Formatar valor em reais
const formatarValor = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
};

export const gerarRequisicaoPDF = async (dados: DadosRequisicao): Promise<Blob> => {
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

  // Logo no topo
  const logoHeight = 40;
  doc.addImage(base64CapaLogo, 'PNG', 1.5, 0, pageWidth - 3, logoHeight);

  // Rodapé no fundo
  const rodapeHeight = 25;
  const yRodape = pageHeight - rodapeHeight;
  doc.addImage(base64Rodape, 'PNG', 1.5, yRodape, pageWidth - 3, rodapeHeight);

  // Conteúdo
  let yPos = logoHeight + 20;

  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('REQUISIÇÃO DE COMPRA/CONTRATAÇÃO', pageWidth / 2, yPos, { align: 'center' });
  yPos += 15;

  // Processo
  doc.setFontSize(12);
  doc.text(`Processo: ${dados.numeroProcesso}`, 20, yPos);
  yPos += 8;

  // Contrato
  doc.text(`Contrato de Gestão: ${dados.numeroContrato}`, 20, yPos);
  yPos += 8;

  // Data
  doc.text(`Data: ${new Date().toLocaleDateString('pt-BR')}`, 20, yPos);
  yPos += 15;

  // Linha separadora
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.line(20, yPos, pageWidth - 20, yPos);
  yPos += 10;

  // Objeto
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('OBJETO:', 20, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  const textoObjeto = extractTextFromHTML(dados.objetoProcesso);
  const linhasObjeto = doc.splitTextToSize(textoObjeto, 170);
  doc.text(linhasObjeto, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasObjeto.length * 5 + 10;

  // Valor Estimado
  doc.setFont('helvetica', 'bold');
  doc.text('VALOR ESTIMADO:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(formatarValor(dados.valorEstimado), 70, yPos);
  yPos += 8;

  // Centro de Custo
  if (dados.centroCusto) {
    doc.setFont('helvetica', 'bold');
    doc.text('CENTRO DE CUSTO:', 20, yPos);
    doc.setFont('helvetica', 'normal');
    doc.text(dados.centroCusto, 70, yPos);
    yPos += 8;
  }

  // Justificativa
  yPos += 10;
  doc.setFont('helvetica', 'bold');
  doc.text('JUSTIFICATIVA:', 20, yPos);
  yPos += 6;

  doc.setFont('helvetica', 'normal');
  const justificativa = `Solicito a abertura do processo de compra/contratação acima especificado, em conformidade com as normas e regulamentos aplicáveis, visando atender às necessidades operacionais do Contrato de Gestão.`;
  const linhasJustificativa = doc.splitTextToSize(justificativa, 170);
  doc.text(linhasJustificativa, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasJustificativa.length * 5 + 25;

  // Assinatura do Gerente de Contratos
  doc.setFont('helvetica', 'normal');
  doc.text('_'.repeat(50), pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(dados.gerenteNome, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(dados.gerenteCargo || 'Gerente de Contratos', pageWidth / 2, yPos, { align: 'center' });

  return doc.output('blob');
};

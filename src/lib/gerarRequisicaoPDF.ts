import { jsPDF } from 'jspdf';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';
import { adicionarCertificacaoSimplificada } from './certificacaoSimplificada';

interface DadosRequisicao {
  numeroProcesso: string;
  numeroContrato: string;
  enteFederativo: string;
  objetoProcesso: string;
  gerenteNome: string;
  gerenteCargo?: string;
  protocolo: string;
}

// Função para extrair texto limpo de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
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
  let yPos = logoHeight + 25;

  // Título
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('REQUISIÇÃO DE COMPRAS', pageWidth / 2, yPos, { align: 'center' });
  yPos += 20;

  // Destinatário
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text('À Divisão de Compras', 20, yPos);
  yPos += 12;

  // Assunto
  doc.setFont('helvetica', 'bold');
  doc.text('Assunto:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text(' Abertura de Processo', 42, yPos);
  yPos += 15;

  // Texto do objeto - removendo ponto final se existir para complementar com vírgula
  let textoObjeto = extractTextFromHTML(dados.objetoProcesso);
  // Remove ponto final do objeto se existir
  textoObjeto = textoObjeto.replace(/\.\s*$/, '');
  const paragrafo1 = `Solicitamos a abertura de processo para ${textoObjeto}, conforme Termo de Referência que segue anexo.`;
  
  doc.setFontSize(11);
  const linhasParagrafo1 = doc.splitTextToSize(paragrafo1, 170);
  doc.text(linhasParagrafo1, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasParagrafo1.length * 6 + 10;

  // Texto da justificativa - usando o ente federativo do contrato de gestão
  const paragrafo2 = `A presente aquisição se faz necessária, para atender ao Contrato de Gestão Nº ${dados.numeroContrato} firmado com o município de ${dados.enteFederativo}, por intermédio da Secretaria Municipal de Saúde.`;
  
  const linhasParagrafo2 = doc.splitTextToSize(paragrafo2, 170);
  doc.text(linhasParagrafo2, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasParagrafo2.length * 6 + 30;

  // Local e data
  const dataAtual = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: 'long',
    year: 'numeric'
  });
  doc.text(`${dados.enteFederativo}, ${dataAtual}`, pageWidth / 2, yPos, { align: 'center' });
  yPos += 25;

  // Assinatura do Gerente de Contratos
  doc.text('_'.repeat(50), pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.setFont('helvetica', 'bold');
  doc.text(dados.gerenteNome, pageWidth / 2, yPos, { align: 'center' });
  yPos += 5;
  doc.setFont('helvetica', 'normal');
  doc.text(dados.gerenteCargo || 'Gerente de Contratos', pageWidth / 2, yPos, { align: 'center' });
  yPos += 20;

  // Adicionar certificação simplificada
  const linkVerificacao = `${window.location.origin}/verificar-documento?protocolo=${dados.protocolo}`;
  adicionarCertificacaoSimplificada(doc, {
    protocolo: dados.protocolo,
    responsavel: dados.gerenteNome,
    linkVerificacao: linkVerificacao
  }, yPos);

  return doc.output('blob');
};

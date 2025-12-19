import { jsPDF } from 'jspdf';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';
import { adicionarCertificacaoSimplificada } from './certificacaoSimplificada';

interface DadosAutorizacaoDespesa {
  numeroProcesso: string;
  objetoProcesso: string;
  centroCusto?: string;
  superintendenteNome: string;
  superintendenteGenero?: string;
  protocolo: string;
}

// Função para extrair texto limpo de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

const normalizarGenero = (genero?: string): 'masculino' | 'feminino' => {
  const v = (genero ?? '').trim().toLowerCase();
  if (v.startsWith('m')) return 'masculino';
  if (v.startsWith('f')) return 'feminino';
  return 'feminino';
};

export const gerarAutorizacaoDespesaPDF = async (dados: DadosAutorizacaoDespesa): Promise<Blob> => {
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
  doc.text('AUTORIZAÇÃO DA DESPESA', pageWidth / 2, yPos, { align: 'center' });
  yPos += 20;

  // Processo
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(`Processo nº ${dados.numeroProcesso}`, 20, yPos);
  yPos += 15;

  // Objeto
  doc.setFont('helvetica', 'bold');
  doc.text('OBJETO:', 20, yPos);
  yPos += 6;
  doc.setFont('helvetica', 'normal');
  const textoObjeto = extractTextFromHTML(dados.objetoProcesso);
  const linhasObjeto = doc.splitTextToSize(textoObjeto, 170);
  doc.text(linhasObjeto, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasObjeto.length * 5 + 6;

  // Rubrica (Centro de Custo)
  const rubrica = dados.centroCusto?.toUpperCase() || 'NÃO INFORMADO';
  doc.setFontSize(12);
  const textoRubrica = `As despesas decorrentes da contratação em tela deverão ocorrer de acordo com o Programa de Trabalho, na rubrica de ${rubrica}.`;
  const linhasRubrica = doc.splitTextToSize(textoRubrica, 170);
  doc.text(linhasRubrica, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasRubrica.length * 5 + 6;

  // Texto de autorização - ajustar gênero baseado no usuário
  const generoNorm = normalizarGenero(dados.superintendenteGenero);
  const generoTermo = generoNorm === 'masculino' ? 'Executivo' : 'Executiva';
  const textoAutorizacao = `Na qualidade de Superintendente ${generoTermo} da PRIMA QUALITÁ SAÚDE, autorizo a presente despesa na rubrica indicada, conforme requisição e termo de referência anexos.`;
  const linhasAutorizacao = doc.splitTextToSize(textoAutorizacao, 170);
  doc.text(linhasAutorizacao, 20, yPos, { align: 'justify', maxWidth: 170 });
  yPos += linhasAutorizacao.length * 5 + 6;

  // Encaminhamento
  const textoEncaminhamento = `Encaminha-se ao Departamento de Compras, para as providências cabíveis.`;
  doc.text(textoEncaminhamento, 20, yPos);

  // Posicionar certificação acima do rodapé
  const alturaCertificacao = 45;
  const yPosCertificacao = pageHeight - rodapeHeight - alturaCertificacao - 5;

  // Adicionar certificação simplificada
  const linkVerificacao = `${window.location.origin}/verificar-documento?protocolo=${dados.protocolo}`;
  adicionarCertificacaoSimplificada(doc, {
    protocolo: dados.protocolo,
    responsavel: dados.superintendenteNome,
    linkVerificacao: linkVerificacao
  }, yPosCertificacao);

  return doc.output('blob');
};

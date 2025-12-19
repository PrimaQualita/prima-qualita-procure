import { jsPDF } from 'jspdf';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';
import { adicionarCertificacaoSimplificada } from './certificacaoSimplificada';
import { supabase } from '@/integrations/supabase/client';

interface FornecedorVencedor {
  razaoSocial: string;
  cnpj: string;
  itensVencedores?: number[];
}

interface DadosEncaminhamentoContabilidade {
  numeroProcesso: string;
  objetoProcesso: string;
  fornecedoresVencedores: FornecedorVencedor[];
  usuarioNome: string;
  protocolo: string;
}

export interface EncaminhamentoContabilidadeResult {
  url: string;
  fileName: string;
  protocolo: string;
  storagePath: string;
  blob?: Blob;
}

// Função para extrair texto limpo de HTML
const extractTextFromHTML = (html: string): string => {
  const div = document.createElement('div');
  div.innerHTML = html;
  return div.textContent || div.innerText || '';
};

// Função para formatar CNPJ
const formatarCNPJ = (cnpj: string): string => {
  const numeros = cnpj.replace(/\D/g, '');
  if (numeros.length !== 14) return cnpj;
  return `${numeros.slice(0,2)}.${numeros.slice(2,5)}.${numeros.slice(5,8)}/${numeros.slice(8,12)}-${numeros.slice(12,14)}`;
};

export const gerarEncaminhamentoContabilidadePDF = async (
  dados: DadosEncaminhamentoContabilidade
): Promise<EncaminhamentoContabilidadeResult> => {
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
  let yPos = logoHeight + 15;

  // De: / Para:
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.setFont('helvetica', 'bold');
  doc.text('De:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('Departamento de Compras', 30, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Para:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('Departamento de Contabilidade', 32, yPos);
  yPos += 12;

  // Processo - alinhado à esquerda
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Processo ${dados.numeroProcesso}`, 20, yPos);
  yPos += 8;

  // Espaçamento entre linhas (1.25 = 6.25mm para fonte 11)
  const lineHeight = 6.25;

  // Objeto
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('OBJETO:', 20, yPos);
  yPos += lineHeight;
  
  doc.setFont('helvetica', 'normal');
  const textoObjeto = extractTextFromHTML(dados.objetoProcesso);
  const linhasObjeto = doc.splitTextToSize(textoObjeto, 170);
  // Renderizar linha por linha para evitar justificação ruim na última linha
  linhasObjeto.forEach((linha: string, index: number) => {
    if (index < linhasObjeto.length - 1) {
      doc.text(linha, 20, yPos, { align: 'justify', maxWidth: 170 });
    } else {
      // Última linha: alinhada à esquerda
      doc.text(linha, 20, yPos);
    }
    yPos += lineHeight;
  });
  yPos += 4;

  // Assunto
  doc.setFont('helvetica', 'bold');
  doc.text('Assunto:', 20, yPos);
  yPos += lineHeight;
  
  doc.setFont('helvetica', 'normal');
  const textoAssunto = 'Tipo de Operação para lançamento de Contrato (CIGAM).';
  doc.text(textoAssunto, 20, yPos);
  yPos += 8;

  // Fornecedores
  doc.setFont('helvetica', 'bold');
  doc.text('Fornecedor(es):', 20, yPos);
  yPos += lineHeight;
  
  doc.setFont('helvetica', 'normal');
  dados.fornecedoresVencedores.forEach((fornecedor, index) => {
    const textoFornecedor = `${index + 1}. ${fornecedor.razaoSocial} - CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`;
    const linhasFornecedor = doc.splitTextToSize(textoFornecedor, 170);
    linhasFornecedor.forEach((linha: string) => {
      doc.text(linha, 20, yPos);
      yPos += lineHeight;
    });
  });
  yPos += 4;

  // Texto do corpo
  doc.setFontSize(11);
  
  // Parágrafo 1: Prezados
  doc.text('Prezados(as),', 20, yPos);
  yPos += lineHeight * 2;
  
  // Parágrafo 2: Corpo principal
  const corpoTexto = 'Encaminhamos o presente processo para análise e verificação, a fim de determinar qual tipo de operação deve ser utilizada para o lançamento no sistema CIGAM, de maneira a garantir a continuidade do processo e assegurar que o registro seja efetuado corretamente, em conformidade com os procedimentos contábeis e fiscais.';
  const linhasCorpo = doc.splitTextToSize(corpoTexto, 170);
  linhasCorpo.forEach((linha: string, index: number) => {
    if (index < linhasCorpo.length - 1) {
      doc.text(linha, 20, yPos, { align: 'justify', maxWidth: 170 });
    } else {
      doc.text(linha, 20, yPos);
    }
    yPos += lineHeight;
  });
  yPos += lineHeight;
  
  // Parágrafo 3: Agradecimento
  doc.text('Agradecemos antecipadamente pelo atendimento.', 20, yPos);

  // Posicionar certificação acima do rodapé
  const alturaCertificacao = 45;
  const yPosCertificacao = pageHeight - rodapeHeight - alturaCertificacao - 5;

  // Adicionar certificação simplificada
  const linkVerificacao = `${window.location.origin}/verificar-documento?protocolo=${dados.protocolo}`;
  adicionarCertificacaoSimplificada(doc, {
    protocolo: dados.protocolo,
    responsavel: dados.usuarioNome,
    linkVerificacao: linkVerificacao
  }, yPosCertificacao);

  // Gerar blob
  const pdfBlob = doc.output('blob');
  
  // Salvar no storage
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const fileName = `encaminhamento-contabilidade-${dados.numeroProcesso.replace(/\//g, '-')}-${timestamp}.pdf`;
  const storagePath = `encaminhamentos-contabilidade/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: false
    });

  if (uploadError) {
    console.error('Erro ao fazer upload:', uploadError);
    throw new Error(`Erro ao salvar PDF: ${uploadError.message}`);
  }

  // Obter URL pública
  const { data: urlData } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);

  return {
    url: urlData.publicUrl,
    fileName,
    protocolo: dados.protocolo,
    storagePath,
    blob: pdfBlob
  };
};

// Função para gerar protocolo único
export const gerarProtocoloContabilidade = (): string => {
  const chars = '0123456789';
  let result = '';
  for (let i = 0; i < 16; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
    if ((i + 1) % 4 === 0 && i < 15) {
      result += '-';
    }
  }
  return result;
};

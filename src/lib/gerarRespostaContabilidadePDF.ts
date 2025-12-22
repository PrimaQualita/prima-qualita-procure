import { jsPDF } from 'jspdf';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';
import { adicionarCertificacaoSimplificada } from './certificacaoSimplificada';
import { supabase } from '@/integrations/supabase/client';

interface FornecedorResposta {
  razaoSocial: string;
  cnpj: string;
  tipoOperacao: string;
}

interface DadosRespostaContabilidade {
  numeroProcesso: string;
  objetoProcesso: string;
  fornecedores: FornecedorResposta[];
  usuarioNome: string;
  protocolo: string;
}

export interface RespostaContabilidadeResult {
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

// Função para carregar imagem como base64
const carregarImagemBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
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
    img.onerror = () => reject(new Error('Erro ao carregar imagem'));
    img.src = src;
  });
};

export const gerarRespostaContabilidadePDF = async (
  dados: DadosRespostaContabilidade
): Promise<RespostaContabilidadeResult> => {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4'
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Carregar imagens
  const [base64CapaLogo, base64MarcaDagua, base64Rodape] = await Promise.all([
    carregarImagemBase64(capaLogo),
    carregarImagemBase64(logoMarcaDagua),
    carregarImagemBase64(capaRodape)
  ]);

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
  const lineHeight = 6.25;

  // De: / Para:
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.setFont('helvetica', 'bold');
  doc.text('De:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('Departamento de Contabilidade', 30, yPos);
  yPos += 7;

  doc.setFont('helvetica', 'bold');
  doc.text('Para:', 20, yPos);
  doc.setFont('helvetica', 'normal');
  doc.text('Departamento de Compras', 32, yPos);
  yPos += 12;

  // Processo - alinhado à esquerda
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text(`Processo: ${dados.numeroProcesso}`, 20, yPos);
  yPos += 10;

  // Objeto
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('OBJETO:', 20, yPos);
  yPos += lineHeight;
  
  doc.setFont('helvetica', 'normal');
  const textoObjeto = extractTextFromHTML(dados.objetoProcesso);
  const linhasObjeto = doc.splitTextToSize(textoObjeto, 170);
  linhasObjeto.forEach((linha: string, index: number) => {
    if (index < linhasObjeto.length - 1 && linhasObjeto.length > 1) {
      const palavras = linha.split(' ');
      if (palavras.length > 1) {
        const textoWidth = 170;
        const textWidth = doc.getTextWidth(linha);
        const espacoExtra = (textoWidth - textWidth) / (palavras.length - 1);
        let xPos = 20;
        palavras.forEach((palavra) => {
          doc.text(palavra, xPos, yPos);
          xPos += doc.getTextWidth(palavra) + doc.getTextWidth(' ') + espacoExtra;
        });
      } else {
        doc.text(linha, 20, yPos);
      }
    } else {
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
  yPos += 10;

  // Texto introdutório
  doc.text('Prezados(as),', 20, yPos);
  yPos += lineHeight * 2;

  // Corpo do texto
  const corpoTexto = 'Encaminhamos o presente processo após análise e verificação quanto ao Tipo de Operação a ser utilizado para o lançamento no sistema CIGAM, conforme abaixo indicado:';
  const linhasCorpo = doc.splitTextToSize(corpoTexto, 170);
  linhasCorpo.forEach((linha: string, index: number) => {
    if (index < linhasCorpo.length - 1 && linhasCorpo.length > 1) {
      const palavras = linha.split(' ');
      if (palavras.length > 1) {
        const textoWidth = 170;
        const textWidth = doc.getTextWidth(linha);
        const espacoExtra = (textoWidth - textWidth) / (palavras.length - 1);
        let xPos = 20;
        palavras.forEach((palavra) => {
          doc.text(palavra, xPos, yPos);
          xPos += doc.getTextWidth(palavra) + doc.getTextWidth(' ') + espacoExtra;
        });
      } else {
        doc.text(linha, 20, yPos);
      }
    } else {
      doc.text(linha, 20, yPos);
    }
    yPos += lineHeight;
  });
  yPos += 8;

  // Título da tabela
  doc.setFont('helvetica', 'bold');
  doc.text('Tipo de Operação:', 20, yPos);
  yPos += 8;

  // Tabela de fornecedores com tipos de operação
  const colWidth1 = 120; // Fornecedor
  const colWidth2 = 50;  // Tipo de Operação
  const cellPadding = 3;
  const tableWidth = colWidth1 + colWidth2;
  const tableStartX = 20;
  const headerHeight = 8;
  const maxYBeforeBreak = pageHeight - rodapeHeight - 50; // Margem antes do rodapé

  // Função para desenhar cabeçalho da tabela
  const desenharCabecalhoTabela = (yPosition: number): number => {
    doc.setFillColor(240, 240, 240);
    doc.rect(tableStartX, yPosition, tableWidth, headerHeight, 'F');
    doc.setDrawColor(200, 200, 200);
    doc.rect(tableStartX, yPosition, tableWidth, headerHeight, 'S');
    doc.line(tableStartX + colWidth1, yPosition, tableStartX + colWidth1, yPosition + headerHeight);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    
    // Centralizar textos do cabeçalho
    const textoFornecedor = 'Fornecedor';
    const textoTipoOp = 'Tipo de Operação';
    const larguraFornecedor = doc.getTextWidth(textoFornecedor);
    const larguraTipoOp = doc.getTextWidth(textoTipoOp);
    
    doc.text(textoFornecedor, tableStartX + (colWidth1 - larguraFornecedor) / 2, yPosition + 5.5);
    doc.text(textoTipoOp, tableStartX + colWidth1 + (colWidth2 - larguraTipoOp) / 2, yPosition + 5.5);
    
    return yPosition + headerHeight;
  };

  // Função para adicionar nova página com cabeçalho, logo, rodapé e marca d'água
  const adicionarNovaPagina = (): number => {
    doc.addPage();
    
    // Adicionar marca d'água
    doc.saveGraphicsState();
    const gState2 = doc.GState({ opacity: 0.08 });
    doc.setGState(gState2);
    doc.addImage(
      base64MarcaDagua,
      'PNG',
      (pageWidth - 160) / 2,
      (pageHeight - 80) / 2,
      160,
      80
    );
    doc.restoreGraphicsState();
    
    // Logo no topo
    doc.addImage(base64CapaLogo, 'PNG', 1.5, 0, pageWidth - 3, logoHeight);
    
    // Rodapé no fundo
    doc.addImage(base64Rodape, 'PNG', 1.5, yRodape, pageWidth - 3, rodapeHeight);
    
    // Retornar posição Y após o logo
    return logoHeight + 15;
  };

  // Desenhar cabeçalho inicial
  yPos = desenharCabecalhoTabela(yPos);

  // Linhas da tabela
  doc.setFont('helvetica', 'normal');
  dados.fornecedores.forEach((fornecedor) => {
    // Linha 1: Nome da empresa
    const linhasNome = doc.splitTextToSize(fornecedor.razaoSocial, colWidth1 - cellPadding * 2);
    // Linha 2: CNPJ
    const textoCNPJ = `CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`;
    
    // Calcular altura: linhas do nome + 1 linha do CNPJ + padding
    const alturaLinha = (linhasNome.length * 5) + 5 + 4;
    
    // Verificar se precisa quebrar para próxima página
    if (yPos + alturaLinha > maxYBeforeBreak) {
      yPos = adicionarNovaPagina();
      yPos = desenharCabecalhoTabela(yPos);
    }
    
    // Bordas das células
    doc.setDrawColor(200, 200, 200);
    doc.rect(tableStartX, yPos, colWidth1, alturaLinha, 'S');
    doc.rect(tableStartX + colWidth1, yPos, colWidth2, alturaLinha, 'S');
    
    // Texto do nome da empresa
    let textoY = yPos + 5;
    doc.setFont('helvetica', 'bold');
    linhasNome.forEach((linha: string) => {
      doc.text(linha, tableStartX + cellPadding, textoY);
      textoY += 5;
    });
    
    // CNPJ abaixo do nome
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.text(textoCNPJ, tableStartX + cellPadding, textoY);
    doc.setFontSize(10);
    
    // Tipo de operação (centralizado verticalmente)
    doc.setFont('helvetica', 'bold');
    const tipoOpWidth = doc.getTextWidth(fornecedor.tipoOperacao);
    doc.text(fornecedor.tipoOperacao, tableStartX + colWidth1 + (colWidth2 - tipoOpWidth) / 2, yPos + alturaLinha / 2 + 2);
    doc.setFont('helvetica', 'normal');
    
    yPos += alturaLinha;
  });

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
  const fileName = `resposta-contabilidade-${dados.numeroProcesso.replace(/\//g, '-')}-${timestamp}.pdf`;
  const storagePath = `respostas-contabilidade/${fileName}`;

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
export const gerarProtocoloRespostaContabilidade = (): string => {
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

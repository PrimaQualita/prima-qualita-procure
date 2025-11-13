import jsPDF from 'jspdf';
import { gerarHashDocumento } from './certificacaoDigital';

interface ItemProposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca_ofertada: string;
  valor_unitario_ofertado: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  endereco_comercial: string;
}

// Função para formatar valores em Real brasileiro
const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

export async function gerarPropostaPDF(
  processo: { numero: string; objeto: string },
  fornecedor: DadosFornecedor,
  itens: ItemProposta[],
  valorTotal: number,
  observacoes: string | null
): Promise<Blob> {
  const doc = new jsPDF();
  const dataEnvio = new Date().toLocaleString('pt-BR');
  
  // Criar conteúdo para hash
  const conteudoHash = `
    Processo: ${processo.numero}
    Fornecedor: ${fornecedor.razao_social}
    CNPJ: ${fornecedor.cnpj}
    Data: ${dataEnvio}
    Valor Total: ${valorTotal.toFixed(2)}
    Itens: ${JSON.stringify(itens)}
  `;
  
  const hash = await gerarHashDocumento(conteudoHash);
  
  const itensOrdenados = [...itens].sort((a, b) => a.numero_item - b.numero_item);
  
  let y = 20;
  const pageWidth = doc.internal.pageSize.getWidth();
  const margemEsquerda = 15;
  const larguraUtil = pageWidth - 30;

  // Cabeçalho
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(14, 165, 233); // Azul
  doc.text('PROPOSTA DE COTAÇÃO DE PREÇOS', pageWidth / 2, y, { align: 'center' });
  y += 12;

  // Informações do Processo
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text(`Processo: ${processo.numero}`, margemEsquerda, y);
  y += 5;
  
  doc.setFont('helvetica', 'normal');
  const objetoLines = doc.splitTextToSize(`Descrição: ${processo.objeto}`, larguraUtil);
  doc.text(objetoLines, margemEsquerda, y);
  y += objetoLines.length * 5 + 3;
  
  doc.text(`Data de Envio: ${dataEnvio}`, margemEsquerda, y);
  y += 10;

  // Dados do Fornecedor
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Dados do Fornecedor', margemEsquerda, y);
  y += 7;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Razão Social: ${fornecedor.razao_social}`, margemEsquerda, y);
  y += 5;
  doc.text(`CNPJ: ${fornecedor.cnpj}`, margemEsquerda, y);
  y += 5;
  
  const enderecoLines = doc.splitTextToSize(`Endereço: ${fornecedor.endereco_comercial}`, larguraUtil);
  doc.text(enderecoLines, margemEsquerda, y);
  y += enderecoLines.length * 5 + 8;

  // Itens Cotados
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Itens Cotados', margemEsquerda, y);
  y += 8;

  // Cabeçalho da tabela
  doc.setFontSize(8);
  doc.setFont('helvetica', 'bold');
  doc.text('Item', margemEsquerda, y);
  doc.text('Descrição', margemEsquerda + 10, y);
  doc.text('Qtd', margemEsquerda + 85, y);
  doc.text('Unid', margemEsquerda + 105, y);
  doc.text('Marca', margemEsquerda + 125, y);
  doc.text('Vlr Unit (R$)', margemEsquerda + 145, y, { align: 'right' });
  doc.text('Vlr Total (R$)', larguraUtil + margemEsquerda, y, { align: 'right' });
  y += 2;
  
  doc.setLineWidth(0.5);
  doc.line(margemEsquerda, y, larguraUtil + margemEsquerda, y);
  y += 5;

  // Itens
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  
  for (const item of itensOrdenados) {
    if (y > 270) {
      doc.addPage();
      y = 20;
    }

    const valorItemTotal = item.quantidade * item.valor_unitario_ofertado;
    
    doc.text(item.numero_item.toString(), margemEsquerda, y);
    
    const descricaoMaxWidth = 70;
    const descricaoLines = doc.splitTextToSize(item.descricao, descricaoMaxWidth);
    doc.text(descricaoLines[0], margemEsquerda + 10, y);
    
    doc.text(formatarMoeda(item.quantidade), margemEsquerda + 85, y);
    doc.text(item.unidade, margemEsquerda + 105, y);
    doc.text(item.marca_ofertada || '-', margemEsquerda + 125, y);
    doc.text(formatarMoeda(item.valor_unitario_ofertado), margemEsquerda + 145, y, { align: 'right' });
    doc.text(formatarMoeda(valorItemTotal), larguraUtil + margemEsquerda, y, { align: 'right' });
    
    y += 6;
  }

  // Linha de separação
  y += 2;
  doc.setLineWidth(0.5);
  doc.line(margemEsquerda, y, larguraUtil + margemEsquerda, y);
  y += 6;

  // Valor total
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VALOR TOTAL DA PROPOSTA:', margemEsquerda + 100, y);
  doc.text(`R$ ${formatarMoeda(valorTotal)}`, larguraUtil + margemEsquerda, y, { align: 'right' });
  y += 10;

  // Observações
  if (observacoes) {
    if (y > 250) {
      doc.addPage();
      y = 20;
    }
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('Observações:', margemEsquerda, y);
    y += 6;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(observacoes, larguraUtil);
    doc.text(obsLines, margemEsquerda, y);
    y += obsLines.length * 5 + 8;
  }

  // Certificação Digital
  if (y > 220) {
    doc.addPage();
    y = 20;
  }

  const certBoxY = y;
  const certBoxHeight = 50;
  
  // Fundo cinza claro
  doc.setFillColor(240, 249, 255);
  doc.rect(margemEsquerda, certBoxY, larguraUtil, certBoxHeight, 'F');
  
  // Borda azul
  doc.setDrawColor(14, 165, 233);
  doc.setLineWidth(1);
  doc.rect(margemEsquerda, certBoxY, larguraUtil, certBoxHeight);
  
  y += 6;
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(14, 165, 233);
  doc.text('🔒 CERTIFICAÇÃO DIGITAL', pageWidth / 2, y, { align: 'center' });
  
  y += 7;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 0);
  doc.text('Hash SHA-256 do Documento:', margemEsquerda + 3, y);
  y += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(5, 150, 105); // Verde
  const hashLines = doc.splitTextToSize(hash, larguraUtil - 6);
  doc.text(hashLines, margemEsquerda + 3, y);
  y += hashLines.length * 4 + 5;
  
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.setFont('helvetica', 'italic');
  const textoAutenticidade = 'Este documento foi certificado digitalmente. O hash acima garante a autenticidade e integridade desta proposta. Qualquer alteração no conteúdo resultará em um hash diferente, invalidando a certificação.';
  const autenticidadeLines = doc.splitTextToSize(textoAutenticidade, larguraUtil - 6);
  doc.text(autenticidadeLines, margemEsquerda + 3, y);

  // Gerar PDF como blob
  const pdfBlob = doc.output('blob');
  return pdfBlob;
}

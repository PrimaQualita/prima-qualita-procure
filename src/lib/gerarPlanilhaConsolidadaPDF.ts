import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { gerarHashDocumento } from './certificacaoDigital';

interface ItemCotacao {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  lote_numero?: number;
  lote_descricao?: string;
}

interface RespostaFornecedor {
  fornecedor: {
    razao_social: string;
    cnpj: string;
    email?: string;
  };
  itens: {
    numero_item: number;
    valor_unitario_ofertado: number;
    marca?: string;
  }[];
  valor_total: number;
}

interface DadosProtocolo {
  protocolo: string;
  usuario: {
    nome_completo: string;
    cpf: string;
  };
}

const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    style: 'currency', 
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
};

// Decodificar entidades HTML
const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

export async function gerarPlanilhaConsolidadaPDF(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: RespostaFornecedor[],
  dadosProtocolo: DadosProtocolo
): Promise<Blob> {
  const doc = new jsPDF({ 
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
    precision: 16
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemEsquerda = 15;
  const margemDireita = 15;
  const larguraUtil = pageWidth - margemEsquerda - margemDireita;
  
  let y = 20;

  // Cabeçalho com cores do sistema
  doc.setFillColor(37, 99, 235); // primary color
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANILHA CONSOLIDADA DE PROPOSTAS', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(12);
  doc.setFont('helvetica', 'normal');
  doc.text(processo.numero, pageWidth / 2, 23, { align: 'center' });
  
  // Decodificar o objeto antes de exibir
  const objetoDecodificado = decodeHtmlEntities(processo.objeto);
  const objetoLinhas = doc.splitTextToSize(objetoDecodificado, larguraUtil);
  objetoLinhas.forEach((linha: string, index: number) => {
    doc.text(linha, pageWidth / 2, 30 + (index * 5), { align: 'center' });
  });

  y = 50;

  // Informações da Cotação
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('Cotação:', margemEsquerda, y);
  doc.setFont('helvetica', 'normal');
  doc.text(cotacao.titulo_cotacao, margemEsquerda + 25, y);
  
  y += 7;
  doc.setFont('helvetica', 'bold');
  doc.text('Data de Geração:', margemEsquerda, y);
  doc.setFont('helvetica', 'normal');
  doc.text(new Date().toLocaleString('pt-BR'), margemEsquerda + 40, y);

  y += 10;

  // Preparar dados da tabela
  const colunas = [
    { header: 'Item', dataKey: 'item' },
    { header: 'Descrição', dataKey: 'descricao' },
    { header: 'Qtd', dataKey: 'quantidade' },
    { header: 'Unid.', dataKey: 'unidade' }
  ];

  // Adicionar colunas de fornecedores com CNPJ e Email
  respostas.forEach((resposta, index) => {
    const headerText = `${resposta.fornecedor.razao_social}\nCNPJ: ${resposta.fornecedor.cnpj}${resposta.fornecedor.email ? '\n' + resposta.fornecedor.email : ''}`;
    colunas.push({
      header: headerText,
      dataKey: `fornecedor_${index}`
    });
  });

  // Preparar linhas
  const linhas: any[] = [];
  
  itens.forEach(item => {
    const linha: any = {
      item: item.numero_item.toString(),
      descricao: item.descricao,
      quantidade: item.quantidade.toString(),
      unidade: item.unidade
    };

    respostas.forEach((resposta, index) => {
      const respostaItem = resposta.itens.find(i => i.numero_item === item.numero_item);
      linha[`fornecedor_${index}`] = respostaItem 
        ? formatarMoeda(respostaItem.valor_unitario_ofertado)
        : '-';
    });

    linhas.push(linha);
  });

  // Adicionar linha de totais
  const linhaTotais: any = {
    item: '',
    descricao: 'VALOR TOTAL',
    quantidade: '',
    unidade: ''
  };

  respostas.forEach((resposta, index) => {
    linhaTotais[`fornecedor_${index}`] = formatarMoeda(resposta.valor_total);
  });

  linhas.push(linhaTotais);

  // Gerar tabela
  autoTable(doc, {
    startY: y,
    head: [colunas.map(c => c.header)],
    body: linhas.map(linha => colunas.map(col => linha[col.dataKey] || '')),
    theme: 'grid',
    headStyles: {
      fillColor: [37, 99, 235], // primary color
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.3,
      lineColor: [0, 0, 0],
      minCellHeight: 12
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [0, 0, 0],
      lineWidth: 0.3,
      lineColor: [0, 0, 0],
      cellPadding: 3,
      minCellHeight: 10
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // muted background
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center', valign: 'middle' },
      1: { cellWidth: 60, valign: 'middle' },
      2: { cellWidth: 15, halign: 'center', valign: 'middle' },
      3: { cellWidth: 15, halign: 'center', valign: 'middle' }
    },
    margin: { left: margemEsquerda, right: margemDireita },
    didParseCell: function(data) {
      // Destacar linha de totais
      if (data.row.index === linhas.length - 1) {
        data.cell.styles.fillColor = [226, 232, 240]; // secondary color
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 10;
        data.cell.styles.textColor = [0, 0, 0];
      }
      // Garantir texto preto em todas as células
      data.cell.styles.textColor = [0, 0, 0];
    }
  });

  // Pegar a posição Y após a tabela
  const finalY = (doc as any).lastAutoTable.finalY;

  // Verificar se precisa de nova página para certificação
  let y2 = finalY + 15;
  if (y2 > pageHeight - 50) {
    doc.addPage();
    y2 = 20;
  }

  // Gerar hash do conteúdo
  const conteudoParaHash = JSON.stringify({
    processo: processo.numero,
    cotacao: cotacao.titulo_cotacao,
    itens,
    respostas: respostas.map(r => ({
      fornecedor: r.fornecedor.cnpj,
      total: r.valor_total
    })),
    protocolo: dadosProtocolo.protocolo
  });

  const hash = await gerarHashDocumento(conteudoParaHash);
  const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${dadosProtocolo.protocolo}`;

  // Certificação simplificada
  doc.setFillColor(245, 245, 245);
  doc.rect(margemEsquerda, y2, larguraUtil, 35, 'F');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margemEsquerda, y2, larguraUtil, 35, 'S');

  y2 += 6;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 139);
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, y2, { align: 'center' });
  
  y2 += 6;
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.text(`Protocolo: ${dadosProtocolo.protocolo}`, margemEsquerda + 3, y2);
  y2 += 5;
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')} por ${dadosProtocolo.usuario.nome_completo}`, margemEsquerda + 3, y2);
  y2 += 5;
  doc.text(`Hash: ${hash.substring(0, 60)}...`, margemEsquerda + 3, y2);
  y2 += 5;
  
  doc.setTextColor(0, 0, 255);
  doc.setFont('helvetica', 'italic');
  doc.setFontSize(8);
  doc.text(`Verifique em: ${linkVerificacao}`, margemEsquerda + 3, y2);

  return doc.output('blob');
}

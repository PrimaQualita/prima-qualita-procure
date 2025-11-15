import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { adicionarCertificacaoDigital, gerarHashDocumento } from './certificacaoDigital';

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
    format: 'a4'
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
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANILHA CONSOLIDADA DE PROPOSTAS', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(processo.numero, pageWidth / 2, 23, { align: 'center' });
  doc.text(processo.objeto, pageWidth / 2, 30, { align: 'center' });

  y = 45;

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

  // Adicionar colunas de fornecedores
  respostas.forEach((resposta, index) => {
    colunas.push({
      header: resposta.fornecedor.razao_social,
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
      fontSize: 9,
      halign: 'center'
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0]
    },
    alternateRowStyles: {
      fillColor: [248, 250, 252] // muted background
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center' },
      1: { cellWidth: 60 },
      2: { cellWidth: 15, halign: 'center' },
      3: { cellWidth: 15, halign: 'center' }
    },
    margin: { left: margemEsquerda, right: margemDireita },
    didParseCell: function(data) {
      // Destacar linha de totais
      if (data.row.index === linhas.length - 1) {
        data.cell.styles.fillColor = [226, 232, 240]; // secondary color
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9;
      }
    }
  });

  // Pegar a posição Y após a tabela
  const finalY = (doc as any).lastAutoTable.finalY;

  // Adicionar informações adicionais
  y = finalY + 10;

  // Verificar se precisa de nova página
  if (y > pageHeight - 80) {
    doc.addPage();
    y = 20;
  }

  // Informações de fornecedores com CNPJ
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('Fornecedores Participantes:', margemEsquerda, y);
  y += 6;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  respostas.forEach((resposta, index) => {
    if (y > pageHeight - 60) {
      doc.addPage();
      y = 20;
    }
    
    const texto = `${index + 1}. ${resposta.fornecedor.razao_social} - CNPJ: ${resposta.fornecedor.cnpj}`;
    doc.text(texto, margemEsquerda + 5, y);
    y += 5;
  });

  y += 5;

  // Verificar se precisa de nova página para certificação
  if (y > pageHeight - 70) {
    doc.addPage();
    y = 20;
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

  // Adicionar certificação digital
  const linkVerificacao = `${window.location.origin}/verificar-planilha?protocolo=${dadosProtocolo.protocolo}`;
  
  adicionarCertificacaoDigital(doc, {
    protocolo: dadosProtocolo.protocolo,
    dataHora: new Date().toLocaleString('pt-BR'),
    responsavel: dadosProtocolo.usuario.nome_completo,
    cpf: dadosProtocolo.usuario.cpf,
    hash: hash,
    linkVerificacao: linkVerificacao
  }, y);

  return doc.output('blob');
}

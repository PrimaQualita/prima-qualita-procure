import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

interface ItemCotacao {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  lote_numero?: number;
  lote_descricao?: string;
}

interface FornecedorResposta {
  fornecedor: {
    id: string;
    razao_social: string;
    cnpj: string;
  };
  itens: {
    numero_item: number;
    valor_unitario_ofertado: number;
    percentual_desconto?: number;
    marca?: string;
  }[];
  valor_total: number;
  rejeitado: boolean;
  itens_rejeitados: number[];
  motivo_rejeicao?: string;
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

const formatarPercentual = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + '%';
};

const formatarCNPJ = (cnpj: string): string => {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

// Função para justificar texto manualmente no jsPDF
const justificarTexto = (doc: any, texto: string, x: number, y: number, larguraMaxima: number) => {
  const palavras = texto.trim().split(/\s+/);
  
  if (palavras.length === 1) {
    doc.text(texto, x, y);
    return;
  }
  
  const textoSemEspacos = palavras.join('');
  const larguraTexto = doc.getTextWidth(textoSemEspacos);
  const espacoDisponivel = larguraMaxima - larguraTexto;
  const numEspacos = palavras.length - 1;
  const espacoPorPalavra = espacoDisponivel / numEspacos;
  
  let xAtual = x;
  palavras.forEach((palavra, index) => {
    doc.text(palavra, xAtual, y);
    xAtual += doc.getTextWidth(palavra) + espacoPorPalavra;
  });
};

export async function gerarPlanilhaHabilitacaoPDF(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: FornecedorResposta[],
  dadosProtocolo: DadosProtocolo,
  criterioJulgamento?: string
): Promise<{ blob: Blob; storagePath: string }> {
  const doc = new jsPDF({ 
    orientation: "landscape", 
    unit: "mm", 
    format: "a4" 
  });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemEsquerda = 10;
  const margemDireita = 10;
  const larguraUtil = pageWidth - margemEsquerda - margemDireita;

  const adicionarCabecalho = () => {
    // Cabeçalho azul claro (paleta Prima Qualitá) - igual planilha consolidada
    doc.setFillColor(120, 190, 225);
    doc.rect(0, 0, pageWidth, 30, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('PLANILHA FINAL DE HABILITAÇÃO', pageWidth / 2, 12, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`PROCESSO ${processo.numero}`, pageWidth / 2, 18, { align: 'center' });
  };

  // Primeira página - adicionar cabeçalho
  adicionarCabecalho();

  let yPosition = 40; // Posição após a faixa azul

  // OBJETO (abaixo da faixa azul)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const textoObjeto = 'Objeto:';
  doc.text(textoObjeto, margemEsquerda, yPosition);
  
  const objetoDecodificado = decodeHtmlEntities(processo.objeto).replace(/<\/?p>/g, '');
  doc.setFont('helvetica', 'normal');
  
  const larguraObjeto = doc.getTextWidth(textoObjeto);
  const larguraPrimeiraLinha = larguraUtil - larguraObjeto - 2;
  const linhasPrimeiraLinha = doc.splitTextToSize(objetoDecodificado, larguraPrimeiraLinha);
  justificarTexto(doc, linhasPrimeiraLinha[0], margemEsquerda + larguraObjeto + 2, yPosition, larguraPrimeiraLinha);
  
  yPosition += 5;
  const textoRestante = objetoDecodificado.substring(linhasPrimeiraLinha[0].length).trim();
  if (textoRestante) {
    const linhasRestantes = doc.splitTextToSize(textoRestante, larguraUtil);
    linhasRestantes.forEach((linha: string) => {
      justificarTexto(doc, linha, margemEsquerda, yPosition, larguraUtil);
      yPosition += 5;
    });
  }
  
  yPosition += 3;

  // Cotação
  doc.setFont('helvetica', 'bold');
  doc.text('Cotação:', margemEsquerda, yPosition);
  doc.setFont('helvetica', 'normal');
  doc.text(`  ${cotacao.titulo_cotacao}`, margemEsquerda + doc.getTextWidth('Cotação:'), yPosition);
  yPosition += 8;

  // Legenda
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(255, 0, 0);
  doc.text("■ Vermelho = Empresa/Item Inabilitado", margemEsquerda, yPosition);
  doc.setTextColor(0, 0, 0);
  yPosition += 8;

  // Construir colunas da tabela
  const colunas: any[] = [
    { header: "Item", dataKey: "item" },
    { header: "Descrição", dataKey: "descricao" },
    { header: "Qtd", dataKey: "quantidade" },
    { header: "Unid", dataKey: "unidade" }
  ];

  // Adicionar colunas por fornecedor
  respostas.forEach((resposta, idx) => {
    const nomeAbreviado = resposta.fornecedor.razao_social.substring(0, 20);
    colunas.push({
      header: `${nomeAbreviado}${resposta.rejeitado ? ' (INAB.)' : ''}`,
      dataKey: `fornecedor_${idx}`
    });
  });

  // Adicionar colunas de vencedor no final
  colunas.push({ header: "Valor Vencedor", dataKey: "valor_vencedor" });
  colunas.push({ header: "Empresa Vencedora", dataKey: "empresa_vencedora" });

  // Construir dados da tabela
  const dados: any[] = [];
  const isDesconto = criterioJulgamento === "desconto" || criterioJulgamento === "maior_percentual_desconto";

  // Função para encontrar vencedor de um item
  const encontrarVencedor = (numeroItem: number): { valor: number | null; empresa: string } => {
    let melhorValor: number | null = null;
    let empresaVencedora = "-";

    respostas.forEach((resposta) => {
      // Ignorar fornecedores totalmente rejeitados ou rejeitados neste item
      if (resposta.rejeitado || resposta.itens_rejeitados.includes(numeroItem)) {
        return;
      }

      const itemResposta = resposta.itens.find(i => i.numero_item === numeroItem);
      if (itemResposta) {
        const valor = isDesconto 
          ? (itemResposta.percentual_desconto || itemResposta.valor_unitario_ofertado)
          : itemResposta.valor_unitario_ofertado;

        if (melhorValor === null) {
          melhorValor = valor;
          empresaVencedora = resposta.fornecedor.razao_social;
        } else {
          // Para desconto, maior é melhor; para preço, menor é melhor
          if (isDesconto) {
            if (valor > melhorValor) {
              melhorValor = valor;
              empresaVencedora = resposta.fornecedor.razao_social;
            }
          } else {
            if (valor < melhorValor) {
              melhorValor = valor;
              empresaVencedora = resposta.fornecedor.razao_social;
            }
          }
        }
      }
    });

    return { valor: melhorValor, empresa: empresaVencedora };
  };

  // Totais por fornecedor e vencedor
  const totaisPorFornecedor: number[] = new Array(respostas.length).fill(0);
  let totalVencedor = 0;

  itens.forEach((item) => {
    const linha: any = {
      item: item.numero_item,
      descricao: decodeHtmlEntities(item.descricao),
      quantidade: item.quantidade,
      unidade: item.unidade
    };

    respostas.forEach((resposta, idx) => {
      const itemResposta = resposta.itens.find(i => i.numero_item === item.numero_item);
      if (itemResposta) {
        if (isDesconto) {
          linha[`fornecedor_${idx}`] = formatarPercentual(itemResposta.percentual_desconto || itemResposta.valor_unitario_ofertado);
        } else {
          const valorUnitario = itemResposta.valor_unitario_ofertado;
          const valorTotal = valorUnitario * item.quantidade;
          linha[`fornecedor_${idx}`] = `${formatarMoeda(valorUnitario)}\n(Total: ${formatarMoeda(valorTotal)})`;
          totaisPorFornecedor[idx] += valorTotal;
        }
      } else {
        linha[`fornecedor_${idx}`] = "-";
      }
    });

    // Adicionar dados do vencedor
    const vencedor = encontrarVencedor(item.numero_item);
    if (vencedor.valor !== null) {
      if (isDesconto) {
        linha.valor_vencedor = formatarPercentual(vencedor.valor);
        linha.empresa_vencedora = vencedor.empresa.substring(0, 25);
      } else {
        const valorTotalVencedor = vencedor.valor * item.quantidade;
        linha.valor_vencedor = `${formatarMoeda(vencedor.valor)}\n(Total: ${formatarMoeda(valorTotalVencedor)})`;
        linha.empresa_vencedora = vencedor.empresa.substring(0, 25);
        totalVencedor += valorTotalVencedor;
      }
    } else {
      linha.valor_vencedor = "-";
      linha.empresa_vencedora = "-";
    }

    dados.push(linha);
  });

  // Adicionar linha de VALOR TOTAL apenas se NÃO for critério de desconto
  if (!isDesconto) {
    const linhaTotalGeral: any = {
      item: 'VALOR TOTAL',
      descricao: '',
      quantidade: '',
      unidade: ''
    };

    respostas.forEach((_, idx) => {
      linhaTotalGeral[`fornecedor_${idx}`] = formatarMoeda(totaisPorFornecedor[idx]);
    });

    linhaTotalGeral.valor_vencedor = formatarMoeda(totalVencedor);
    linhaTotalGeral.empresa_vencedora = '';

    dados.push(linhaTotalGeral);
  }

  // Gerar tabela
  autoTable(doc, {
    columns: colunas,
    body: dados,
    startY: yPosition,
    margin: { left: margemEsquerda, right: margemDireita },
    styles: {
      fontSize: 7,
      cellPadding: 2,
      overflow: 'linebreak',
      halign: 'center',
      valign: 'middle'
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      overflow: 'linebreak',
      cellPadding: 1,
      minCellHeight: 8
    },
    columnStyles: {
      item: { cellWidth: 12, halign: 'center' },
      descricao: { cellWidth: 50, halign: 'left' },
      quantidade: { cellWidth: 12, halign: 'center' },
      unidade: { cellWidth: 12, halign: 'center' },
      valor_vencedor: { cellWidth: 25, halign: 'center', fontStyle: 'bold' },
      empresa_vencedora: { cellWidth: 35, halign: 'center', fontStyle: 'bold' }
    },
    didParseCell: (data) => {
      const isLinhaTotal = !isDesconto && data.row.index === dados.length - 1;
      
      // Destacar linha de totais
      if (isLinhaTotal) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8;
        
        // Mesclar as 4 primeiras colunas na linha de total
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          data.cell.text = [''];
        }
      }
      
      // Marcar empresas/itens inabilitados em vermelho (exceto linha de total)
      if (!isLinhaTotal && data.section === 'body' && data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
        const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
        const resposta = respostas[fornecedorIdx];
        const numeroItem = dados[data.row.index]?.item;
        
        // Verificar se fornecedor está totalmente inabilitado ou item específico
        if (resposta && (resposta.rejeitado || resposta.itens_rejeitados.includes(numeroItem))) {
          data.cell.styles.textColor = [255, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      
      // Destacar colunas de vencedor em verde (exceto linha de total)
      if (!isLinhaTotal && data.section === 'body' && data.column.dataKey && 
          (data.column.dataKey === 'valor_vencedor' || data.column.dataKey === 'empresa_vencedora')) {
        data.cell.styles.textColor = [0, 100, 0];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (data) => {
      // Cabeçalho de fornecedor inabilitado também em vermelho
      if (data.section === 'head' && data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
        const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
        const resposta = respostas[fornecedorIdx];
        
        if (resposta && resposta.rejeitado) {
          // Redesenhar o cabeçalho em vermelho
          doc.setFillColor(180, 0, 0);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(7);
          doc.setFont("helvetica", "bold");
          const text = data.cell.text.join(' ');
          doc.text(text, data.cell.x + data.cell.width / 2, data.cell.y + data.cell.height / 2 + 1, { align: 'center' });
        }
      }
    },
    didDrawPage: (data) => {
      // Adicionar cabeçalho em novas páginas
      if (data.pageNumber > 1) {
        adicionarCabecalho();
      }
    }
  });

  // Seção de empresas inabilitadas com motivos
  const empresasInabilitadas = respostas.filter(r => r.rejeitado || r.itens_rejeitados.length > 0);
  
  if (empresasInabilitadas.length > 0) {
    let currentY = (doc as any).lastAutoTable.finalY + 10;
    
    if (currentY > pageHeight - 60) {
      doc.addPage();
      adicionarCabecalho();
      currentY = 40;
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 0, 0);
    doc.text("EMPRESAS INABILITADAS", margemEsquerda, currentY);
    doc.setTextColor(0, 0, 0);
    currentY += 6;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    empresasInabilitadas.forEach((empresa) => {
      if (currentY > pageHeight - 40) {
        doc.addPage();
        adicionarCabecalho();
        currentY = 40;
      }

      doc.setFont("helvetica", "bold");
      doc.text(`• ${empresa.fornecedor.razao_social}`, margemEsquerda, currentY);
      doc.setFont("helvetica", "normal");
      currentY += 5;
      
      doc.text(`  CNPJ: ${formatarCNPJ(empresa.fornecedor.cnpj)}`, margemEsquerda, currentY);
      currentY += 5;

      if (empresa.rejeitado) {
        doc.text(`  Status: Inabilitado totalmente`, margemEsquerda, currentY);
        currentY += 5;
      } else if (empresa.itens_rejeitados.length > 0) {
        doc.text(`  Status: Inabilitado nos itens: ${empresa.itens_rejeitados.join(', ')}`, margemEsquerda, currentY);
        currentY += 5;
      }

      if (empresa.motivo_rejeicao) {
        const motivoLinhas = doc.splitTextToSize(`  Motivo: ${empresa.motivo_rejeicao}`, larguraUtil - 10);
        doc.text(motivoLinhas, margemEsquerda, currentY);
        currentY += motivoLinhas.length * 4 + 2;
      }

      currentY += 3;
    });
  }

  // Certificação Digital com quadro estilizado
  let certY = (doc as any).lastAutoTable?.finalY || 150;
  if (empresasInabilitadas.length > 0) {
    certY = doc.internal.pageSize.getHeight() - 55;
  } else {
    certY += 15;
  }
  
  if (certY > pageHeight - 50) {
    doc.addPage();
    adicionarCabecalho();
    certY = 40;
  }

  // Quadro de certificação
  doc.setFillColor(245, 245, 245);
  doc.rect(margemEsquerda, certY, larguraUtil, 35, 'F');
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margemEsquerda, certY, larguraUtil, 35, 'S');

  certY += 6;
  doc.setFontSize(10);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(0, 0, 139);
  doc.text("CERTIFICAÇÃO DIGITAL", pageWidth / 2, certY, { align: 'center' });
  
  certY += 6;
  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(0, 0, 0);

  doc.text(`Protocolo:  ${dadosProtocolo.protocolo}`, margemEsquerda + 3, certY);
  certY += 5;
  doc.text(`Responsável:  ${dadosProtocolo.usuario.nome_completo}`, margemEsquerda + 3, certY);
  certY += 5;
  
  const baseUrl = window.location.origin;
  const linkVerificacao = `${baseUrl}/verificar-planilha?protocolo=${dadosProtocolo.protocolo}`;
  doc.text(`Verificação:  ${linkVerificacao}`, margemEsquerda + 3, certY);

  // Gerar blob
  const blob = doc.output("blob");
  const storagePath = `planilhas-habilitacao/${processo.numero.replace(/\//g, '-')}_habilitacao_${Date.now()}.pdf`;

  return { blob, storagePath };
}

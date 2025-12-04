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
    percentual_desconto?: number;
    marca?: string;
    lote_numero?: number;
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

const formatarPercentual = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  }) + '%';
};

const formatarCNPJ = (cnpj: string): string => {
  return cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5");
};

// Função para converter número para romano
const converterNumeroRomano = (num: number): string => {
  const romanos = [
    { valor: 1000, numeral: 'M' },
    { valor: 900, numeral: 'CM' },
    { valor: 500, numeral: 'D' },
    { valor: 400, numeral: 'CD' },
    { valor: 100, numeral: 'C' },
    { valor: 90, numeral: 'XC' },
    { valor: 50, numeral: 'L' },
    { valor: 40, numeral: 'XL' },
    { valor: 10, numeral: 'X' },
    { valor: 9, numeral: 'IX' },
    { valor: 5, numeral: 'V' },
    { valor: 4, numeral: 'IV' },
    { valor: 1, numeral: 'I' }
  ];
  let resultado = '';
  let numero = num;
  for (const { valor, numeral } of romanos) {
    while (numero >= valor) {
      resultado += numeral;
      numero -= valor;
    }
  }
  return resultado;
};

const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
};

// Função para sanitizar texto - remove/substitui caracteres especiais que jsPDF não renderiza bem
const sanitizarTexto = (texto: string): string => {
  if (!texto) return '';
  
  return texto
    .replace(/²/g, '2')      // Superscript 2
    .replace(/₂/g, '2')      // Subscript 2 (SpO₂)
    .replace(/³/g, '3')      // Superscript 3
    .replace(/₃/g, '3')      // Subscript 3
    .replace(/¹/g, '1')      // Superscript 1
    .replace(/₁/g, '1')      // Subscript 1
    .replace(/⁰/g, '0').replace(/₀/g, '0')
    .replace(/⁴/g, '4').replace(/₄/g, '4')
    .replace(/⁵/g, '5').replace(/₅/g, '5')
    .replace(/⁶/g, '6').replace(/₆/g, '6')
    .replace(/⁷/g, '7').replace(/₇/g, '7')
    .replace(/⁸/g, '8').replace(/₈/g, '8')
    .replace(/⁹/g, '9').replace(/₉/g, '9')
    .replace(/°/g, 'o')      // Degree symbol
    .replace(/º/g, 'o')      // Ordinal masculine
    .replace(/ª/g, 'a')      // Ordinal feminine
    .replace(/µ/g, 'u')      // Micro
    .replace(/μ/g, 'u')      // Greek mu
    .replace(/–/g, '-')      // En dash
    .replace(/—/g, '-')      // Em dash
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/…/g, '...')    // Ellipsis
    .replace(/•/g, '-');     // Bullet
};

// Função para justificar texto manualmente no jsPDF
const justificarTexto = (doc: any, texto: string, x: number, y: number, larguraMaxima: number) => {
  const palavras = texto.trim().split(/\s+/);
  
  // Se só tem uma palavra, não justifica
  if (palavras.length === 1) {
    doc.text(texto, x, y);
    return;
  }
  
  // Calcular largura do texto sem espaços extras
  const textoSemEspacos = palavras.join('');
  const larguraTexto = doc.getTextWidth(textoSemEspacos);
  
  // Calcular espaço necessário para distribuir entre as palavras
  const espacoDisponivel = larguraMaxima - larguraTexto;
  const numEspacos = palavras.length - 1;
  const espacoPorPalavra = espacoDisponivel / numEspacos;
  
  // Renderizar cada palavra com espaçamento calculado
  let xAtual = x;
  palavras.forEach((palavra, index) => {
    doc.text(palavra, xAtual, y);
    xAtual += doc.getTextWidth(palavra) + espacoPorPalavra;
  });
};

// Função para calcular fontSize ideal para caber em uma linha
const calcularFontSizeParaCaber = (doc: any, texto: string, larguraCelula: number, fontSizeInicial: number, fontSizeMinimo: number = 6): number => {
  if (!texto || texto.trim() === '' || texto === '-') return fontSizeInicial;
  
  // Remover quebras de linha para medir texto contínuo
  const textoLimpo = texto.replace(/\n/g, ' ');
  
  let fontSize = fontSizeInicial;
  doc.setFontSize(fontSize);
  
  // Considerar padding da célula (aproximadamente 4mm total)
  const larguraDisponivel = larguraCelula - 4;
  
  while (fontSize > fontSizeMinimo) {
    doc.setFontSize(fontSize);
    const larguraTexto = doc.getTextWidth(textoLimpo);
    
    if (larguraTexto <= larguraDisponivel) {
      break;
    }
    fontSize -= 0.5;
  }
  
  return Math.max(fontSize, fontSizeMinimo);
};

export async function gerarPlanilhaConsolidadaPDF(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: RespostaFornecedor[],
  dadosProtocolo: DadosProtocolo,
  calculosPorItem: Record<number, 'menor' | 'media' | 'mediana'> = {},
  criterioJulgamento?: string
): Promise<{ blob: Blob; estimativas: Record<number, number> }> {
  const estimativasCalculadas: Record<number, number> = {};
  const doc = new jsPDF({ 
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4',
    compress: true,
    precision: 16
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margemEsquerda = 10;
  const margemDireita = 10;
  const larguraUtil = pageWidth - margemEsquerda - margemDireita;
  
  let y = 20;

  // Cabeçalho azul claro (paleta Prima Qualitá)
  doc.setFillColor(120, 190, 225); // Azul claro do logo
  doc.rect(0, 0, pageWidth, 30, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANILHA CONSOLIDADA DE PROPOSTAS', pageWidth / 2, 12, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`PROCESSO ${processo.numero}`, pageWidth / 2, 18, { align: 'center' });

  y = 40; // Posição após a faixa azul

  // OBJETO (abaixo da faixa azul, acima da cotação)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const textoObjeto = 'Objeto:';
  doc.text(textoObjeto, margemEsquerda, y);
  
  // Quebrar texto do objeto e aplicar justificação manual
  const objetoDecodificado = decodeHtmlEntities(processo.objeto).replace(/<\/?p>/g, '');
  doc.setFont('helvetica', 'normal');
  
  // Primeira linha ao lado de "Objeto:"
  const larguraObjeto = doc.getTextWidth(textoObjeto);
  const larguraPrimeiraLinha = larguraUtil - larguraObjeto - 2; // Espaço mínimo de 2mm
  const linhasPrimeiraLinha = doc.splitTextToSize(objetoDecodificado, larguraPrimeiraLinha);
  justificarTexto(doc, linhasPrimeiraLinha[0], margemEsquerda + larguraObjeto + 2, y, larguraPrimeiraLinha);
  
  // Demais linhas do objeto com largura total
  y += 5;
  const textoRestante = objetoDecodificado.substring(linhasPrimeiraLinha[0].length).trim();
  if (textoRestante) {
    const linhasRestantes = doc.splitTextToSize(textoRestante, larguraUtil);
    linhasRestantes.forEach((linha: string, index: number) => {
      // Justificar todas as linhas exceto a última
      if (index < linhasRestantes.length - 1) {
        justificarTexto(doc, linha, margemEsquerda, y, larguraUtil);
      } else {
        // Última linha alinhada à esquerda
        doc.text(linha, margemEsquerda, y);
      }
      y += 5;
    });
  }

  y += 5; // Espaço após o objeto

  // Informações da Cotação
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const textoCotacao = 'Cotação:';
  const textoData = 'Data de Geração:';
  
  doc.text(textoCotacao, margemEsquerda, y);
  doc.setFont('helvetica', 'normal');
  const larguraCotacao = doc.getTextWidth(textoCotacao);
  doc.text(cotacao.titulo_cotacao, margemEsquerda + larguraCotacao + 2, y);
  
  y += 7; // Mais espaço entre as linhas
  doc.setFont('helvetica', 'bold');
  doc.text(textoData, margemEsquerda, y);
  doc.setFont('helvetica', 'normal');
  const larguraData = doc.getTextWidth(textoData);
  doc.text(new Date().toLocaleString('pt-BR'), margemEsquerda + larguraData + 2, y);

  y += 10; // Mais espaço antes da tabela

  // Preparar colunas da tabela
  const colunas: any[] = [
    { header: 'Item', dataKey: 'item', width: 12 },
    { header: 'Descrição', dataKey: 'descricao', width: 40 },
    { header: 'Qtd', dataKey: 'quantidade', width: 12 },
    { header: 'Unid.', dataKey: 'unidade', width: 15 }
  ];

  // Calcular largura disponível para fornecedores + estimativa (todas com mesma largura)
  const larguraFixa = 12 + 40 + 12 + 15; // Item + Descrição + Qtd + Unid
  const larguraDisponivel = larguraUtil - larguraFixa;
  const numColunasDinamicas = respostas.length + 1; // +1 para estimativa
  const larguraPorColuna = larguraDisponivel / numColunasDinamicas;

  // Adicionar colunas de fornecedores
  respostas.forEach((resposta) => {
    const razaoSocial = resposta.fornecedor.razao_social.toUpperCase();
    const cnpjFormatado = formatarCNPJ(resposta.fornecedor.cnpj);
    const email = resposta.fornecedor.email || '';
    
    const headerText = `${razaoSocial}\nCNPJ: ${cnpjFormatado}\n${email}`;
    
    colunas.push({
      header: headerText,
      dataKey: `fornecedor_${resposta.fornecedor.cnpj}`,
      width: larguraPorColuna
    });
  });

  // Adicionar coluna Estimativa com mesma largura
  colunas.push({
    header: 'Estimativa',
    dataKey: 'estimativa',
    width: larguraPorColuna
  });

  // Preparar linhas de dados
  const linhas: any[] = [];
  const totaisPorFornecedor: { [cnpj: string]: number } = {};
  let totalGeralEstimativa = 0;
  
  // Inicializar totais
  respostas.forEach(resposta => {
    totaisPorFornecedor[resposta.fornecedor.cnpj] = 0;
  });
  
  console.log('🔄 Iniciando loop de itens...');
  
  // Agrupar itens por lote
  const itensComLote = itens.filter(item => item.lote_numero && item.lote_numero > 0);
  const itensSemLote = itens.filter(item => !item.lote_numero || item.lote_numero <= 0);
  const temLotes = itensComLote.length > 0;
  
  // Se tem lotes, organizar por lote
  const lotesMap = new Map<number, { descricao: string, itens: typeof itens }>();
  if (temLotes) {
    itensComLote.forEach(item => {
      if (!lotesMap.has(item.lote_numero!)) {
        lotesMap.set(item.lote_numero!, { descricao: item.lote_descricao || `Lote ${item.lote_numero}`, itens: [] });
      }
      lotesMap.get(item.lote_numero!)!.itens.push(item);
    });
  }
  
  // Totais por lote para subtotais
  const totaisPorLote: Map<number, { fornecedores: { [cnpj: string]: number }, estimativa: number }> = new Map();
  
  // Função para processar um item e retornar a linha
  const processarItem = (item: ItemCotacao) => {
    console.log(`🔄 Processando item ${item.numero_item}...`);
    const linha: any = {
      item: item.numero_item.toString(),
      descricao: sanitizarTexto(item.descricao),
      quantidade: item.quantidade.toLocaleString('pt-BR'),
      unidade: sanitizarTexto(item.unidade)
    };

    const valoresItem: number[] = [];

    respostas.forEach((resposta) => {
      // Match por numero_item E lote_numero para evitar confusão entre itens de lotes diferentes
      const respostaItem = resposta.itens.find(i => 
        i.numero_item === item.numero_item && 
        (item.lote_numero ? i.lote_numero === item.lote_numero : !i.lote_numero)
      );
      if (respostaItem) {
        const percentualDesconto = respostaItem.percentual_desconto;
        const valorUnitario = respostaItem.valor_unitario_ofertado;
        
        const valorParaCalculo = criterioJulgamento === 'desconto' 
          ? (typeof percentualDesconto === 'number' ? percentualDesconto : 0)
          : (typeof valorUnitario === 'number' ? valorUnitario : 0);
        
        const valorTotal = (typeof valorUnitario === 'number' ? valorUnitario : 0) * item.quantidade;
        
        if (criterioJulgamento === 'desconto') {
          linha[`fornecedor_${resposta.fornecedor.cnpj}`] = valorParaCalculo > 0 ? formatarPercentual(valorParaCalculo) : '-';
        } else {
          linha[`fornecedor_${resposta.fornecedor.cnpj}`] = `${formatarMoeda(valorParaCalculo)}\n(Total: ${formatarMoeda(valorTotal)})`;
        }
        
        totaisPorFornecedor[resposta.fornecedor.cnpj] += valorTotal;
        
        // Acumular para subtotal do lote
        if (item.lote_numero) {
          if (!totaisPorLote.has(item.lote_numero)) {
            totaisPorLote.set(item.lote_numero, { fornecedores: {}, estimativa: 0 });
          }
          const loteData = totaisPorLote.get(item.lote_numero)!;
          loteData.fornecedores[resposta.fornecedor.cnpj] = (loteData.fornecedores[resposta.fornecedor.cnpj] || 0) + valorTotal;
        }
        
        valoresItem.push(valorParaCalculo);
      } else {
        linha[`fornecedor_${resposta.fornecedor.cnpj}`] = '-';
      }
    });

    // Calcular estimativa
    if (valoresItem.length > 0) {
      const criterioItem = calculosPorItem[item.numero_item] || 'menor';
      let valorEstimativa: number;
      
      if (criterioItem === 'menor') {
        if (criterioJulgamento === 'desconto') {
          valorEstimativa = Math.max(...valoresItem);
        } else {
          valorEstimativa = Math.min(...valoresItem);
        }
      } else if (criterioItem === 'media') {
        const valoresCotados = valoresItem.filter(v => v > 0);
        valorEstimativa = valoresCotados.length > 0 
          ? valoresCotados.reduce((a, b) => a + b, 0) / valoresCotados.length 
          : 0;
      } else {
        const valoresCotados = valoresItem.filter(v => v > 0);
        if (valoresCotados.length > 0) {
          const sorted = [...valoresCotados].sort((a, b) => a - b);
          const middle = Math.floor(sorted.length / 2);
          valorEstimativa = sorted.length % 2 === 0 
            ? (sorted[middle - 1] + sorted[middle]) / 2 
            : sorted[middle];
        } else {
          valorEstimativa = 0;
        }
      }
      
      const valorTotalEstimativa = valorEstimativa * item.quantidade;
      estimativasCalculadas[item.numero_item] = valorEstimativa;
      
      if (criterioJulgamento === 'desconto') {
        linha.estimativa = formatarPercentual(valorEstimativa);
      } else {
        linha.estimativa = `${formatarMoeda(valorEstimativa)}\n(Total: ${formatarMoeda(valorTotalEstimativa)})`;
      }
      
      totalGeralEstimativa += valorTotalEstimativa;
      
      // Acumular para subtotal do lote
      if (item.lote_numero && totaisPorLote.has(item.lote_numero)) {
        totaisPorLote.get(item.lote_numero)!.estimativa += valorTotalEstimativa;
      }
    } else {
      linha.estimativa = '-';
      estimativasCalculadas[item.numero_item] = 0;
    }

    return linha;
  };
  
  // Se tem lotes, processar por lote com cabeçalhos e subtotais
  if (temLotes) {
    const lotesOrdenados = Array.from(lotesMap.entries()).sort((a, b) => a[0] - b[0]);
    
    lotesOrdenados.forEach(([loteNum, loteData]) => {
      // Adicionar linha de cabeçalho do lote - TEXTO EM "item" para colSpan funcionar
      const textoLote = `LOTE ${converterNumeroRomano(loteNum)} - ${loteData.descricao}`;
      const linhaHeaderLote: any = {
        item: textoLote, // Texto aqui porque colSpan é aplicado na coluna 0
        descricao: '',
        quantidade: '',
        unidade: '',
        isLoteHeader: true
      };
      respostas.forEach(r => { linhaHeaderLote[`fornecedor_${r.fornecedor.cnpj}`] = ''; });
      linhaHeaderLote.estimativa = '';
      linhas.push(linhaHeaderLote);
      
      // Processar itens do lote
      loteData.itens.sort((a, b) => a.numero_item - b.numero_item).forEach(item => {
        linhas.push(processarItem(item));
      });
      
      // Adicionar linha de subtotal do lote (apenas se NÃO for critério de desconto)
      if (criterioJulgamento !== 'desconto') {
        const textoSubtotal = `SUBTOTAL LOTE ${converterNumeroRomano(loteNum)}`;
        const linhaSubtotal: any = {
          item: textoSubtotal, // Texto aqui porque colSpan mescla as 4 primeiras colunas
          descricao: '',
          quantidade: '',
          unidade: '',
          isSubtotal: true
        };
        
        const loteSubtotais = totaisPorLote.get(loteNum);
        respostas.forEach(r => {
          const valorLote = loteSubtotais?.fornecedores[r.fornecedor.cnpj] || 0;
          linhaSubtotal[`fornecedor_${r.fornecedor.cnpj}`] = formatarMoeda(valorLote);
        });
        linhaSubtotal.estimativa = formatarMoeda(loteSubtotais?.estimativa || 0);
        linhas.push(linhaSubtotal);
      }
    });
  } else {
    // Processar itens normalmente sem agrupamento
    itens.forEach(item => {
      linhas.push(processarItem(item));
    });
  }
  
  console.log('✅ Todos os itens processados!');
  console.log('📊 Estimativas finais calculadas:', estimativasCalculadas);

  // Adicionar linha de TOTAL GERAL apenas se NÃO for critério de desconto
  if (criterioJulgamento !== 'desconto') {
    const linhaTotalGeral: any = {
      item: 'VALOR TOTAL',
      descricao: '',
      quantidade: '',
      unidade: ''
    };

    respostas.forEach((resposta) => {
      linhaTotalGeral[`fornecedor_${resposta.fornecedor.cnpj}`] = formatarMoeda(totaisPorFornecedor[resposta.fornecedor.cnpj]);
    });

    linhaTotalGeral.estimativa = formatarMoeda(totalGeralEstimativa);

    linhas.push(linhaTotalGeral);
  }

  // Armazenar textos de descrição para desenho customizado
  const descricoesPorLinha: Map<number, string> = new Map();
  
  // Gerar tabela
  autoTable(doc, {
    startY: y,
    head: [colunas.map(c => c.header)],
    body: linhas.map(linha => colunas.map(col => linha[col.dataKey] || '')),
    theme: 'grid',
    rowPageBreak: 'avoid', // Evitar quebra de linha entre páginas
    styles: {
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [120, 190, 225], // Azul claro do logo (paleta Prima Qualitá)
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 8,
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
      cellPadding: 2,
      minCellHeight: 15
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [0, 0, 0],
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
      cellPadding: { top: 3, right: 2, bottom: 3, left: 2 },
      halign: 'center',
      valign: 'middle',
      minCellHeight: 10,
      overflow: 'linebreak',
      cellWidth: 'wrap'
    },
    alternateRowStyles: {
      fillColor: [207, 238, 247] // Azul claro (paleta Prima Qualitá)
    },
    columnStyles: (() => {
      const styles: any = {
        0: { halign: 'center', cellWidth: 12 },
        1: { 
          halign: 'left', 
          cellWidth: 40,
          overflow: 'linebreak',
          cellPadding: { top: 3, right: 3, bottom: 3, left: 3 }
        },
        2: { 
          halign: 'center', 
          cellWidth: 12,
          overflow: 'visible' // Evitar quebra de linha nos números
        },
        3: { halign: 'center', cellWidth: 15 }
      };
      
      // Definir largura igual para todas as colunas de fornecedores e estimativa
      for (let i = 4; i < colunas.length; i++) {
        styles[i] = { halign: 'center', cellWidth: larguraPorColuna };
      }
      
      return styles;
    })(),
    margin: { left: margemEsquerda, right: margemDireita },
    tableWidth: 'auto',
    didParseCell: function(data) {
      // IGNORAR cabeçalho da tabela (head) - só formatar o corpo (body)
      if (data.section === 'head') {
        // Manter estilos padrão do cabeçalho (azul claro com texto branco)
        return;
      }
      
      // Garantir que todo texto seja preto por padrão no corpo
      data.cell.styles.textColor = [0, 0, 0];
      
      const linhaAtual = linhas[data.row.index];
      
      // Formatar linha de cabeçalho de lote (fundo azul médio, texto branco, mesclada)
      if (linhaAtual && linhaAtual.isLoteHeader) {
        data.cell.styles.fillColor = [70, 130, 180]; // Azul médio
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9;
        
        // Mesclar todas as colunas para o cabeçalho do lote - texto vem da coluna 0
        if (data.column.index === 0) {
          data.cell.colSpan = colunas.length;
          data.cell.styles.halign = 'center';
        } else {
          // Limpar texto das outras colunas (já mescladas)
          data.cell.text = [''];
        }
        return;
      }
      
      // Formatar linha de subtotal do lote (fundo cinza claro, negrito)
      if (linhaAtual && linhaAtual.isSubtotal) {
        data.cell.styles.fillColor = [230, 230, 230];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 8;
        
        // Mesclar as 4 primeiras colunas na linha de subtotal - texto vem da coluna 0
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
          data.cell.styles.cellPadding = { top: 3, right: 2, bottom: 3, left: 5 };
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          // Limpar texto das colunas 1-3 (já mescladas)
          data.cell.text = [''];
        } else if (data.column.index >= 4) {
          // Ajustar fonte nas colunas de valores do subtotal
          const texto = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : data.cell.text;
          if (texto && texto !== '-') {
            const larguraCelula = data.cell.width || larguraPorColuna;
            const fontSizeIdeal = calcularFontSizeParaCaber(doc, texto, larguraCelula, 8, 6);
            data.cell.styles.fontSize = fontSizeIdeal;
          }
        }
        return;
      }
      
      // Destacar linha de VALOR TOTAL GERAL (última linha se não for desconto)
      if (criterioJulgamento !== 'desconto' && data.row.index === linhas.length - 1) {
        data.cell.styles.fillColor = [180, 180, 180]; // Cinza mais escuro que subtotal
        data.cell.styles.textColor = [0, 0, 0];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9;
        
        // Mesclar as 4 primeiras colunas na linha de total - texto vem da coluna 0
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
          data.cell.styles.cellPadding = { top: 3, right: 2, bottom: 3, left: 5 };
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          // Limpar texto das colunas 1-3 (já mescladas)
          data.cell.text = [''];
        } else if (data.column.index >= 4) {
          // Ajustar fonte nas colunas de valores do total geral
          const texto = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : data.cell.text;
          if (texto && texto !== '-') {
            const larguraCelula = data.cell.width || larguraPorColuna;
            const fontSizeIdeal = calcularFontSizeParaCaber(doc, texto, larguraCelula, 9, 6);
            data.cell.styles.fontSize = fontSizeIdeal;
          }
        }
        return;
      }
      
      // Para coluna de descrição (índice 1) em linhas normais, armazenar texto para desenho customizado
      // NÃO limpar o texto - deixar autoTable calcular altura correta
      if (data.column.index === 1 && !linhaAtual?.isLoteHeader && !linhaAtual?.isSubtotal) {
        const textoOriginal = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '');
        if (textoOriginal && textoOriginal.trim()) {
          descricoesPorLinha.set(data.row.index, textoOriginal);
        }
      }
      
      // Ajuste automático de fonte para colunas de valores monetários
      // Aplica para colunas de fornecedores (índice >= 4) e estimativa
      if (data.column.index >= 4 && !linhaAtual?.isLoteHeader) {
        const texto = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : data.cell.text;
        if (texto && texto !== '-') {
          const larguraCelula = data.cell.width || larguraPorColuna;
          const fontSizeAtual = data.cell.styles.fontSize || 8;
          const fontSizeIdeal = calcularFontSizeParaCaber(doc, texto, larguraCelula, fontSizeAtual, 6);
          data.cell.styles.fontSize = fontSizeIdeal;
        }
      }
    },
    willDrawCell: function(data) {
      // Apenas para corpo da tabela - coluna de descrição
      if (data.section !== 'body') return;
      if (data.column.index !== 1) return;
      
      const linhaAtual = linhas[data.row.index];
      if (linhaAtual?.isLoteHeader || linhaAtual?.isSubtotal) return;
      if (criterioJulgamento !== 'desconto' && data.row.index === linhas.length - 1) return;
      
      // Verificar se temos texto para justificar
      if (!descricoesPorLinha.has(data.row.index)) return;
      
      // Impedir o desenho padrão do texto - vamos desenhar manualmente no didDrawCell
      data.cell.text = [''];
    },
    didDrawCell: function(data) {
      // Apenas para corpo da tabela
      if (data.section !== 'body') return;
      
      const linhaAtual = linhas[data.row.index];
      
      // Pular linhas especiais
      if (linhaAtual?.isLoteHeader || linhaAtual?.isSubtotal) return;
      if (criterioJulgamento !== 'desconto' && data.row.index === linhas.length - 1) return;
      
      // Desenhar texto justificado apenas na coluna de descrição (índice 1)
      if (data.column.index === 1) {
        const textoOriginal = descricoesPorLinha.get(data.row.index);
        if (!textoOriginal) return;
        
        const cell = data.cell;
        const padding = 3;
        const x = cell.x + padding;
        const larguraDisponivel = cell.width - (padding * 2);
        const alturaLinha = 3.5; // Linha mais compacta
        
        // Configurar fonte
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        // Quebrar texto em linhas
        const linhasTexto = doc.splitTextToSize(textoOriginal, larguraDisponivel);
        
        // Calcular posição Y inicial
        const alturaTextoTotal = linhasTexto.length * alturaLinha;
        const espacoVertical = cell.height - (padding * 2);
        let yInicio = cell.y + padding + alturaLinha;
        
        // Centralizar verticalmente se possível
        if (alturaTextoTotal < espacoVertical) {
          yInicio = cell.y + (cell.height - alturaTextoTotal) / 2 + alturaLinha;
        }
        
        // Desenhar cada linha dentro dos limites da célula
        linhasTexto.forEach((linha: string, index: number) => {
          const yLinha = yInicio + (index * alturaLinha);
          
          // Verificar se a linha está dentro dos limites da célula
          if (yLinha > cell.y + cell.height - 1) return;
          
          const palavras = linha.trim().split(/\s+/);
          
          // Se é a última linha ou só tem uma palavra, alinhar à esquerda
          if (index === linhasTexto.length - 1 || palavras.length <= 1) {
            doc.text(linha, x, yLinha);
          } else {
            // Justificar a linha - limitar espaçamento máximo para não esticar demais
            const textoSemEspacos = palavras.join('');
            const larguraTexto = doc.getTextWidth(textoSemEspacos);
            const espacoDisponivel = larguraDisponivel - larguraTexto;
            const numEspacos = palavras.length - 1;
            let espacoPorPalavra = numEspacos > 0 ? espacoDisponivel / numEspacos : 0;
            
            // Limitar espaçamento máximo a 3x o espaço normal para não esticar demais
            const espacoNormal = doc.getTextWidth(' ');
            const espacoMaximo = espacoNormal * 3;
            
            if (espacoPorPalavra > espacoMaximo) {
              // Se o espaço seria muito grande, usar alinhamento à esquerda
              doc.text(linha, x, yLinha);
            } else {
              let xAtual = x;
              palavras.forEach((palavra, i) => {
                doc.text(palavra, xAtual, yLinha);
                xAtual += doc.getTextWidth(palavra) + espacoPorPalavra;
              });
            }
          }
        });
      }
    }
  });

  // Pegar posição Y após a tabela
  const finalY = (doc as any).lastAutoTable.finalY;

  // Verificar se precisa de nova página para certificação
  let y2 = finalY + 10;
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

  // Certificação digital
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

  console.log('✅ PDF gerado completamente');
  console.log('📊 Estimativas calculadas no PDF:', estimativasCalculadas);
  console.log('🎯 Retornando blob e estimativas...');
  
  const resultado = { blob: doc.output('blob'), estimativas: estimativasCalculadas };
  console.log('🎯 Resultado preparado:', { temBlob: !!resultado.blob, temEstimativas: !!resultado.estimativas, tamanhoEstimativas: Object.keys(resultado.estimativas).length });
  
  return resultado;
}

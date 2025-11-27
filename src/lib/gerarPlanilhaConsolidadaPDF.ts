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

const decodeHtmlEntities = (text: string): string => {
  const textarea = document.createElement('textarea');
  textarea.innerHTML = text;
  return textarea.value;
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
  itens.forEach(item => {
    console.log(`🔄 Processando item ${item.numero_item}...`);
    const linha: any = {
      item: item.numero_item.toString(),
      descricao: item.descricao,
      quantidade: item.quantidade.toLocaleString('pt-BR'), // Formatar número com separador de milhares
      unidade: item.unidade
    };

    const valoresItem: number[] = [];

    respostas.forEach((resposta) => {
      const respostaItem = resposta.itens.find(i => i.numero_item === item.numero_item);
      if (respostaItem) {
        // Se critério é desconto, usar percentual_desconto; senão, usar valor_unitario_ofertado
        const percentualDesconto = respostaItem.percentual_desconto;
        const valorUnitario = respostaItem.valor_unitario_ofertado;
        
        const valorParaCalculo = criterioJulgamento === 'desconto' 
          ? (typeof percentualDesconto === 'number' ? percentualDesconto : 0)
          : (typeof valorUnitario === 'number' ? valorUnitario : 0);
        
        const valorTotal = (typeof valorUnitario === 'number' ? valorUnitario : 0) * item.quantidade;
        
        console.log(`📊 Item ${item.numero_item} - Fornecedor ${resposta.fornecedor.cnpj}: percentual=${percentualDesconto}, valorUnit=${valorUnitario}, criterio=${criterioJulgamento}, usado=${valorParaCalculo}`);
        
        // Se critério é desconto, mostrar percentual ou "-" se zero
        if (criterioJulgamento === 'desconto') {
          linha[`fornecedor_${resposta.fornecedor.cnpj}`] = valorParaCalculo > 0 ? formatarPercentual(valorParaCalculo) : '-';
        } else {
          // Mostrar valor unitário na primeira linha e total na segunda
          linha[`fornecedor_${resposta.fornecedor.cnpj}`] = `${formatarMoeda(valorParaCalculo)}\n(Total: ${formatarMoeda(valorTotal)})`;
        }
        
        totaisPorFornecedor[resposta.fornecedor.cnpj] += valorTotal;
        valoresItem.push(valorParaCalculo);
      } else {
        linha[`fornecedor_${resposta.fornecedor.cnpj}`] = '-';
      }
    });

    // Calcular estimativa baseado no critério específico do item
    if (valoresItem.length > 0) {
      // Buscar critério específico deste item, ou usar 'menor' como padrão
      const criterioItem = calculosPorItem[item.numero_item] || 'menor';
      
      console.log(`📐 Item ${item.numero_item}: critério=${criterioItem}, valores=[${valoresItem.join(', ')}]`);
      
      let valorEstimativa: number;
      
      if (criterioItem === 'menor') {
        // Se critério é desconto, pegar o MAIOR desconto (quanto maior desconto, menor o preço)
        if (criterioJulgamento === 'desconto') {
          valorEstimativa = Math.max(...valoresItem);
          console.log(`   → Maior desconto: ${valorEstimativa}%`);
        } else {
          valorEstimativa = Math.min(...valoresItem);
          console.log(`   → Menor preço: ${valorEstimativa}`);
        }
      } else if (criterioItem === 'media') {
        // Filtrar apenas valores verdadeiramente cotados (> 0) para média
        const valoresCotados = valoresItem.filter(v => v > 0);
        if (valoresCotados.length > 0) {
          valorEstimativa = valoresCotados.reduce((a, b) => a + b, 0) / valoresCotados.length;
          console.log(`   → Média: ${valorEstimativa} (de ${valoresCotados.length} valores cotados)`);
        } else {
          valorEstimativa = 0;
          console.log(`   → Média: 0 (nenhum valor cotado)`);
        }
      } else { // mediana
        // Filtrar apenas valores verdadeiramente cotados (> 0) para mediana
        const valoresCotados = valoresItem.filter(v => v > 0);
        if (valoresCotados.length > 0) {
          const sorted = [...valoresCotados].sort((a, b) => a - b);
          const middle = Math.floor(sorted.length / 2);
          valorEstimativa = sorted.length % 2 === 0 
            ? (sorted[middle - 1] + sorted[middle]) / 2 
            : sorted[middle];
          console.log(`   → Mediana: ${valorEstimativa} (de ${valoresCotados.length} valores cotados, ordenados: [${sorted.join(', ')}])`);
        } else {
          valorEstimativa = 0;
          console.log(`   → Mediana: 0 (nenhum valor cotado)`);
        }
      }
      
      const valorTotalEstimativa = valorEstimativa * item.quantidade;
      
      // CRÍTICO: Armazenar estimativa calculada
      estimativasCalculadas[item.numero_item] = valorEstimativa;
      
      // Se critério é desconto, mostrar percentual (inclusive zero)
      if (criterioJulgamento === 'desconto') {
        linha.estimativa = formatarPercentual(valorEstimativa);
      } else {
        linha.estimativa = `${formatarMoeda(valorEstimativa)}\n(Total: ${formatarMoeda(valorTotalEstimativa)})`;
      }
      
      totalGeralEstimativa += valorTotalEstimativa;
    } else {
      linha.estimativa = '-';
      estimativasCalculadas[item.numero_item] = 0;
    }

    linhas.push(linha);
    console.log(`✅ Item ${item.numero_item} processado com sucesso`);
  });
  
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

  // Gerar tabela
  autoTable(doc, {
    startY: y,
    head: [colunas.map(c => c.header)],
    body: linhas.map(linha => colunas.map(col => linha[col.dataKey] || '')),
    theme: 'grid',
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
      // Garantir que todo texto seja preto
      data.cell.styles.textColor = [0, 0, 0];
      
      // Destacar linha de totais e mesclar primeiras colunas (apenas se houver linha de total)
      if (criterioJulgamento !== 'desconto' && data.row.index === linhas.length - 1) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9;
        
        // Mesclar as 4 primeiras colunas na linha de total
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
          data.cell.styles.cellPadding = { left: 3 };
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          // Ocultar conteúdo das células mescladas (mas a célula ainda existe)
          data.cell.text = [''];
        }
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

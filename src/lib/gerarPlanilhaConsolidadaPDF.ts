import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
import { gerarHashDocumento } from './certificacaoDigital';
import logoCompleto from '@/assets/prima-qualita-logo-completo.png';

// Função para carregar imagem como base64
const loadImageAsBase64 = (src: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/png'));
      } else {
        reject(new Error('Não foi possível criar contexto do canvas'));
      }
    };
    img.onerror = reject;
    img.src = src;
  });
};
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
    .replace(/‑/g, '-')      // Non-breaking hyphen (U+2011)
    .replace(/‐/g, '-')      // Hyphen (U+2010)
    .replace(/−/g, '-')      // Minus sign (U+2212)
    .replace(/­/g, '')       // Soft hyphen (invisible, remove)
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
  calculosPorItem: Record<string, 'menor' | 'media' | 'mediana'> = {},
  criterioJulgamento?: string
): Promise<{ blob: Blob; estimativas: Record<string, number> }> {
  const estimativasCalculadas: Record<string, number> = {};
  
  // Carregar logo
  const logoBase64 = await loadImageAsBase64(logoCompleto);
  
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
  
  // Adicionar logo à esquerda (proporção original ~2.5:1)
  const logoHeight = 22;
  const logoWidth = logoHeight * 2.5;
  doc.addImage(logoBase64, 'PNG', 5, 4, logoWidth, logoHeight);
  
  // Título centralizado (ajustado para não sobrepor logo)
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text('PLANILHA CONSOLIDADA DE PROPOSTAS', pageWidth / 2 + 20, 12, { align: 'center' });
  
  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`PROCESSO ${processo.numero}`, pageWidth / 2 + 20, 18, { align: 'center' });

  y = 40; // Posição após a faixa azul

  // OBJETO (abaixo da faixa azul, acima da cotação)
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  const textoObjeto = 'Objeto:';
  doc.text(textoObjeto, margemEsquerda, y);
  
  // Quebrar texto do objeto e aplicar justificação manual
  const objetoDecodificado = decodeHtmlEntities(processo.objeto).replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
  doc.setFont('helvetica', 'normal');
  
  // Primeira linha ao lado de "Objeto:"
  const larguraObjeto = doc.getTextWidth(textoObjeto);
  const larguraPrimeiraLinha = larguraUtil - larguraObjeto - 2; // Espaço mínimo de 2mm
  const linhasPrimeiraLinha = doc.splitTextToSize(objetoDecodificado, larguraPrimeiraLinha);
  
  // Verificar se há texto restante para saber se é a única linha
  const textoRestanteCheck = objetoDecodificado.substring(linhasPrimeiraLinha[0].length).trim();
  if (textoRestanteCheck) {
    // Se há mais linhas, justifica a primeira
    justificarTexto(doc, linhasPrimeiraLinha[0], margemEsquerda + larguraObjeto + 2, y, larguraPrimeiraLinha);
  } else {
    // Se é a única linha, alinha à esquerda (sem justificar)
    doc.text(linhasPrimeiraLinha[0], margemEsquerda + larguraObjeto + 2, y);
  }
  
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

  // Função para identificar preço público - APENAS por email
  const ehPrecoPublico = (email?: string) => {
    return !!(email && email.includes('precos.publicos'));
  };

  // Adicionar colunas de fornecedores
  respostas.forEach((resposta) => {
    const razaoSocial = resposta.fornecedor.razao_social.toUpperCase();
    const cnpjFormatado = formatarCNPJ(resposta.fornecedor.cnpj);
    const email = resposta.fornecedor.email || '';
    
    // Se for preço público, mostrar apenas a razão social (fonte) sem CNPJ/email
    const isPrecosPublicos = ehPrecoPublico(email);
    const headerText = isPrecosPublicos 
      ? `${razaoSocial}\n(Preço Público)` 
      : `${razaoSocial}\nCNPJ: ${cnpjFormatado}\n${email}`;
    
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
  
  // PRÉ-CALCULAR subtotais por lote por fornecedor ANTES de processar itens
  // Isso é necessário para calcular estimativa baseada no lote inteiro quando critério for "por_lote"
  const subtotaisPorLoteFornecedor: Map<number, Map<string, { subtotal: number, itens: Map<number, number> }>> = new Map();
  
  if (temLotes && criterioJulgamento === 'por_lote') {
    itensComLote.forEach(item => {
      if (!subtotaisPorLoteFornecedor.has(item.lote_numero!)) {
        subtotaisPorLoteFornecedor.set(item.lote_numero!, new Map());
      }
      const loteMap = subtotaisPorLoteFornecedor.get(item.lote_numero!)!;
      
      respostas.forEach(resposta => {
        const respostaItem = resposta.itens.find(i => 
          i.numero_item === item.numero_item && 
          (item.lote_numero ? i.lote_numero === item.lote_numero : !i.lote_numero)
        );
        
        if (!loteMap.has(resposta.fornecedor.cnpj)) {
          loteMap.set(resposta.fornecedor.cnpj, { subtotal: 0, itens: new Map() });
        }
        
        const fornecedorData = loteMap.get(resposta.fornecedor.cnpj)!;
        if (respostaItem) {
          const valorUnitario = typeof respostaItem.valor_unitario_ofertado === 'number' ? respostaItem.valor_unitario_ofertado : 0;
          const valorTotal = valorUnitario * item.quantidade;
          fornecedorData.subtotal += valorTotal;
          fornecedorData.itens.set(item.numero_item, valorUnitario);
        }
      });
    });
    
    console.log('📊 Subtotais por lote/fornecedor pré-calculados:', 
      Array.from(subtotaisPorLoteFornecedor.entries()).map(([lote, fornecedores]) => ({
        lote,
        fornecedores: Array.from(fornecedores.entries()).map(([cnpj, data]) => ({
          cnpj,
          subtotal: data.subtotal,
          qtdItens: data.itens.size
        }))
      }))
    );
  }
  
  // PRÉ-CALCULAR dados para critério GLOBAL
  // Isso é necessário para calcular estimativa baseada no fornecedor com menor preço global
  let fornecedoresEstimativaGlobal: { cnpj: string, valorTotal: number, itens: Map<number, number> }[] = [];
  
  if (criterioJulgamento === 'global') {
    // Calcular valor total global de cada fornecedor e mapear valores por item
    const totaisGlobaisPorFornecedor: Map<string, { valorTotal: number, itens: Map<number, number> }> = new Map();
    
    respostas.forEach(resposta => {
      let valorTotalFornecedor = 0;
      const itensMap = new Map<number, number>();
      
      itens.forEach(item => {
        const respostaItem = resposta.itens.find(i => 
          i.numero_item === item.numero_item && 
          (item.lote_numero ? i.lote_numero === item.lote_numero : !i.lote_numero)
        );
        
        if (respostaItem) {
          const valorUnitario = typeof respostaItem.valor_unitario_ofertado === 'number' ? respostaItem.valor_unitario_ofertado : 0;
          if (valorUnitario > 0) {
            valorTotalFornecedor += valorUnitario * item.quantidade;
            itensMap.set(item.numero_item, valorUnitario);
          }
        }
      });
      
      if (valorTotalFornecedor > 0) {
        totaisGlobaisPorFornecedor.set(resposta.fornecedor.cnpj, { 
          valorTotal: valorTotalFornecedor, 
          itens: itensMap 
        });
      }
    });
    
    // Converter para array para ordenação
    fornecedoresEstimativaGlobal = Array.from(totaisGlobaisPorFornecedor.entries())
      .map(([cnpj, data]) => ({ cnpj, valorTotal: data.valorTotal, itens: data.itens }));
    
    console.log('📊 Totais globais por fornecedor pré-calculados:', 
      fornecedoresEstimativaGlobal.map(f => ({ cnpj: f.cnpj, valorTotal: f.valorTotal, qtdItens: f.itens.size }))
    );
  }
  
  // Função para obter fornecedor(es) vencedor(es) do lote baseado no critério de cálculo
  const obterFornecedoresEstimativaLote = (loteNum: number, criterioCalculo: 'menor' | 'media' | 'mediana') => {
    const loteData = subtotaisPorLoteFornecedor.get(loteNum);
    if (!loteData) return [];
    
    // Filtrar fornecedores que cotaram o lote (subtotal > 0)
    const fornecedoresComCotacao = Array.from(loteData.entries())
      .filter(([_, data]) => data.subtotal > 0)
      .map(([cnpj, data]) => ({ cnpj, subtotal: data.subtotal, itens: data.itens }));
    
    if (fornecedoresComCotacao.length === 0) return [];
    
    if (criterioCalculo === 'menor') {
      // Menor subtotal do lote - retorna apenas 1 fornecedor
      const menorSubtotal = Math.min(...fornecedoresComCotacao.map(f => f.subtotal));
      return fornecedoresComCotacao.filter(f => f.subtotal === menorSubtotal);
    } else if (criterioCalculo === 'mediana') {
      // Mediana dos subtotais do lote - retorna fornecedor(es) que compõem a mediana
      const sorted = [...fornecedoresComCotacao].sort((a, b) => a.subtotal - b.subtotal);
      const middle = Math.floor(sorted.length / 2);
      
      if (sorted.length % 2 === 0) {
        // Número par: mediana é média dos dois do meio, retorna ambos
        return [sorted[middle - 1], sorted[middle]];
      } else {
        // Número ímpar: mediana é o do meio
        return [sorted[middle]];
      }
    } else {
      // Média: retorna todos para calcular média dos valores
      return fornecedoresComCotacao;
    }
  };
  
  // Função para processar um item e retornar a linha
  const processarItem = (item: ItemCotacao, fornecedoresEstimativaLote?: { cnpj: string, subtotal: number, itens: Map<number, number> }[]) => {
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
          // Exibir "-" quando não cotado (valor 0 ou não informado)
          linha[`fornecedor_${resposta.fornecedor.cnpj}`] = valorParaCalculo > 0 
            ? `${formatarMoeda(valorParaCalculo)}\n(Total: ${formatarMoeda(valorTotal)})`
            : '-';
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
        
        // IMPORTANTE: Só adicionar valores > 0 para cálculo de estimativa (ignorar itens não cotados)
        if (valorParaCalculo > 0) {
          valoresItem.push(valorParaCalculo);
        }
      } else {
        linha[`fornecedor_${resposta.fornecedor.cnpj}`] = '-';
      }
    });

    // Calcular estimativa
    if (valoresItem.length > 0) {
      // CHAVE COMPOSTA: lote_numero_item_numero para diferenciar itens entre lotes
      const chaveItem = `${item.lote_numero || 0}_${item.numero_item}`;
      const criterioItem = calculosPorItem[chaveItem] || 'menor';
      let valorEstimativa: number;
      
      // Se critério é por_lote E temos fornecedores pré-calculados, usar valores desses fornecedores
      if (criterioJulgamento === 'por_lote' && fornecedoresEstimativaLote && fornecedoresEstimativaLote.length > 0) {
        // Pegar os valores dos itens dos fornecedores que compõem a estimativa do lote
        // IMPORTANTE: Incluir valores 0 para manter consistência de denominador para média
        const valoresDosFornecedoresEstimativa = fornecedoresEstimativaLote
          .map(f => f.itens.get(item.numero_item) || 0);
        
        // Para MENOR, precisamos apenas dos valores > 0 do fornecedor vencedor
        const valoresPositivos = valoresDosFornecedoresEstimativa.filter(v => v > 0);
        
        if (criterioItem === 'menor') {
          // Para "menor", usar o valor do fornecedor com menor subtotal do lote
          // fornecedoresEstimativaLote[0] é o fornecedor com menor subtotal
          valorEstimativa = valoresPositivos.length > 0 ? valoresPositivos[0] : 0;
        } else if (criterioItem === 'mediana') {
          // MEDIANA: Exclui maior e menor subtotal, faz média dos fornecedores do MEIO
          // fornecedoresEstimativaLote já contém os fornecedores do meio (excluindo maior e menor)
          // Fazer média dos valores dos itens desses fornecedores
          if (valoresPositivos.length > 0) {
            valorEstimativa = valoresPositivos.reduce((a, b) => a + b, 0) / valoresPositivos.length;
          } else {
            valorEstimativa = 0;
          }
        } else {
          // MÉDIA: Usar todos os fornecedores que cotaram o lote
          // Dividir pelo número total de fornecedores do lote para manter consistência
          // (média item a item deve bater com média dos subtotais)
          const somaValores = valoresDosFornecedoresEstimativa.reduce((a, b) => a + b, 0);
          valorEstimativa = fornecedoresEstimativaLote.length > 0 
            ? somaValores / fornecedoresEstimativaLote.length 
            : 0;
        }
      } else if (criterioJulgamento === 'global' && fornecedoresEstimativaGlobal.length > 0) {
        // LÓGICA ESPECÍFICA PARA CRITÉRIO GLOBAL
        if (criterioItem === 'menor') {
          // MENOR GLOBAL: Encontrar o fornecedor com menor valor TOTAL e usar seus valores
          const fornecedorMenorTotal = [...fornecedoresEstimativaGlobal].sort((a, b) => a.valorTotal - b.valorTotal)[0];
          valorEstimativa = fornecedorMenorTotal?.itens.get(item.numero_item) || 0;
          console.log(`📊 GLOBAL MENOR - Item ${item.numero_item}: Fornecedor vencedor ${fornecedorMenorTotal?.cnpj} (total ${fornecedorMenorTotal?.valorTotal}), valor item = ${valorEstimativa}`);
        } else if (criterioItem === 'media') {
          // MÉDIA GLOBAL: Fazer média de todos os valores dos fornecedores para este item
          const valoresCotados = valoresItem.filter(v => v > 0);
          valorEstimativa = valoresCotados.length > 0 
            ? valoresCotados.reduce((a, b) => a + b, 0) / valoresCotados.length 
            : 0;
          console.log(`📊 GLOBAL MÉDIA - Item ${item.numero_item}: valores=${valoresCotados.join(',')}, média=${valorEstimativa}`);
        } else {
          // MEDIANA GLOBAL: Calcular mediana dos valores TOTAIS e fazer média dos valores dos fornecedores na mediana
          const sorted = [...fornecedoresEstimativaGlobal].sort((a, b) => a.valorTotal - b.valorTotal);
          let fornecedoresMediana: typeof fornecedoresEstimativaGlobal = [];
          
          if (sorted.length === 1) {
            fornecedoresMediana = [sorted[0]];
          } else if (sorted.length === 2) {
            // Com 2 fornecedores, mediana é a média dos dois
            fornecedoresMediana = sorted;
          } else if (sorted.length % 2 === 0) {
            // Número par: mediana é média dos dois do meio
            const middle = sorted.length / 2;
            fornecedoresMediana = [sorted[middle - 1], sorted[middle]];
          } else {
            // Número ímpar: mediana é o do meio
            const middle = Math.floor(sorted.length / 2);
            fornecedoresMediana = [sorted[middle]];
          }
          
          // Fazer média dos valores dos itens dos fornecedores que ficaram na mediana
          const valoresMediana = fornecedoresMediana
            .map(f => f.itens.get(item.numero_item) || 0)
            .filter(v => v > 0);
          
          valorEstimativa = valoresMediana.length > 0 
            ? valoresMediana.reduce((a, b) => a + b, 0) / valoresMediana.length 
            : 0;
          
          console.log(`📊 GLOBAL MEDIANA - Item ${item.numero_item}: fornecedores mediana=${fornecedoresMediana.map(f => f.cnpj).join(',')}, valores=${valoresMediana.join(',')}, média=${valorEstimativa}`);
        }
      } else {
        // Lógica original para outros critérios (por_item, desconto)
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
      }
      
      const valorTotalEstimativa = valorEstimativa * item.quantidade;
      
      // Usar chave composta apenas para critério por_lote para evitar sobrescrita entre lotes
      const chaveEstimativa = criterioJulgamento === 'por_lote' && item.lote_numero
        ? `${item.lote_numero}_${item.numero_item}`
        : String(item.numero_item);
      estimativasCalculadas[chaveEstimativa] = valorEstimativa;
      
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
      // Usar chave composta apenas para critério por_lote
      const chaveEstimativa = criterioJulgamento === 'por_lote' && item.lote_numero
        ? `${item.lote_numero}_${item.numero_item}`
        : String(item.numero_item);
      estimativasCalculadas[chaveEstimativa] = 0;
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
      
      // Se critério é por_lote, obter fornecedores para estimativa do lote ANTES de processar itens
      let fornecedoresEstimativaLote: { cnpj: string, subtotal: number, itens: Map<number, number> }[] | undefined;
      if (criterioJulgamento === 'por_lote') {
        // Usar o critério de cálculo definido para este lote (CHAVE COMPOSTA: lote_numero_item_numero)
        const primeiroItem = loteData.itens[0];
        const chaveItem = `${primeiroItem?.lote_numero || loteNum}_${primeiroItem?.numero_item}`;
        const criterioCalculo = calculosPorItem[chaveItem] || 'menor';
        fornecedoresEstimativaLote = obterFornecedoresEstimativaLote(loteNum, criterioCalculo as 'menor' | 'media' | 'mediana');
        
        console.log(`📊 Lote ${loteNum}: chave=${chaveItem}, critério=${criterioCalculo}, fornecedores para estimativa:`, 
          fornecedoresEstimativaLote?.map(f => ({ cnpj: f.cnpj, subtotal: f.subtotal }))
        );
      }
      
      // Processar itens do lote
      loteData.itens.sort((a, b) => a.numero_item - b.numero_item).forEach(item => {
        linhas.push(processarItem(item, fornecedoresEstimativaLote));
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


  // PRÉ-CALCULAR o menor fontSize necessário para todas as células de valores
  let menorFontSize = 8; // Valor inicial
  const fontSizeMinimo = 6;
  
  // Iterar sobre todas as linhas e colunas de valores para encontrar o menor fontSize necessário
  linhas.forEach((linha, rowIndex) => {
    // Pular apenas headers de lote (não têm valores monetários)
    if (linha.isLoteHeader) return;
    
    // Verificar colunas de fornecedores e estimativa (índice >= 4)
    for (let colIndex = 4; colIndex < colunas.length; colIndex++) {
      const dataKey = colunas[colIndex].dataKey;
      const texto = linha[dataKey] || '';
      
      if (texto && texto !== '-') {
        // Calcular fontSize ideal para este texto
        const textoLimpo = String(texto).replace(/\n/g, ' ');
        let fontSize = 8;
        doc.setFontSize(fontSize);
        
        const larguraDisponivel = larguraPorColuna - 4; // padding
        
        while (fontSize > fontSizeMinimo) {
          doc.setFontSize(fontSize);
          const larguraTexto = doc.getTextWidth(textoLimpo);
          
          if (larguraTexto <= larguraDisponivel) {
            break;
          }
          fontSize -= 0.5;
        }
        
        fontSize = Math.max(fontSize, fontSizeMinimo);
        
        // Atualizar menor fontSize encontrado
        if (fontSize < menorFontSize) {
          menorFontSize = fontSize;
        }
      }
    }
  });
  
  console.log('📏 FontSize uniforme calculado:', menorFontSize);
  
  // Gerar tabela
  autoTable(doc, {
    startY: y,
    head: [colunas.map(c => c.header)],
    body: linhas.map(linha => colunas.map(col => linha[col.dataKey] || '')),
    theme: 'grid',
    rowPageBreak: 'auto', // Permitir quebra de linha entre páginas
    showHead: 'everyPage', // Repetir cabeçalho em cada página
    styles: {
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    headStyles: {
      fillColor: [120, 190, 225], // Azul claro do logo (paleta Prima Qualitá)
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: menorFontSize, // Usar fontSize uniforme calculado
      halign: 'center',
      valign: 'middle',
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
      cellPadding: 2,
      minCellHeight: 15
    },
    bodyStyles: {
      fontSize: menorFontSize, // Usar o fontSize uniforme calculado
      textColor: [0, 0, 0],
      lineWidth: 0.1,
      lineColor: [200, 200, 200],
      cellPadding: { top: 2, right: 2, bottom: 2, left: 2 },
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
          cellPadding: { top: 2, right: 2, bottom: 2, left: 2 }
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
    margin: { left: margemEsquerda, right: margemDireita, top: 20, bottom: 30 },
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
        
        // Mesclar as 4 primeiras colunas na linha de subtotal - texto vem da coluna 0
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
          data.cell.styles.cellPadding = { top: 3, right: 2, bottom: 3, left: 5 };
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          // Limpar texto das colunas 1-3 (já mescladas)
          data.cell.text = [''];
        }
        return;
      }
      
      // Destacar linha de VALOR TOTAL GERAL (última linha se não for desconto)
      if (criterioJulgamento !== 'desconto' && data.row.index === linhas.length - 1) {
        data.cell.styles.fillColor = [180, 180, 180]; // Cinza mais escuro que subtotal
        data.cell.styles.textColor = [0, 0, 0];
        data.cell.styles.fontStyle = 'bold';
        
        // Mesclar as 4 primeiras colunas na linha de total - texto vem da coluna 0
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
          data.cell.styles.cellPadding = { top: 3, right: 2, bottom: 3, left: 5 };
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          // Limpar texto das colunas 1-3 (já mescladas)
          data.cell.text = [''];
        }
        return;
      }
      
      // Configurar coluna de descrição
      if (data.column.index === 1 && !linhaAtual?.isLoteHeader && !linhaAtual?.isSubtotal) {
        data.cell.styles.halign = 'left';
        data.cell.styles.textColor = [0, 0, 0];
        data.cell.styles.overflow = 'linebreak';
      }
    },
    didDrawCell: (data) => {
      // Texto justificado para coluna de descrição usando suporte nativo do jsPDF
      if (data.section === 'body' && data.column.index === 1) {
        const linhaAtual = linhas[data.row.index];
        if (linhaAtual?.isLoteHeader || linhaAtual?.isSubtotal) return;
        if (criterioJulgamento !== 'desconto' && data.row.index === linhas.length - 1) return;
        
        const textoOriginal = data.cell.text.join(' ');
        if (!textoOriginal || !textoOriginal.trim()) return;
        
        const cell = data.cell;
        const padding = 2;
        const larguraDisponivel = cell.width - (padding * 2);
        
        // Obter cor de fundo
        const fillColor = cell.styles.fillColor;
        let bgColor: [number, number, number] = [255, 255, 255];
        if (Array.isArray(fillColor) && fillColor.length >= 3) {
          bgColor = [fillColor[0] as number, fillColor[1] as number, fillColor[2] as number];
        }
        
        // Cobrir texto original
        doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        doc.rect(cell.x + 0.3, cell.y + 0.3, cell.width - 0.6, cell.height - 0.6, 'F');
        
        // Configurar fonte
        doc.setFontSize(menorFontSize);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        // Usar align: 'justify' nativo do jsPDF
        const x = cell.x + padding;
        const alturaLinha = menorFontSize * 0.42;
        
        // Calcular posição Y centralizada
        const linhasEstimadas = doc.splitTextToSize(textoOriginal, larguraDisponivel);
        const alturaTextoTotal = linhasEstimadas.length * alturaLinha;
        let yInicio = cell.y + padding + alturaLinha * 0.8;
        if (alturaTextoTotal < cell.height - (padding * 2)) {
          yInicio = cell.y + (cell.height - alturaTextoTotal) / 2 + alturaLinha * 0.8;
        }
        
        // Desenhar texto justificado
        doc.text(textoOriginal, x, yInicio, { 
          maxWidth: larguraDisponivel, 
          align: 'justify',
          lineHeightFactor: 1.15
        });
        
        // Resetar word spacing para não afetar outros textos
        (doc as any).internal.write(0, "Tw");
      }
    }
  });

  // Pegar posição Y após a tabela
  const finalY = (doc as any).lastAutoTable.finalY;

  // Verificar se precisa de nova página para certificação
  const alturaCertificacao = 35;
  // Não há rodapé nesta planilha; usar margem inferior pequena só para evitar corte visual.
  const margemInferior = 5;
  let y2 = finalY + 10;
  if (y2 + alturaCertificacao > pageHeight - margemInferior) {
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

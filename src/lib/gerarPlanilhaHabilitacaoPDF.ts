import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';
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

interface FornecedorResposta {
  fornecedor: {
    id: string;
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

export async function gerarPlanilhaHabilitacaoPDF(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: FornecedorResposta[],
  dadosProtocolo: DadosProtocolo,
  criterioJulgamento?: string
): Promise<{ blob: Blob; storagePath: string }> {
  // Carregar logo
  const logoBase64 = await loadImageAsBase64(logoCompleto);
  
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
    
    // Adicionar logo à esquerda (proporção original ~2.5:1)
    const logoHeight = 22;
    const logoWidth = logoHeight * 2.5;
    doc.addImage(logoBase64, 'PNG', 5, 4, logoWidth, logoHeight);
    
    // Título centralizado (ajustado para não sobrepor logo)
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.text('RESULTADO FINAL', pageWidth / 2 + 20, 12, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`PROCESSO ${processo.numero}`, pageWidth / 2 + 20, 18, { align: 'center' });
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
  
  // CRÍTICO: Se só tem uma linha E não há texto restante, não justificar (evita esticamento)
  const temMaisLinhas = objetoDecodificado.substring(linhasPrimeiraLinha[0].length).trim().length > 0;
  if (temMaisLinhas) {
    justificarTexto(doc, linhasPrimeiraLinha[0], margemEsquerda + larguraObjeto + 2, yPosition, larguraPrimeiraLinha);
  } else {
    doc.text(linhasPrimeiraLinha[0], margemEsquerda + larguraObjeto + 2, yPosition);
  }
  
  yPosition += 5;
  const textoRestante = objetoDecodificado.substring(linhasPrimeiraLinha[0].length).trim();
  if (textoRestante) {
    const linhasRestantes = doc.splitTextToSize(textoRestante, larguraUtil);
    linhasRestantes.forEach((linha: string, index: number) => {
      // Não justificar a última linha
      if (index < linhasRestantes.length - 1) {
        justificarTexto(doc, linha, margemEsquerda, yPosition, larguraUtil);
      } else {
        doc.text(linha, margemEsquerda, yPosition);
      }
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
  doc.text("Vermelho = Empresa/Item Inabilitado", margemEsquerda, yPosition);
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
    colunas.push({
      header: `${resposta.fornecedor.razao_social}${resposta.rejeitado ? ' (INAB.)' : ''}`,
      dataKey: `fornecedor_${idx}`
    });
  });

  // Adicionar colunas de vencedor no final
  colunas.push({ header: "Valor Vencedor", dataKey: "valor_vencedor" });
  colunas.push({ header: "Empresa Vencedora", dataKey: "empresa_vencedora" });

  // Construir dados da tabela
  const dados: any[] = [];
  const isDesconto = criterioJulgamento === "desconto" || criterioJulgamento === "maior_percentual_desconto";

  // Agrupar itens por lote se existirem itens com lote_numero (mesma lógica da planilha consolidada)
  const itensComLote = itens.filter(item => item.lote_numero && item.lote_numero > 0);
  const itensSemLote = itens.filter(item => !item.lote_numero || item.lote_numero <= 0);
  const temLotes = itensComLote.length > 0;

  // Map de lotes
  const lotesMap = new Map<number, { descricao: string, itens: typeof itens }>();
  if (temLotes) {
    itensComLote.forEach(item => {
      if (!lotesMap.has(item.lote_numero!)) {
        lotesMap.set(item.lote_numero!, { descricao: item.lote_descricao || `Lote ${item.lote_numero}`, itens: [] });
      }
      lotesMap.get(item.lote_numero!)!.itens.push(item);
    });
  }

  // Totais por fornecedor e vencedor - agora por lote também
  const totaisPorFornecedor: number[] = new Array(respostas.length).fill(0);
  const totaisPorLote: Map<number, { fornecedores: number[], vencedor: number }> = new Map();
  let totalVencedor = 0;

  // Função para identificar preço público - APENAS por email
  const ehPrecoPublico = (email?: string) => {
    return !!(email && email.includes('precos.publicos'));
  };

  // Função para encontrar vencedor GLOBAL (menor valor total)
  const encontrarVencedorGlobal = (): { empresa: string; empresaIdx: number } => {
    const totaisGlobais: { idx: number; total: number; razao_social: string }[] = [];
    
    respostas.forEach((resposta, idx) => {
      // Ignorar fornecedores totalmente rejeitados ou preços públicos
      if (resposta.rejeitado) return;
      if (ehPrecoPublico(resposta.fornecedor.email)) return;
      
      // Calcular total global do fornecedor
      let totalFornecedor = 0;
      resposta.itens.forEach(itemResp => {
        const itemOriginal = itens.find(i => i.numero_item === itemResp.numero_item);
        if (itemOriginal && itemResp.valor_unitario_ofertado > 0) {
          totalFornecedor += itemResp.valor_unitario_ofertado * itemOriginal.quantidade;
        }
      });
      
      if (totalFornecedor > 0) {
        totaisGlobais.push({ idx, total: totalFornecedor, razao_social: resposta.fornecedor.razao_social });
      }
    });
    
    if (totaisGlobais.length === 0) {
      return { empresa: "-", empresaIdx: -1 };
    }
    
    // Menor total vence
    totaisGlobais.sort((a, b) => a.total - b.total);
    return { empresa: totaisGlobais[0].razao_social, empresaIdx: totaisGlobais[0].idx };
  };

  // Função para encontrar vencedor de um item
  // CRÍTICO: Match deve considerar TANTO numero_item QUANTO lote_numero para evitar confusão entre lotes
  const encontrarVencedor = (numeroItem: number, loteNumero?: number): { valor: number | null; empresa: string } => {
    let melhorValor: number | null = null;
    let empresaVencedora = "-";

    respostas.forEach((resposta) => {
      // Ignorar fornecedores totalmente rejeitados ou preços públicos
      if (resposta.rejeitado) {
        return;
      }
      
      // CRÍTICO: Para critério por_lote, itens_rejeitados contém NÚMEROS DE LOTES
      // Para outros critérios, contém números de itens
      if (criterioJulgamento === 'por_lote') {
        // Verificar se o LOTE está rejeitado
        if (loteNumero && resposta.itens_rejeitados.includes(loteNumero)) {
          return;
        }
      } else {
        // Verificar se o ITEM está rejeitado
        if (resposta.itens_rejeitados.includes(numeroItem)) {
          return;
        }
      }
      
      // CRÍTICO: Excluir preços públicos da identificação de vencedores
      if (ehPrecoPublico(resposta.fornecedor.email)) {
        return;
      }

      // CRÍTICO: Match EXATO por numero_item E lote_numero para evitar confusão entre lotes
      const itemResposta = resposta.itens.find(i => {
        if (loteNumero !== undefined) {
          // Se buscando por lote específico, EXIGIR match exato
          return i.numero_item === numeroItem && i.lote_numero === loteNumero;
        }
        // Sem lote especificado, buscar apenas por numero_item
        return i.numero_item === numeroItem;
      });
      
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

  // Função para encontrar vencedor de um lote inteiro
  const encontrarVencedorLote = (loteNum: number): { valor: number; empresa: string; empresaIdx: number } => {
    const totaisLote: { idx: number; total: number; razao_social: string }[] = [];
    
    respostas.forEach((resposta, idx) => {
      // Ignorar fornecedores totalmente rejeitados OU preços públicos
      if (resposta.rejeitado) return;
      if (ehPrecoPublico(resposta.fornecedor.email)) return;
      
      let totalFornecedorLote = 0;
      let loteRejeitado = false;
      
      // Quando critério é por_lote, itens_rejeitados contém números de LOTE
      if (criterioJulgamento === 'por_lote' && resposta.itens_rejeitados.includes(loteNum)) {
        loteRejeitado = true;
      }
      
      if (!loteRejeitado) {
        const itensDoLote = itens.filter(i => i.lote_numero === loteNum);
        itensDoLote.forEach(item => {
          // CRÍTICO: Match EXATO por numero_item E lote_numero
          const itemResposta = resposta.itens.find(i => 
            i.numero_item === item.numero_item && i.lote_numero === loteNum
          );
          if (itemResposta && itemResposta.valor_unitario_ofertado > 0) {
            totalFornecedorLote += itemResposta.valor_unitario_ofertado * item.quantidade;
          }
        });
      }
      
      if (!loteRejeitado && totalFornecedorLote > 0) {
        totaisLote.push({ idx, total: totalFornecedorLote, razao_social: resposta.fornecedor.razao_social });
      }
    });
    
    if (totaisLote.length === 0) {
      return { valor: 0, empresa: "-", empresaIdx: -1 };
    }
    
    // Menor total vence
    totaisLote.sort((a, b) => a.total - b.total);
    return { valor: totaisLote[0].total, empresa: totaisLote[0].razao_social, empresaIdx: totaisLote[0].idx };
  };

  // Função para processar um item e retornar a linha
  // vencedorGlobalIdx é passado quando critério é "global" para identificar o vencedor único
  const processarItem = (item: ItemCotacao, loteNumero?: number, vencedorLoteIdx?: number, vencedorGlobalIdx?: number) => {
    const linha: any = {
      item: item.numero_item,
      descricao: sanitizarTexto(decodeHtmlEntities(item.descricao)),
      quantidade: item.quantidade,
      unidade: sanitizarTexto(item.unidade),
      _lote_numero: loteNumero
    };

    respostas.forEach((resposta, idx) => {
      // CRÍTICO: Match EXATO por numero_item E lote_numero
      const itemResposta = resposta.itens.find(i => {
        if (loteNumero !== undefined) {
          return i.numero_item === item.numero_item && i.lote_numero === loteNumero;
        }
        return i.numero_item === item.numero_item;
      });
      
      if (itemResposta) {
        if (isDesconto) {
          linha[`fornecedor_${idx}`] = formatarPercentual(itemResposta.percentual_desconto || itemResposta.valor_unitario_ofertado);
        } else {
          const valorUnitario = itemResposta.valor_unitario_ofertado;
          const valorTotal = valorUnitario * item.quantidade;
          linha[`fornecedor_${idx}`] = `${formatarMoeda(valorUnitario)}\n(Total: ${formatarMoeda(valorTotal)})`;
          totaisPorFornecedor[idx] += valorTotal;
          
          // Acumular para subtotal do lote
          if (loteNumero) {
            if (!totaisPorLote.has(loteNumero)) {
              totaisPorLote.set(loteNumero, { fornecedores: new Array(respostas.length).fill(0), vencedor: 0 });
            }
            totaisPorLote.get(loteNumero)!.fornecedores[idx] += valorTotal;
          }
        }
      } else {
        linha[`fornecedor_${idx}`] = "-";
      }
    });

    // Adicionar dados do vencedor
    // CRITÉRIO GLOBAL: vencedor é único para todos itens (quem tem menor valor total)
    if (criterioJulgamento === 'global' && vencedorGlobalIdx !== undefined && vencedorGlobalIdx >= 0) {
      const respostaVencedor = respostas[vencedorGlobalIdx];
      const itemRespostaVencedor = respostaVencedor?.itens.find(i => i.numero_item === item.numero_item);
      
      if (itemRespostaVencedor) {
        const valorUnitario = itemRespostaVencedor.valor_unitario_ofertado;
        const valorTotalItem = valorUnitario * item.quantidade;
        linha.valor_vencedor = `${formatarMoeda(valorUnitario)}\n(Total: ${formatarMoeda(valorTotalItem)})`;
        linha.empresa_vencedora = respostaVencedor.fornecedor.razao_social;
        totalVencedor += valorTotalItem;
      } else {
        linha.valor_vencedor = "-";
        linha.empresa_vencedora = respostaVencedor?.fornecedor.razao_social || "-";
      }
    } else if (!temLotes) {
      // Para critério por item ou desconto - quando não há lotes
      const vencedor = encontrarVencedor(item.numero_item, loteNumero);
      if (vencedor.valor !== null) {
        if (isDesconto) {
          linha.valor_vencedor = formatarPercentual(vencedor.valor);
          linha.empresa_vencedora = vencedor.empresa;
        } else {
          const valorTotalVencedor = vencedor.valor * item.quantidade;
          linha.valor_vencedor = `${formatarMoeda(vencedor.valor)}\n(Total: ${formatarMoeda(valorTotalVencedor)})`;
          linha.empresa_vencedora = vencedor.empresa;
          totalVencedor += valorTotalVencedor;
        }
      } else {
        linha.valor_vencedor = "-";
        linha.empresa_vencedora = "-";
      }
    } else if (vencedorLoteIdx !== undefined && vencedorLoteIdx >= 0) {
      // Para critério por lote: puxar valor do fornecedor vencedor do lote
      const respostaVencedor = respostas[vencedorLoteIdx];
      // CRÍTICO: Match EXATO por numero_item E lote_numero
      const itemRespostaVencedor = respostaVencedor?.itens.find(i => {
        if (loteNumero !== undefined) {
          return i.numero_item === item.numero_item && i.lote_numero === loteNumero;
        }
        return i.numero_item === item.numero_item;
      });
      
      if (itemRespostaVencedor && !isDesconto) {
        const valorUnitario = itemRespostaVencedor.valor_unitario_ofertado;
        const valorTotalItem = valorUnitario * item.quantidade;
        linha.valor_vencedor = `${formatarMoeda(valorUnitario)}\n(Total: ${formatarMoeda(valorTotalItem)})`;
        linha.empresa_vencedora = respostaVencedor.fornecedor.razao_social;
      } else if (itemRespostaVencedor && isDesconto) {
        linha.valor_vencedor = formatarPercentual(itemRespostaVencedor.percentual_desconto || itemRespostaVencedor.valor_unitario_ofertado);
        linha.empresa_vencedora = respostaVencedor.fornecedor.razao_social;
      } else {
        linha.valor_vencedor = "-";
        linha.empresa_vencedora = "-";
      }
    } else {
      linha.valor_vencedor = "-";
      linha.empresa_vencedora = "-";
    }

    return linha;
  };

  // Se tem lotes e critério é por_lote, processar por lote com cabeçalhos e subtotais
  if (temLotes) {
    const lotesOrdenados = Array.from(lotesMap.entries()).sort((a, b) => a[0] - b[0]);
    
    lotesOrdenados.forEach(([loteNum, loteData]) => {
      // Calcular vencedor do lote ANTES de processar os itens
      const totaisLoteTemp: { idx: number; total: number; razao_social: string }[] = [];
      respostas.forEach((resposta, idx) => {
        // CRÍTICO: Excluir fornecedores rejeitados E preços públicos
        if (resposta.rejeitado) return;
        if (ehPrecoPublico(resposta.fornecedor.email)) return;
        
        let totalFornecedorLote = 0;
        let loteRejeitado = false;
        
        // Quando critério é por_lote, itens_rejeitados contém números de LOTE
        if (criterioJulgamento === 'por_lote' && resposta.itens_rejeitados.includes(loteNum)) {
          loteRejeitado = true;
        }
        
        if (!loteRejeitado) {
          loteData.itens.forEach(item => {
            // CRÍTICO: Match EXATO por numero_item E lote_numero
            const itemResposta = resposta.itens.find(i => 
              i.numero_item === item.numero_item && i.lote_numero === loteNum
            );
            if (itemResposta && itemResposta.valor_unitario_ofertado > 0) {
              totalFornecedorLote += itemResposta.valor_unitario_ofertado * item.quantidade;
            }
          });
        }
        
        if (!loteRejeitado && totalFornecedorLote > 0) {
          totaisLoteTemp.push({ idx, total: totalFornecedorLote, razao_social: resposta.fornecedor.razao_social });
        }
      });
      
      // Identificar índice do vencedor do lote (menor total vence)
      let vencedorLoteIdx = -1;
      if (totaisLoteTemp.length > 0) {
        totaisLoteTemp.sort((a, b) => a.total - b.total);
        vencedorLoteIdx = totaisLoteTemp[0].idx;
      }
      
      // Adicionar linha de cabeçalho do lote
      const textoLote = `LOTE ${converterNumeroRomano(loteNum)} - ${sanitizarTexto(loteData.descricao)}`;
      const linhaHeaderLote: any = {
        item: textoLote,
        descricao: '',
        quantidade: '',
        unidade: '',
        isLoteHeader: true
      };
      respostas.forEach((_, idx) => { linhaHeaderLote[`fornecedor_${idx}`] = ''; });
      linhaHeaderLote.valor_vencedor = '';
      linhaHeaderLote.empresa_vencedora = '';
      dados.push(linhaHeaderLote);
      
      // Processar itens do lote passando o índice do vencedor
      loteData.itens.sort((a, b) => a.numero_item - b.numero_item).forEach(item => {
        dados.push(processarItem(item, loteNum, vencedorLoteIdx));
      });
      
      // Adicionar linha de subtotal do lote (apenas se NÃO for critério de desconto)
      if (!isDesconto) {
        const textoSubtotal = `SUBTOTAL LOTE ${converterNumeroRomano(loteNum)}`;
        const linhaSubtotal: any = {
          item: textoSubtotal,
          descricao: '',
          quantidade: '',
          unidade: '',
          isSubtotal: true,
          _lote_numero: loteNum
        };
        
        const loteSubtotais = totaisPorLote.get(loteNum);
        respostas.forEach((_, idx) => {
          const valorLote = loteSubtotais?.fornecedores[idx] || 0;
          linhaSubtotal[`fornecedor_${idx}`] = formatarMoeda(valorLote);
        });
        
        // Usar vencedor já calculado
        if (totaisLoteTemp.length > 0) {
          linhaSubtotal.valor_vencedor = formatarMoeda(totaisLoteTemp[0].total);
          linhaSubtotal.empresa_vencedora = totaisLoteTemp[0].razao_social;
          totalVencedor += totaisLoteTemp[0].total;
        } else {
          linhaSubtotal.valor_vencedor = "-";
          linhaSubtotal.empresa_vencedora = "-";
        }
        
        // Guardar vencedor do lote para marcação
        if (loteSubtotais && totaisLoteTemp.length > 0) {
          loteSubtotais.vencedor = totaisLoteTemp[0].total;
        }
        
        dados.push(linhaSubtotal);
      }
    });
  } else {
    // Processar itens normalmente sem agrupamento
    // CRITÉRIO GLOBAL: calcular vencedor único (menor valor total) ANTES de processar itens
    let vencedorGlobalIdx: number | undefined = undefined;
    if (criterioJulgamento === 'global') {
      const vencedorGlobal = encontrarVencedorGlobal();
      vencedorGlobalIdx = vencedorGlobal.empresaIdx >= 0 ? vencedorGlobal.empresaIdx : undefined;
    }
    
    itens.forEach((item) => {
      dados.push(processarItem(item, item.lote_numero, undefined, vencedorGlobalIdx));
    });
  }

  // Adicionar linha de VALOR TOTAL apenas se NÃO for critério de desconto
  if (!isDesconto) {
    const linhaTotalGeral: any = {
      item: 'VALOR TOTAL',
      descricao: '',
      quantidade: '',
      unidade: '',
      isTotalGeral: true
    };

    respostas.forEach((_, idx) => {
      linhaTotalGeral[`fornecedor_${idx}`] = formatarMoeda(totaisPorFornecedor[idx]);
    });

    linhaTotalGeral.valor_vencedor = formatarMoeda(totalVencedor);
    linhaTotalGeral.empresa_vencedora = '';

    dados.push(linhaTotalGeral);
  }

  // Construir estilos de coluna dinamicamente
  const columnStyles: any = {
    item: { cellWidth: 12, halign: 'center' },
    descricao: { cellWidth: 45, halign: 'left', overflow: 'linebreak' },
    quantidade: { cellWidth: 12, halign: 'center' },
    unidade: { cellWidth: 12, halign: 'center' },
    valor_vencedor: { cellWidth: 22, halign: 'center', fontStyle: 'bold', overflow: 'linebreak' },
    empresa_vencedora: { cellWidth: 35, halign: 'center', fontStyle: 'bold', overflow: 'linebreak' }
  };

  // Adicionar estilos para colunas de fornecedores com largura UNIFORME
  // Calcular largura disponível após colunas fixas (item:12 + descricao:45 + qtd:12 + unid:12 + vencedor:22 + empresa:35 = 138mm)
  const larguraColunasFixas = 12 + 45 + 12 + 12 + 22 + 35; // 138mm
  const larguraRestante = larguraUtil - larguraColunasFixas;
  const numFornecedores = respostas.length;
  const larguraPorFornecedor = numFornecedores > 0 ? Math.floor(larguraRestante / numFornecedores) : 25;
  
  respostas.forEach((_, idx) => {
    columnStyles[`fornecedor_${idx}`] = { 
      cellWidth: larguraPorFornecedor, 
      halign: 'center', 
      overflow: 'linebreak' 
    };
  });

  // Armazenar textos de descrição para desenho customizado com justificação
  const descricoesPorLinha: Map<number, string> = new Map();

  // PRÉ-CALCULAR o menor fontSize necessário para todas as células de valores
  let menorFontSize = 7;
  const fontSizeMinimo = 5.5;
  
  dados.forEach((linha, rowIndex) => {
    // Pular apenas headers de lote (não têm valores)
    if (linha.isLoteHeader) return;
    
    // Verificar colunas de fornecedores e valor_vencedor
    respostas.forEach((_, idx) => {
      const texto = linha[`fornecedor_${idx}`] || '';
      if (texto && texto !== '-') {
        const textoLimpo = String(texto).replace(/\n/g, ' ');
        let fontSize = 7;
        doc.setFontSize(fontSize);
        const larguraDisponivel = 22 - 4;
        
        while (fontSize > fontSizeMinimo) {
          doc.setFontSize(fontSize);
          const larguraTexto = doc.getTextWidth(textoLimpo);
          if (larguraTexto <= larguraDisponivel) break;
          fontSize -= 0.5;
        }
        fontSize = Math.max(fontSize, fontSizeMinimo);
        if (fontSize < menorFontSize) menorFontSize = fontSize;
      }
    });
    
    // Verificar valor_vencedor (inclui subtotais e total geral)
    const textoVencedor = linha.valor_vencedor || '';
    if (textoVencedor && textoVencedor !== '-') {
      const textoLimpo = String(textoVencedor).replace(/\n/g, ' ');
      let fontSize = 7;
      doc.setFontSize(fontSize);
      const larguraDisponivel = 22 - 4;
      
      while (fontSize > fontSizeMinimo) {
        doc.setFontSize(fontSize);
        const larguraTexto = doc.getTextWidth(textoLimpo);
        if (larguraTexto <= larguraDisponivel) break;
        fontSize -= 0.5;
      }
      fontSize = Math.max(fontSize, fontSizeMinimo);
      if (fontSize < menorFontSize) menorFontSize = fontSize;
    }
  });

  // Gerar tabela
  autoTable(doc, {
    columns: colunas,
    body: dados,
    startY: yPosition,
    margin: { left: margemEsquerda, right: margemDireita, top: 35 },
    theme: 'grid',
    rowPageBreak: 'avoid',
    styles: {
      fontSize: menorFontSize,
      cellPadding: 2,
      overflow: 'linebreak',
      halign: 'center',
      valign: 'middle',
      lineColor: [200, 200, 200],
      lineWidth: 0.1,
      minCellHeight: 12
    },
    headStyles: {
      fillColor: [41, 128, 185],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
      overflow: 'linebreak',
      cellPadding: 2,
      minCellHeight: 18,
      fontSize: 6,
      lineColor: [200, 200, 200],
      lineWidth: 0.1
    },
    columnStyles,
    didParseCell: (data) => {
      if (data.section !== 'body') return;
      
      const linhaAtual = dados[data.row.index];
      
      // Formatar linha de cabeçalho de lote
      if (linhaAtual && linhaAtual.isLoteHeader) {
        data.cell.styles.fillColor = [70, 130, 180];
        data.cell.styles.textColor = [255, 255, 255];
        data.cell.styles.fontStyle = 'bold';
        data.cell.styles.fontSize = 9;
        
        if (data.column.index === 0) {
          data.cell.colSpan = colunas.length;
          data.cell.styles.halign = 'center';
        } else {
          data.cell.text = [''];
        }
        return;
      }
      
      // Formatar linha de subtotal do lote
      if (linhaAtual && linhaAtual.isSubtotal) {
        data.cell.styles.fillColor = [230, 230, 230];
        data.cell.styles.fontStyle = 'bold';
        
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
          data.cell.styles.cellPadding = { top: 3, right: 2, bottom: 3, left: 5 };
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          data.cell.text = [''];
        }
        
        if (data.column.dataKey === 'valor_vencedor' || data.column.dataKey === 'empresa_vencedora') {
          data.cell.styles.textColor = [0, 100, 0];
        }
        
        if (data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
          const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
          const resposta = respostas[fornecedorIdx];
          const loteNumero = linhaAtual._lote_numero;
          
          if (resposta && resposta.rejeitado) {
            data.cell.styles.textColor = [255, 0, 0];
          } else if (resposta && loteNumero) {
            // Critério por lote: itens_rejeitados contém números de LOTE, não de item
            const loteRejeitado = criterioJulgamento === 'por_lote' 
              ? resposta.itens_rejeitados.includes(loteNumero)
              : itens.filter(i => i.lote_numero === loteNumero).every(i => resposta.itens_rejeitados.includes(i.numero_item));
            if (loteRejeitado) {
              data.cell.styles.textColor = [255, 0, 0];
            }
          }
        }
        
        return;
      }
      
      // Destacar linha de total geral
      if (linhaAtual && linhaAtual.isTotalGeral) {
        data.cell.styles.fillColor = [226, 232, 240];
        data.cell.styles.fontStyle = 'bold';
        
        if (data.column.index === 0) {
          data.cell.colSpan = 4;
          data.cell.styles.halign = 'left';
        } else if (data.column.index >= 1 && data.column.index <= 3) {
          data.cell.text = [''];
        }
        
        return;
      }
      
      // Armazenar texto da descrição para justificação (coluna índice 1)
      if (data.column.dataKey === 'descricao' && !linhaAtual?.isLoteHeader && !linhaAtual?.isSubtotal && !linhaAtual?.isTotalGeral) {
        const textoOriginal = Array.isArray(data.cell.text) ? data.cell.text.join(' ') : String(data.cell.text || '');
        if (textoOriginal && textoOriginal.trim()) {
          descricoesPorLinha.set(data.row.index, textoOriginal);
        }
      }
      
      // Marcar empresas/itens inabilitados em vermelho
      if (data.section === 'body' && data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
        const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
        const resposta = respostas[fornecedorIdx];
        const numeroItem = linhaAtual?.item;
        const loteNumero = linhaAtual?._lote_numero;
        
        // Verificar inabilitação
        let estaInabilitado = false;
        if (resposta?.rejeitado) {
          // Fornecedor totalmente rejeitado
          estaInabilitado = true;
        } else if (resposta && typeof loteNumero === 'number' && criterioJulgamento === 'por_lote') {
          // Critério por lote: itens_rejeitados contém números de LOTE
          estaInabilitado = resposta.itens_rejeitados.includes(loteNumero);
        } else if (resposta && typeof numeroItem === 'number') {
          // Outros critérios: itens_rejeitados contém números de ITEM
          estaInabilitado = resposta.itens_rejeitados.includes(numeroItem);
        }
        
        if (estaInabilitado) {
          data.cell.styles.textColor = [255, 0, 0];
          data.cell.styles.fontStyle = 'bold';
        }
      }
      
      // Destacar colunas de vencedor em verde
      if (!linhaAtual?.isLoteHeader && !linhaAtual?.isSubtotal && !linhaAtual?.isTotalGeral && 
          data.section === 'body' && data.column.dataKey && 
          (data.column.dataKey === 'valor_vencedor' || data.column.dataKey === 'empresa_vencedora')) {
        data.cell.styles.textColor = [0, 100, 0];
        data.cell.styles.fontStyle = 'bold';
      }
    },
    didDrawCell: (data) => {
      // Cabeçalho de fornecedor inabilitado em vermelho
      if (data.section === 'head' && data.column.dataKey && typeof data.column.dataKey === 'string' && data.column.dataKey.startsWith('fornecedor_')) {
        const fornecedorIdx = parseInt(data.column.dataKey.replace('fornecedor_', ''));
        const resposta = respostas[fornecedorIdx];
        
        if (resposta && resposta.rejeitado) {
          doc.setFillColor(180, 0, 0);
          doc.rect(data.cell.x, data.cell.y, data.cell.width, data.cell.height, 'F');
          doc.setTextColor(255, 255, 255);
          doc.setFontSize(6);
          doc.setFont("helvetica", "bold");
          
          const textoCompleto = data.cell.text.join(' ');
          const linhas = doc.splitTextToSize(textoCompleto, data.cell.width - 2);
          const alturaLinha = 3;
          const yInicio = data.cell.y + (data.cell.height - (linhas.length * alturaLinha)) / 2 + alturaLinha;
          
          linhas.forEach((linha: string, idx: number) => {
            doc.text(linha, data.cell.x + data.cell.width / 2, yInicio + (idx * alturaLinha), { align: 'center' });
          });
        }
      }
      
      // Desenhar texto justificado na coluna de descrição
      if (data.section === 'body' && data.column.dataKey === 'descricao') {
        const linhaAtual = dados[data.row.index];
        if (linhaAtual?.isLoteHeader || linhaAtual?.isSubtotal || linhaAtual?.isTotalGeral) return;
        
        const textoOriginal = descricoesPorLinha.get(data.row.index);
        if (!textoOriginal) return;
        
        const cell = data.cell;
        const padding = 2;
        const larguraDisponivel = cell.width - (padding * 2);
        
        // Obter cor de fundo atual da célula
        const fillColor = cell.styles.fillColor;
        let bgColor: [number, number, number] = [255, 255, 255];
        if (Array.isArray(fillColor) && fillColor.length >= 3) {
          bgColor = [fillColor[0] as number, fillColor[1] as number, fillColor[2] as number];
        }
        
        // Cobrir o texto original
        doc.setFillColor(bgColor[0], bgColor[1], bgColor[2]);
        doc.rect(cell.x + 0.3, cell.y + 0.3, cell.width - 0.6, cell.height - 0.6, 'F');
        
        // Configurar fonte
        doc.setFontSize(menorFontSize);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(0, 0, 0);
        
        // Quebrar texto em linhas
        const linhasTexto = doc.splitTextToSize(textoOriginal, larguraDisponivel);
        // Altura da linha proporcional ao fontSize (aproximadamente 1.2x o fontSize em mm)
        const alturaLinha = menorFontSize * 0.42;
        
        // Calcular posição Y inicial
        const alturaTextoTotal = linhasTexto.length * alturaLinha;
        const espacoVertical = cell.height - (padding * 2);
        let yInicio: number;
        
        if (alturaTextoTotal < espacoVertical) {
          yInicio = cell.y + (cell.height - alturaTextoTotal) / 2 + alturaLinha * 0.7;
        } else {
          yInicio = cell.y + padding + alturaLinha * 0.7;
        }
        
        // Desenhar cada linha (sem limite de altura - célula já foi dimensionada pelo autoTable)
        for (let i = 0; i < linhasTexto.length; i++) {
          const linha = linhasTexto[i];
          const yLinha = yInicio + (i * alturaLinha);
          
          const palavras = linha.trim().split(/\s+/);
          const x = cell.x + padding;
          
          // Última linha: alinhar à esquerda
          if (i === linhasTexto.length - 1) {
            doc.text(linha, x, yLinha);
            continue;
          }
          
          if (palavras.length <= 1) {
            doc.text(linha, x, yLinha);
            continue;
          }
          
          // Calcular largura total das palavras
          let larguraTotal = 0;
          for (const palavra of palavras) {
            larguraTotal += doc.getTextWidth(palavra);
          }
          
          // Calcular espaço entre palavras para justificar
          const espacoRestante = larguraDisponivel - larguraTotal;
          const espacoPorGap = espacoRestante / (palavras.length - 1);
          
          // Desenhar palavras com espaçamento justificado
          let xAtual = x;
          for (let j = 0; j < palavras.length; j++) {
            doc.text(palavras[j], xAtual, yLinha);
            if (j < palavras.length - 1) {
              xAtual += doc.getTextWidth(palavras[j]) + espacoPorGap;
            }
          }
        }
      }
    },
    didDrawPage: (data) => {
      if (data.pageNumber > 1) {
        adicionarCabecalho();
      }
    }
  });

  // Seção de empresas inabilitadas com motivos
  const empresasInabilitadas = respostas.filter(r => r.rejeitado || r.itens_rejeitados.length > 0);
  
  console.log("📋 Empresas inabilitadas para PDF:", empresasInabilitadas.map(e => ({
    razao: e.fornecedor.razao_social,
    rejeitado: e.rejeitado,
    itens: e.itens_rejeitados
  })));
  
  // CRÍTICO: Obter página atual e posição Y final da tabela
  const paginaAtual = doc.getNumberOfPages();
  const finalY = (doc as any).lastAutoTable?.finalY || 150;
  
  // Calcular espaço necessário para todas empresas inabilitadas
  let espacoNecessario = 20; // Título + margem
  empresasInabilitadas.forEach((empresa) => {
    espacoNecessario += 15; // Razão social + CNPJ
    espacoNecessario += 5; // Status
    if (empresa.motivo_rejeicao) {
      const linhasMotivo = Math.ceil(empresa.motivo_rejeicao.length / 80);
      espacoNecessario += linhasMotivo * 4 + 2;
    }
    espacoNecessario += 3;
  });
  
  // Verificar se precisa nova página para TODAS as empresas inabilitadas
  let currentY = finalY + 10;
  const espacoDisponivel = pageHeight - currentY - 50; // 50 para certificação
  
  console.log("📋 Espaço disponível:", espacoDisponivel, "Espaço necessário:", espacoNecessario);
  
  if (empresasInabilitadas.length > 0) {
    // Se não há espaço suficiente para todas, nova página
    if (espacoDisponivel < espacoNecessario) {
      doc.addPage();
      adicionarCabecalho();
      currentY = 40;
      console.log("📋 Nova página criada para empresas inabilitadas");
    }

    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(180, 0, 0);
    doc.text("EMPRESAS INABILITADAS", margemEsquerda, currentY);
    doc.setTextColor(0, 0, 0);
    currentY += 8;

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");

    empresasInabilitadas.forEach((empresa, index) => {
      console.log(`📋 Renderizando empresa ${index + 1}: ${empresa.fornecedor.razao_social} na Y=${currentY}`);
      
      // Verificar se precisa de nova página para esta empresa
      if (currentY > pageHeight - 50) {
        doc.addPage();
        adicionarCabecalho();
        currentY = 40;
        console.log(`📋 Nova página para empresa ${empresa.fornecedor.razao_social}`);
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
        currentY += motivoLinhas.length * 4 + 4;
      }

      currentY += 5;
    });
  }

  // Certificação Digital - usar currentY diretamente (já rastreia posição correta)
  let certY = currentY + 10;
  
  // Verificar se precisa de nova página para certificação
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

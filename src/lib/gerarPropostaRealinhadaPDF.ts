import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';
import { valorPorExtenso } from './valorPorExtenso';

interface ItemPropostaRealinhada {
  numero_item: number;
  numero_lote?: number | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca: string | null;
  valor_unitario: number;
  valor_total: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  email?: string;
  telefone?: string;
  endereco_comercial?: string | null;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
}

interface DadosProcesso {
  numero_processo_interno: string;
  objeto_resumido: string;
  criterio_julgamento: string;
}

const formatarMoeda = (valor: number): string => {
  return new Intl.NumberFormat('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(valor);
};

const formatarCNPJ = (cnpj: string): string => {
  if (!cnpj) return '';
  const cleaned = cnpj.replace(/\D/g, '');
  return cleaned.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');
};

// Gerar protocolo no formato XXXX-XXXX-XXXX-XXXX
const gerarProtocoloCertificacao = (): string => {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const gerarBloco = () => {
    let bloco = '';
    for (let i = 0; i < 4; i++) {
      bloco += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return bloco;
  };
  return `${gerarBloco()}-${gerarBloco()}-${gerarBloco()}-${gerarBloco()}`;
};

// Sanitizar texto - remove HTML e caracteres especiais
const sanitizarTexto = (texto: string): string => {
  if (!texto) return '';
  return texto
    // Remove tags HTML
    .replace(/<[^>]+>/g, '')
    // Remove entidades HTML
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    // Caracteres especiais
    .replace(/²/g, '2').replace(/₂/g, '2')
    .replace(/³/g, '3').replace(/₃/g, '3')
    .replace(/¹/g, '1').replace(/₁/g, '1')
    .replace(/°/g, 'o').replace(/º/g, 'o').replace(/ª/g, 'a')
    .replace(/µ/g, 'u').replace(/μ/g, 'u')
    .replace(/–/g, '-').replace(/—/g, '-')
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/…/g, '...').replace(/•/g, '-')
    .trim();
};

const desenharLinhasJustificadas = (
  doc: jsPDF,
  linhas: string[],
  x: number,
  y: number,
  largura: number,
  lineHeight: number
) => {
  linhas.forEach((linha, idx) => {
    const yLinha = y + idx * lineHeight;
    const palavras = linha.trim().split(/\s+/).filter(Boolean);
    const isUltimaLinha = idx === linhas.length - 1;

    if (!isUltimaLinha && palavras.length > 1) {
      const larguraTexto = palavras.reduce((acc, p) => acc + doc.getTextWidth(p), 0);
      const espacoTotal = Math.max(0, largura - larguraTexto);
      const espacoPorPalavra = espacoTotal / (palavras.length - 1);

      let xAtual = x;
      palavras.forEach((p, i) => {
        doc.text(p, xAtual, yLinha);
        if (i < palavras.length - 1) xAtual += doc.getTextWidth(p) + espacoPorPalavra;
      });
    } else {
      doc.text(linha, x, yLinha);
    }
  });
};

export const gerarPropostaRealinhadaPDF = async (
  itens: ItemPropostaRealinhada[],
  fornecedor: DadosFornecedor,
  processo: DadosProcesso,
  observacoes?: string,
  tipoProcesso?: string,
  responsavelLegal?: string
): Promise<{ pdfBlob: Blob; pdfUrl: string; protocolo: string }> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Gerar protocolo único no formato padrão XXXX-XXXX-XXXX-XXXX
  const protocolo = gerarProtocoloCertificacao();

  // Header
  doc.setFillColor(0, 75, 140);
  doc.rect(0, 0, pageWidth, 35, 'F');
  
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.text('PROPOSTA REALINHADA', pageWidth / 2, 15, { align: 'center' });
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Protocolo: ${protocolo}`, pageWidth / 2, 25, { align: 'center' });
  doc.text(`Gerado em: ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, 31, { align: 'center' });
  
  yPos = 45;
  doc.setTextColor(0, 0, 0);

  // Dados do Processo - objeto sanitizado, completo e justificado
  const objetoSanitizado = sanitizarTexto(processo.objeto_resumido);

  const larguraBox = pageWidth - margin * 2;
  const paddingBox = 5;
  const xBox = margin;
  const yBox = yPos;

  const xLabel = xBox + paddingBox;
  const xTextoObjeto = xBox + 20;
  const larguraObjeto = xBox + larguraBox - paddingBox - xTextoObjeto;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);

  const objetoLinhas = doc.splitTextToSize(objetoSanitizado, larguraObjeto) as string[];
  const lineHeightObjeto = 4.2;

  const alturaBox = 22 + objetoLinhas.length * lineHeightObjeto;

  doc.setFillColor(240, 240, 240);
  doc.rect(xBox, yBox, larguraBox, alturaBox, 'F');

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO PROCESSO', xLabel, yBox + 6);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Processo: ${processo.numero_processo_interno}`, xLabel, yBox + 13);
  doc.text('Objeto:', xLabel, yBox + 19);

  // Renderizar objeto (justificado e completo)
  doc.setTextColor(0, 0, 0);
  desenharLinhasJustificadas(doc, objetoLinhas, xTextoObjeto, yBox + 19, larguraObjeto, lineHeightObjeto);

  yPos += alturaBox + 7;

  // Dados do Fornecedor - agora com todos os campos
  const temEndereco = fornecedor.logradouro || fornecedor.endereco_comercial;
  const temLocalidade = fornecedor.municipio || fornecedor.uf;
  
  // Calcular altura do box baseada nos campos disponíveis
  let alturaBoxFornecedor = 20; // Base para título + razão social + cnpj
  if (fornecedor.email) alturaBoxFornecedor += 6;
  if (temEndereco) alturaBoxFornecedor += 6;
  if (temLocalidade) alturaBoxFornecedor += 6;
  if (fornecedor.telefone) alturaBoxFornecedor += 6;
  
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPos, pageWidth - margin * 2, alturaBoxFornecedor, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DADOS DO FORNECEDOR', margin + 5, yPos + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  let yFornecedor = yPos + 13;
  
  // Razão Social e CNPJ na mesma linha
  doc.text(`Razão Social: ${fornecedor.razao_social}`, margin + 5, yFornecedor);
  doc.text(`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`, pageWidth - margin - 60, yFornecedor);
  yFornecedor += 6;
  
  // E-mail
  if (fornecedor.email) {
    doc.text(`E-mail: ${fornecedor.email}`, margin + 5, yFornecedor);
    yFornecedor += 6;
  }
  
  // Telefone
  if (fornecedor.telefone) {
    doc.text(`Telefone: ${fornecedor.telefone}`, margin + 5, yFornecedor);
    yFornecedor += 6;
  }
  
  // Endereço
  if (temEndereco) {
    let enderecoCompleto = '';
    if (fornecedor.logradouro) {
      enderecoCompleto = `${fornecedor.logradouro}${fornecedor.numero ? ', ' + fornecedor.numero : ''}${fornecedor.bairro ? ', ' + fornecedor.bairro : ''}`;
    } else if (fornecedor.endereco_comercial) {
      enderecoCompleto = fornecedor.endereco_comercial;
    }
    doc.text(`Endereço: ${enderecoCompleto}`, margin + 5, yFornecedor);
    yFornecedor += 6;
  }
  
  // Município/UF/CEP
  if (temLocalidade) {
    const localidade = `${fornecedor.municipio || ''}${fornecedor.uf ? ' - ' + fornecedor.uf : ''}${fornecedor.cep ? ', CEP: ' + fornecedor.cep : ''}`;
    doc.text(localidade, margin + 5, yFornecedor);
  }
  
  yPos += alturaBoxFornecedor + 7;

  // Verificar se tem lotes (critério por_lote)
  const temLotes = itens.some(item => item.numero_lote && item.numero_lote > 0);
  const criterio = processo.criterio_julgamento;

  // Título da tabela
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ITENS DA PROPOSTA REALINHADA', margin, yPos);
  yPos += 5;

  const ocultarMarca = tipoProcesso && tipoProcesso !== 'material';
  const numCols = ocultarMarca ? 6 : 7;

  // Cabeçalhos da tabela
  const headers = ocultarMarca
    ? [['Item', 'Descrição', 'Qtd', 'Un', 'Vlr Unit.', 'Vlr Total']]
    : [['Item', 'Descrição', 'Qtd', 'Un', 'Marca', 'Vlr Unit.', 'Vlr Total']];

  // Dados da tabela
  let valorTotal = 0;
  const tableData: any[] = [];
  
  // Ordenar itens por numero_item antes de processar
  const itensOrdenados = [...itens].sort((a, b) => a.numero_item - b.numero_item);
  
  // Agrupar por lote se necessário
  if (criterio === 'por_lote' || temLotes) {
    const lotes = new Map<number, ItemPropostaRealinhada[]>();
    itensOrdenados.forEach(item => {
      const lote = item.numero_lote || 0;
      if (!lotes.has(lote)) lotes.set(lote, []);
      lotes.get(lote)!.push(item);
    });

    const lotesOrdenados = Array.from(lotes.entries()).sort((a, b) => a[0] - b[0]);
    
    lotesOrdenados.forEach(([numeroLote, itensLote]) => {
      let subtotalLote = 0;
      
      // Linha de título do lote
      tableData.push([
        { 
          content: `LOTE ${numeroLote}`, 
          colSpan: numCols, 
          styles: { 
            fontStyle: 'bold', 
            fillColor: [220, 220, 220],
            halign: 'left',
            fontSize: 9
          } 
        }
      ]);
      
      itensLote.forEach(item => {
        subtotalLote += item.valor_total;
        valorTotal += item.valor_total;
        const row = ocultarMarca
          ? [item.numero_item.toString(), sanitizarTexto(item.descricao), item.quantidade.toString(), item.unidade, `R$ ${formatarMoeda(item.valor_unitario)}`, `R$ ${formatarMoeda(item.valor_total)}`]
          : [item.numero_item.toString(), sanitizarTexto(item.descricao), item.quantidade.toString(), item.unidade, item.marca || '', `R$ ${formatarMoeda(item.valor_unitario)}`, `R$ ${formatarMoeda(item.valor_total)}`];
        tableData.push(row);
      });
      
      // Linha de subtotal do lote
      tableData.push([
        { content: `SUBTOTAL LOTE ${numeroLote}`, colSpan: numCols - 1, styles: { fontStyle: 'bold', fillColor: [230, 230, 230], halign: 'right' } },
        { content: `R$ ${formatarMoeda(subtotalLote)}`, styles: { fontStyle: 'bold', fillColor: [230, 230, 230], halign: 'right' } }
      ]);
    });
  } else {
    itensOrdenados.forEach(item => {
      valorTotal += item.valor_total;
      const row = ocultarMarca
        ? [item.numero_item.toString(), sanitizarTexto(item.descricao), item.quantidade.toString(), item.unidade, `R$ ${formatarMoeda(item.valor_unitario)}`, `R$ ${formatarMoeda(item.valor_total)}`]
        : [item.numero_item.toString(), sanitizarTexto(item.descricao), item.quantidade.toString(), item.unidade, item.marca || '', `R$ ${formatarMoeda(item.valor_unitario)}`, `R$ ${formatarMoeda(item.valor_total)}`];
      tableData.push(row);
    });
  }

  // Linha de total geral com valor por extenso
  const extensoTotal = valorPorExtenso(valorTotal).toUpperCase();
  tableData.push([
    { content: 'VALOR TOTAL DA PROPOSTA', colSpan: numCols - 1, styles: { fontStyle: 'bold', fillColor: [0, 75, 140], textColor: [255, 255, 255], halign: 'right' } },
    { content: `R$ ${formatarMoeda(valorTotal)}`, styles: { fontStyle: 'bold', fillColor: [0, 75, 140], textColor: [255, 255, 255], halign: 'right' } }
  ]);
  
  // Linha com valor por extenso
  tableData.push([
    { content: `(${extensoTotal})`, colSpan: numCols, styles: { fontStyle: 'normal', fillColor: [0, 75, 140], textColor: [255, 255, 255], halign: 'justify', fontSize: 7 } }
  ]);

  // Gerar tabela com descrição justificada e colunas centralizadas verticalmente
  // Observação importante: quando uma linha “quebra” para a próxima página, o autoTable pode entregar
  // apenas o “segmento” (linhas restantes) naquela página. Para justificar corretamente, precisamos
  // identificar qual é a última linha do TEXTO COMPLETO, não a última linha do segmento.

  type RowKey = string;

  const isSpecialRow = (rowData: any): boolean => {
    if (!Array.isArray(rowData)) return true;
    // Linhas especiais (lote/subtotal/total) não entram no controle
    if (rowData.length === 1 && (rowData[0] as any)?.colSpan) return true;
    if (rowData.length === 2 && (rowData[0] as any)?.colSpan) return true;
    return false;
  };

  const getRowKeyFromRowData = (rowData: any): RowKey | null => {
    if (isSpecialRow(rowData)) return null;

    // A primeira coluna sempre é o número do item nas linhas normais.
    const itemCell = rowData?.[0];
    if (typeof itemCell === 'string' && itemCell.trim()) return `item:${itemCell.trim()}`;

    return null;
  };

  const getKeyFromHookData = (data: any): RowKey | null => {
    // IMPORTANTE: em quebras de página, data.row.index pode variar e/ou não referenciar tableData.
    // O mais confiável é extrair o número do item a partir das células já processadas pelo autoTable.

    // 1) Tentar pelo raw original (quando disponível)
    const rowRaw = data?.row?.raw;
    const keyFromRaw = getRowKeyFromRowData(rowRaw);
    if (keyFromRaw) return keyFromRaw;

    // 2) Tentar pela célula da coluna 0 (Item)
    const itemCell = data?.row?.cells?.[0];
    const itemText =
      Array.isArray(itemCell?.text)
        ? itemCell.text.join(' ').trim()
        : typeof itemCell?.text === 'string'
          ? itemCell.text.trim()
          : typeof itemCell?.raw === 'string'
            ? itemCell.raw.trim()
            : '';

    if (itemText && /^\d+$/.test(itemText)) return `item:${itemText}`;

    // 3) Fallback estável (último recurso)
    if (typeof data?.row?.index === 'number') return `row:${data.row.index}`;
    return null;
  };

  const normalizeTextLines = (text: unknown): string[] => {
    if (Array.isArray(text)) return text.map(String);
    if (typeof text === 'string') return [text];
    return [];
  };

  const findSegmentStartIndex = (fullLines: string[], segmentLines: string[]): number | null => {
    if (fullLines.length === 0 || segmentLines.length === 0) return null;

    const seg0 = segmentLines[0]?.trim();
    if (!seg0) return null;

    // Tenta casar o segmento inteiro (mais robusto em quebras de página)
    for (let i = 0; i <= fullLines.length - segmentLines.length; i++) {
      if (fullLines[i].trim() !== seg0) continue;

      let ok = true;
      for (let j = 0; j < segmentLines.length; j++) {
        if ((fullLines[i + j] ?? '').trim() !== (segmentLines[j] ?? '').trim()) {
          ok = false;
          break;
        }
      }
      if (ok) return i;
    }

    // Fallback: casa só a primeira linha
    const idx = fullLines.findIndex((l) => l.trim() === seg0);
    return idx >= 0 ? idx : null;
  };

  // Para cada item (rowKey), armazenamos as linhas COMPLETAS do texto original
  const fullDescricaoByKey = new Map<RowKey, string[]>();

  // Cursor de “qual linha global estou desenhando agora” por item.
  // Isso resolve o caso onde o autoTable quebra a mesma célula em múltiplas páginas:
  // a última linha do SEGMENTO na página 1 não é a última linha do TEXTO COMPLETO.
  const lineCursorByKey = new Map<RowKey, number>();

  autoTable(doc, {
    head: headers,
    body: tableData,
    startY: yPos,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      overflow: 'linebreak',
      lineColor: [200, 200, 200],
      lineWidth: 0.3,
      textColor: [0, 0, 0]
    },
    bodyStyles: {
      textColor: [0, 0, 0],
      font: 'helvetica',
      fontStyle: 'normal'
    },
    headStyles: {
      fillColor: [0, 75, 140],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      ...(ocultarMarca
        ? {
            0: { cellWidth: 12, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            1: { cellWidth: 75, halign: 'left', valign: 'middle', textColor: [0, 0, 0] },
            2: { cellWidth: 18, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            3: { cellWidth: 18, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            4: { cellWidth: 28, halign: 'right', valign: 'middle', textColor: [0, 0, 0] },
            5: { cellWidth: 29, halign: 'right', valign: 'middle', textColor: [0, 0, 0] },
          }
        : {
            0: { cellWidth: 12, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            1: { cellWidth: 60, halign: 'left', valign: 'middle', textColor: [0, 0, 0] },
            2: { cellWidth: 15, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            3: { cellWidth: 15, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            4: { cellWidth: 25, halign: 'center', valign: 'middle', textColor: [0, 0, 0] },
            5: { cellWidth: 25, halign: 'right', valign: 'middle', textColor: [0, 0, 0] },
            6: { cellWidth: 28, halign: 'right', valign: 'middle', textColor: [0, 0, 0] },
          }),
    },
    rowPageBreak: 'auto',
    didParseCell: (data) => {
      if (data.section !== 'body' || data.column.index !== 1) return;

      const key = getKeyFromHookData(data);
      if (!key) return;

      const rowRaw = (data as any)?.row?.raw;

      // Inicializar cursor sempre (mesmo se o autoTable reprocessar o mesmo item)
      if (!lineCursorByKey.has(key)) lineCursorByKey.set(key, 0);

      // Só calcular uma vez por item
      if (fullDescricaoByKey.has(key)) return;

      const rawText =
        Array.isArray(rowRaw) && typeof rowRaw[1] === 'string'
          ? rowRaw[1]
          : typeof data.cell.raw === 'string'
            ? data.cell.raw
            : normalizeTextLines(data.cell.text).join(' ');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);

      const padding = 3;
      const larguraTexto = data.cell.width - padding * 2;
      const fullLines = doc.splitTextToSize(rawText, larguraTexto) as string[];

      fullDescricaoByKey.set(key, fullLines);
    },
    didDrawCell: (data) => {
      if (data.section !== 'body') return;

      const key = getKeyFromHookData(data);
      if (!key) return;

      const cellX = data.cell.x;
      const cellY = data.cell.y;
      const cellWidth = data.cell.width;
      const cellHeight = data.cell.height;

      // Preencher fundo da célula (cobrir texto padrão do autoTable)
      const fillColor = data.cell.styles.fillColor;
      if (fillColor && Array.isArray(fillColor)) {
        doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(cellX + 0.3, cellY + 0.3, cellWidth - 0.6, cellHeight - 0.6, 'F');

      const fontSize = 8;
      doc.setFontSize(fontSize);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      const padding = 3;
      const textLines = normalizeTextLines(data.cell.text);
      if (textLines.length === 0) return;

      // Converter pt -> mm (jsPDF padrão em mm)
      const PT_TO_MM = 0.3527777778;
      const lineHeightFactor = typeof (doc as any).getLineHeightFactor === 'function' ? (doc as any).getLineHeightFactor() : 1.15;
      const defaultLineHeight = fontSize * PT_TO_MM * lineHeightFactor;
      const availableHeight = Math.max(0, cellHeight - padding * 2);
      const lineHeight = Math.min(defaultLineHeight, availableHeight / textLines.length);

      // IMPORTANTE: descrição não deve centralizar verticalmente, para evitar “cortar” a última linha
      // em células muito próximas da quebra de página.
      const baselineOffset = Math.min(fontSize * PT_TO_MM * 0.8, lineHeight * 0.9);
      const startY = cellY + padding + baselineOffset;

      // Coluna 1 (Descrição): justificar todas exceto a última do TEXTO COMPLETO
      if (data.column.index === 1) {
        const larguraTexto = cellWidth - padding * 2;

        const fullLines = fullDescricaoByKey.get(key) ?? textLines;
        const segmentStart =
          lineCursorByKey.get(key) ?? findSegmentStartIndex(fullLines, textLines) ?? 0;

        textLines.forEach((linha, index) => {
          const yLinha = startY + index * lineHeight;

          // Não cortar - apenas pular se estiver acima do início da célula
          if (yLinha < cellY + 1) return;

          const globalIndex = segmentStart + index;
          const isLastOfFullText = globalIndex === fullLines.length - 1;

          const palavras = linha.trim().split(/\s+/).filter(Boolean);
          const shouldJustify = !isLastOfFullText && palavras.length > 1;

          if (!shouldJustify) {
            doc.text(linha.trim(), cellX + padding, yLinha);
            return;
          }

          const larguraPalavras = palavras.reduce((acc, p) => acc + doc.getTextWidth(p), 0);
          const espacoDisponivel = larguraTexto - larguraPalavras;
          if (espacoDisponivel <= 0) {
            doc.text(linha.trim(), cellX + padding, yLinha);
            return;
          }

          const espacoEntrePalavras = espacoDisponivel / (palavras.length - 1);
          let xAtual = cellX + padding;

          palavras.forEach((p, i) => {
            doc.text(p, xAtual, yLinha);
            if (i < palavras.length - 1) xAtual += doc.getTextWidth(p) + espacoEntrePalavras;
          });
        });

        // Avançar cursor global deste item (suporta célula quebrada em páginas)
        lineCursorByKey.set(key, segmentStart + textLines.length);
        return;
      }

      // Outras colunas: centralizar verticalmente (mantém o comportamento original)
      {
        const totalTextHeight = textLines.length * lineHeight;
        const startYCenter = cellY + Math.max((cellHeight - totalTextHeight) / 2, padding) + baselineOffset;

        textLines.forEach((linha, index) => {
          const yLinha = startYCenter + index * lineHeight;

          if (data.column.index === 5 || data.column.index === 6) {
            doc.text(linha.trim(), cellX + cellWidth - padding, yLinha, { align: 'right' });
          } else {
            doc.text(linha.trim(), cellX + cellWidth / 2, yLinha, { align: 'center' });
          }
        });
      }
    }
  });

  // Observações (se houver) - logo abaixo da tabela
  let finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
  
  if (observacoes && observacoes.trim()) {
    const textoObservacoes = sanitizarTexto(observacoes);
    const larguraTextoObs = pageWidth - margin * 2 - 10; // Padding interno do box
    
    // IMPORTANTE: definir fonte ANTES de splitTextToSize para calcular quebra correta
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    
    const obsLines = doc.splitTextToSize(textoObservacoes, larguraTextoObs);
    const lineHeight = 4;
    const alturaTexto = obsLines.length * lineHeight;
    const alturaBox = alturaTexto + 18; // Título + padding
    // Verificar se cabe na página atual
    // Observação deve aproveitar o espaço disponível; a certificação pode ir para a próxima página se necessário.
    const espacoDisponivel = pageHeight - finalY - 20; // 20mm de área segura (rodapé em y=pageHeight-10)
    if (alturaBox > espacoDisponivel) {
      doc.addPage();
      finalY = margin;
    } else {
      finalY += 8; // Espaçamento após tabela
    }

    // Box cinza para observações (igual ao box de dados do fornecedor)
    doc.setFillColor(245, 245, 245);
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margin, finalY, pageWidth - margin * 2, alturaBox, 'FD');
    
    // Título "OBSERVAÇÕES" em vermelho e negrito
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(180, 0, 0);
    doc.text('OBSERVAÇÕES:', margin + 5, finalY + 6);
    
    // Texto justificado em vermelho
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(180, 0, 0);
    
    const xTexto = margin + 5;
    let yTexto = finalY + 12;
    
    obsLines.forEach((linha: string, index: number) => {
      const isUltimaLinha = index === obsLines.length - 1;
      
      if (isUltimaLinha || obsLines.length === 1) {
        // Última linha: alinhamento à esquerda
        doc.text(linha.trim(), xTexto, yTexto);
      } else {
        // Linhas intermediárias: justificar
        const palavras = linha.trim().split(/\s+/).filter((p: string) => p.length > 0);
        if (palavras.length > 1) {
          let larguraPalavras = 0;
          palavras.forEach((palavra: string) => {
            larguraPalavras += doc.getTextWidth(palavra);
          });
          const espacoDisponivel = larguraTextoObs - larguraPalavras;
          const espacoEntrePalavras = espacoDisponivel / (palavras.length - 1);
          
          let xAtual = xTexto;
          palavras.forEach((palavra: string, idx: number) => {
            doc.text(palavra, xAtual, yTexto);
            if (idx < palavras.length - 1) {
              xAtual += doc.getTextWidth(palavra) + espacoEntrePalavras;
            }
          });
        } else {
          doc.text(linha.trim(), xTexto, yTexto);
        }
      }
      yTexto += lineHeight;
    });
    
    // Restaurar cor do texto
    doc.setTextColor(0, 0, 0);
    
    finalY += alturaBox + 3;
  }

  // Declarações obrigatórias (igual às propostas de seleção e cotação)
  finalY += 8; // Espaço adicional após o valor por extenso
  
  const larguraDeclaracao = pageWidth - margin * 2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
  doc.text('Observações:', margin, finalY);
  finalY += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  
  const declaracao1 = 'Declaramos estar ciente e concordar integralmente com os termos e condições contidas no Termo de Referência e/ou Instrumento Convocatório.';
  const declaracao2 = 'Validade da proposta: 60 dias.';
  
  const decl1Lines = doc.splitTextToSize(declaracao1, larguraDeclaracao) as string[];
  
  // Verificar se cabe na página
  if (finalY + (decl1Lines.length * 5) + 15 > pageHeight - 20) {
    doc.addPage();
    finalY = margin;
  }
  
  doc.text(decl1Lines, margin, finalY);
  finalY += decl1Lines.length * 5 + 3;
  
  doc.text(declaracao2, margin, finalY);
  finalY += 8;

  // Certificação Digital Simplificada
  const totalPages = doc.getNumberOfPages();
  
  // Adicionar certificação na última página
  doc.setPage(totalPages);
  
  // Verificar se há espaço para certificação, senão adicionar nova página
  const espacoNecessario = 45;
  if (finalY + espacoNecessario > pageHeight - 20) {
    doc.addPage();
    finalY = margin;
  } else {
    finalY += 10;
  }
  
  // Link de verificação no formato correto
  const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;
  
  // Box de certificação
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margin, finalY, pageWidth - margin * 2, 45, 'FD');
  
  doc.setTextColor(0, 0, 139);
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, finalY + 8, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Responsável: ${responsavelLegal || fornecedor.razao_social}`, margin + 5, finalY + 16);
  const dataHoraEmissaoReal = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  doc.text(`Data/Hora de Emissão: ${dataHoraEmissaoReal}`, margin + 5, finalY + 22);
  doc.text(`Protocolo: ${protocolo}`, margin + 5, finalY + 28);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Verificar autenticidade em:', margin + 5, finalY + 34);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 255);
  doc.textWithLink(linkVerificacao, margin + 5, finalY + 33, { url: linkVerificacao });
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.text('Este documento possui certificação digital conforme Lei 14.063/2020', margin + 5, finalY + 40);

  // Rodapé em todas as páginas - apenas paginação
  const totalPagesAfter = doc.getNumberOfPages();
  for (let i = 1; i <= totalPagesAfter; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Página ${i} de ${totalPagesAfter}`,
      pageWidth / 2,
      pageHeight - 10,
      { align: 'center' }
    );
  }

  // Converter para Blob
  const pdfBlob = doc.output('blob');

  // Salvar no storage
  const timestamp = Date.now();
  const nomeArquivo = `proposta_realinhada_${protocolo.replace(/-/g, '_')}_${timestamp}.pdf`;
  const storagePath = `propostas_realinhadas/${nomeArquivo}`;

  const { error: uploadError } = await supabase.storage
    .from('processo-anexos')
    .upload(storagePath, pdfBlob, {
      contentType: 'application/pdf',
      upsert: true
    });

  if (uploadError) {
    console.error('Erro ao fazer upload do PDF:', uploadError);
    throw uploadError;
  }

  const { data: urlData } = supabase.storage
    .from('processo-anexos')
    .getPublicUrl(storagePath);

  return {
    pdfBlob,
    pdfUrl: urlData.publicUrl,
    protocolo
  };
};

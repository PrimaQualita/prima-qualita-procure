import ExcelJS from 'exceljs';

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

const formatarCNPJ = (cnpj: string) =>
  cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, '$1.$2.$3/$4-$5');

const toRoman = (num: number): string => {
  const r: [number, string][] = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let out = '';
  for (const [v, s] of r) {
    while (num >= v) { out += s; num -= v; }
  }
  return out;
};

const stripHtml = (t: string) => {
  if (!t) return '';
  const ta = document.createElement('textarea');
  ta.innerHTML = t;
  return ta.value.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
};

const COR_HEADER = 'FF78BEE1';
const COR_LOTE = 'FF4682B4';
const COR_SUBTOTAL = 'FFE6E6E6';
const COR_TOTAL = 'FFB4B4B4';
const COR_ALT = 'FFCFEEF7';

const ehPrecoPublico = (email?: string) => !!(email && email.includes('precos.publicos'));

export async function gerarPlanilhaConsolidadaExcel(
  processo: { numero: string; objeto: string },
  cotacao: { titulo_cotacao: string },
  itens: ItemCotacao[],
  respostas: RespostaFornecedor[],
  estimativasCalculadas: Record<string, number> = {},
  criterioJulgamento?: string,
): Promise<Blob> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Planilha Consolidada', {
    views: [{ state: 'frozen', ySplit: 0, xSplit: 0 }],
    pageSetup: { orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
  });

  const numFornecedores = respostas.length;
  const totalCols = 4 + numFornecedores + 1; // Item, Desc, Qtd, Unid + fornecedores + estimativa

  // Cabeçalho informativo
  let row = 1;
  ws.mergeCells(row, 1, row, totalCols);
  const cTitulo = ws.getCell(row, 1);
  cTitulo.value = `PLANILHA CONSOLIDADA DE PROPOSTAS — PROCESSO ${processo.numero}`;
  cTitulo.font = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  cTitulo.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER } };
  cTitulo.alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(row).height = 24;
  row++;

  ws.mergeCells(row, 1, row, totalCols);
  const cObj = ws.getCell(row, 1);
  cObj.value = `Objeto: ${stripHtml(processo.objeto)}`;
  cObj.alignment = { horizontal: 'left', vertical: 'middle', wrapText: true };
  cObj.font = { size: 10 };
  row++;

  ws.mergeCells(row, 1, row, totalCols);
  ws.getCell(row, 1).value = `Cotação: ${cotacao.titulo_cotacao}`;
  ws.getCell(row, 1).font = { size: 10 };
  row++;

  ws.mergeCells(row, 1, row, totalCols);
  ws.getCell(row, 1).value = `Data de Geração: ${new Date().toLocaleString('pt-BR')}`;
  ws.getCell(row, 1).font = { size: 10 };
  row++;

  row++; // espaço

  // Header da tabela
  const headerRow = row;
  const headers: string[] = ['Item', 'Descrição', 'Qtd', 'Unid.'];
  respostas.forEach((r) => {
    const rs = (r.fornecedor.razao_social || '').toUpperCase();
    if (ehPrecoPublico(r.fornecedor.email)) {
      headers.push(rs);
    } else {
      headers.push(`${rs}\nCNPJ: ${formatarCNPJ(r.fornecedor.cnpj)}\n${(r.fornecedor.email || '').toLowerCase()}`);
    }
  });
  headers.push('Estimativa');

  headers.forEach((h, i) => {
    const c = ws.getCell(headerRow, i + 1);
    c.value = h;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_HEADER } };
    c.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    c.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });
  ws.getRow(headerRow).height = 50;
  row++;

  // Larguras
  ws.getColumn(1).width = 8;
  ws.getColumn(2).width = 50;
  ws.getColumn(3).width = 10;
  ws.getColumn(4).width = 12;
  for (let i = 5; i <= totalCols; i++) ws.getColumn(i).width = 22;

  // Agrupar por lote
  const itensComLote = itens.filter((i) => i.lote_numero && i.lote_numero > 0);
  const itensSemLote = itens.filter((i) => !i.lote_numero || i.lote_numero <= 0);
  const temLotes = itensComLote.length > 0;

  const isDesconto = criterioJulgamento === 'desconto';
  const fmtMoeda = '"R$" #,##0.00;[Red]-"R$" #,##0.00';
  const fmtPercent = '0.00%';

  const totaisFornecedor: Record<string, number> = {};
  respostas.forEach((r) => { totaisFornecedor[r.fornecedor.cnpj] = 0; });
  let totalEstimativa = 0;

  let altIdx = 0;

  const writeItem = (item: ItemCotacao) => {
    const r = row;
    const valoresRow = ws.getRow(r);
    valoresRow.getCell(1).value = item.numero_item;
    valoresRow.getCell(2).value = stripHtml(item.descricao);
    valoresRow.getCell(3).value = item.quantidade;
    valoresRow.getCell(4).value = item.unidade;

    let subtotalLote = 0;
    respostas.forEach((resp, idx) => {
      const ri = resp.itens.find(
        (x) => x.numero_item === item.numero_item &&
          (item.lote_numero ? x.lote_numero === item.lote_numero : !x.lote_numero),
      );
      const cell = valoresRow.getCell(5 + idx);
      if (ri) {
        if (isDesconto) {
          const p = typeof ri.percentual_desconto === 'number' ? ri.percentual_desconto : 0;
          if (p > 0) {
            cell.value = p / 100;
            cell.numFmt = fmtPercent;
          } else cell.value = '-';
        } else {
          const v = typeof ri.valor_unitario_ofertado === 'number' ? ri.valor_unitario_ofertado : 0;
          if (v > 0) {
            cell.value = v;
            cell.numFmt = fmtMoeda;
            totaisFornecedor[resp.fornecedor.cnpj] += v * item.quantidade;
          } else cell.value = '-';
        }
      } else {
        cell.value = '-';
      }
    });

    // Estimativa
    const chave = criterioJulgamento === 'por_lote' && item.lote_numero
      ? `${item.lote_numero}_${item.numero_item}`
      : String(item.numero_item);
    const estVal = estimativasCalculadas[chave] || 0;
    const estCell = valoresRow.getCell(totalCols);
    if (estVal > 0) {
      if (isDesconto) {
        estCell.value = estVal / 100;
        estCell.numFmt = fmtPercent;
      } else {
        estCell.value = estVal;
        estCell.numFmt = fmtMoeda;
        totalEstimativa += estVal * item.quantidade;
      }
    } else {
      estCell.value = '-';
    }

    // Estilo
    const fillAlt = altIdx % 2 === 1 ? COR_ALT : null;
    altIdx++;
    for (let c = 1; c <= totalCols; c++) {
      const cell = valoresRow.getCell(c);
      cell.alignment = {
        horizontal: c === 2 ? 'left' : 'center',
        vertical: 'middle',
        wrapText: c === 2,
      };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
        right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      };
      if (fillAlt) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fillAlt } };
      }
    }
    valoresRow.height = 30;
    row++;
  };

  const writeLoteHeader = (loteNum: number, descricao: string) => {
    ws.mergeCells(row, 1, row, totalCols);
    const c = ws.getCell(row, 1);
    c.value = `LOTE ${toRoman(loteNum)} - ${descricao}`;
    c.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_LOTE } };
    c.alignment = { horizontal: 'center', vertical: 'middle' };
    ws.getRow(row).height = 22;
    row++;
    altIdx = 0;
  };

  const writeSubtotalLote = (loteNum: number, subtotaisFornecedor: Record<string, number>, subtotalEst: number) => {
    if (isDesconto) return;
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    c.value = `SUBTOTAL LOTE ${toRoman(loteNum)}`;
    c.font = { bold: true };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    for (let i = 1; i <= 4; i++) {
      ws.getCell(row, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUBTOTAL } };
    }
    respostas.forEach((r, idx) => {
      const cell = ws.getCell(row, 5 + idx);
      cell.value = subtotaisFornecedor[r.fornecedor.cnpj] || 0;
      cell.numFmt = fmtMoeda;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUBTOTAL } };
    });
    const estC = ws.getCell(row, totalCols);
    estC.value = subtotalEst;
    estC.numFmt = fmtMoeda;
    estC.font = { bold: true };
    estC.alignment = { horizontal: 'center', vertical: 'middle' };
    estC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_SUBTOTAL } };
    row++;
  };

  if (temLotes) {
    const lotesMap = new Map<number, { descricao: string; itens: ItemCotacao[] }>();
    itensComLote.forEach((it) => {
      if (!lotesMap.has(it.lote_numero!)) {
        lotesMap.set(it.lote_numero!, { descricao: it.lote_descricao || `Lote ${it.lote_numero}`, itens: [] });
      }
      lotesMap.get(it.lote_numero!)!.itens.push(it);
    });
    const ordenados = Array.from(lotesMap.entries()).sort((a, b) => a[0] - b[0]);
    ordenados.forEach(([loteNum, ld]) => {
      writeLoteHeader(loteNum, ld.descricao);
      const subF: Record<string, number> = {};
      respostas.forEach((r) => { subF[r.fornecedor.cnpj] = 0; });
      let subEst = 0;
      ld.itens.sort((a, b) => a.numero_item - b.numero_item).forEach((it) => {
        // somar subtotal por fornecedor
        respostas.forEach((resp) => {
          const ri = resp.itens.find(
            (x) => x.numero_item === it.numero_item && x.lote_numero === loteNum,
          );
          if (ri && typeof ri.valor_unitario_ofertado === 'number') {
            subF[resp.fornecedor.cnpj] += ri.valor_unitario_ofertado * it.quantidade;
          }
        });
        const chave = criterioJulgamento === 'por_lote'
          ? `${loteNum}_${it.numero_item}`
          : String(it.numero_item);
        subEst += (estimativasCalculadas[chave] || 0) * it.quantidade;
        writeItem(it);
      });
      writeSubtotalLote(loteNum, subF, subEst);
    });
    if (itensSemLote.length > 0) {
      itensSemLote.forEach(writeItem);
    }
  } else {
    itens.forEach(writeItem);
  }

  // Total Geral
  if (!isDesconto) {
    ws.mergeCells(row, 1, row, 4);
    const c = ws.getCell(row, 1);
    c.value = 'VALOR TOTAL';
    c.font = { bold: true, size: 11 };
    c.alignment = { horizontal: 'left', vertical: 'middle', indent: 1 };
    for (let i = 1; i <= 4; i++) {
      ws.getCell(row, i).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL } };
    }
    respostas.forEach((r, idx) => {
      const cell = ws.getCell(row, 5 + idx);
      cell.value = totaisFornecedor[r.fornecedor.cnpj] || 0;
      cell.numFmt = fmtMoeda;
      cell.font = { bold: true };
      cell.alignment = { horizontal: 'center', vertical: 'middle' };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL } };
    });
    const estC = ws.getCell(row, totalCols);
    estC.value = totalEstimativa;
    estC.numFmt = fmtMoeda;
    estC.font = { bold: true };
    estC.alignment = { horizontal: 'center', vertical: 'middle' };
    estC.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: COR_TOTAL } };
    ws.getRow(row).height = 22;
  }

  const buf = await wb.xlsx.writeBuffer();
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

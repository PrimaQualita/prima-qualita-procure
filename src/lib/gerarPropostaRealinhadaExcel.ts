import ExcelJS from 'exceljs';

interface ItemRealinhado {
  numero_item: number;
  numero_lote?: number | null;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca?: string | null;
  valor_unitario: number;
  valor_total: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  email?: string;
  telefone?: string;
  endereco_comercial?: string;
}

interface DadosProcesso {
  numero_processo_interno: string;
  objeto_resumido: string;
  criterio_julgamento?: string;
}

const formatarCNPJ = (cnpj: string): string => {
  const n = cnpj.replace(/[^\d]/g, '');
  if (n.length !== 14) return cnpj;
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12,14)}`;
};

export async function gerarPropostaRealinhadaExcel(
  itens: ItemRealinhado[],
  fornecedor: DadosFornecedor,
  processo: DadosProcesso,
  observacoes?: string,
  tipoProcesso?: string,
  responsavelLegal?: string
): Promise<void> {
  const ocultarMarca = tipoProcesso && tipoProcesso !== 'material';
  const ehPorLote = processo.criterio_julgamento === 'por_lote';

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Proposta Realinhada');

  const corPrimaria = '006666';
  const corFundo = 'D1F7F7';
  const corSecundaria = '006699';

  // ========== CABEÇALHO ==========
  const headerRow = ws.addRow(['PROPOSTA DE PREÇOS REALINHADA']);
  headerRow.height = 36;
  headerRow.getCell(1).font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
  headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('A1:G1');

  const refRow = ws.addRow([`Ref. Processo: ${processo.numero_processo_interno}`]);
  refRow.height = 22;
  refRow.getCell(1).font = { size: 11, color: { argb: 'FFFFFFFF' } };
  refRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
  refRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('A2:G2');

  ws.addRow([]);

  // ========== DADOS DO FORNECEDOR ==========
  const fornTitleRow = ws.addRow(['DADOS DO FORNECEDOR']);
  fornTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF004747' } };
  fornTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
  ws.mergeCells(`A${fornTitleRow.number}:G${fornTitleRow.number}`);

  const rows = [
    [`Razão Social: ${fornecedor.razao_social}`],
    [`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`],
  ];
  if (fornecedor.endereco_comercial) rows.push([`Endereço: ${fornecedor.endereco_comercial}`]);
  const extras: string[] = [];
  if (fornecedor.telefone) extras.push(`Telefone: ${fornecedor.telefone}`);
  if (fornecedor.email) extras.push(`E-mail: ${fornecedor.email}`);
  if (extras.length > 0) rows.push([extras.join(' | ')]);

  rows.forEach(r => {
    const row = ws.addRow(r);
    row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
    ws.mergeCells(`A${row.number}:G${row.number}`);
  });

  ws.addRow([]);

  // ========== TABELA DE ITENS ==========
  const secTitleRow = ws.addRow(['ITENS DA PROPOSTA REALINHADA']);
  secTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: `FF${corPrimaria}` } };
  ws.mergeCells(`A${secTitleRow.number}:G${secTitleRow.number}`);

  let headers: string[];
  if (ocultarMarca) {
    headers = ['Item', 'Descrição', 'Qtd', 'Unidade', 'Valor Unit.', 'Valor Total'];
  } else {
    headers = ['Item', 'Descrição', 'Marca', 'Qtd', 'Unidade', 'Valor Unit.', 'Valor Total'];
  }

  const headerDataRow = ws.addRow(headers);
  headerDataRow.eachCell((cell) => {
    cell.font = { bold: true, size: 10, color: { argb: 'FFFFFFFF' } };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
    cell.alignment = { horizontal: 'center', vertical: 'middle' };
    cell.border = {
      top: { style: 'thin' }, bottom: { style: 'thin' },
      left: { style: 'thin' }, right: { style: 'thin' },
    };
  });

  let somaTotal = 0;

  const addItemRow = (item: ItemRealinhado, isEven: boolean) => {
    let rowData: any[];
    if (ocultarMarca) {
      rowData = [item.numero_item, item.descricao, item.quantidade, item.unidade, item.valor_unitario, item.valor_total];
    } else {
      rowData = [item.numero_item, item.descricao, item.marca || '', item.quantidade, item.unidade, item.valor_unitario, item.valor_total];
    }

    const row = ws.addRow(rowData);
    const bgColor = isEven ? 'FFF5FAFA' : 'FFFFFFFF';
    row.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    const valUnitCol = ocultarMarca ? 5 : 6;
    const valTotalCol = ocultarMarca ? 6 : 7;
    row.getCell(valUnitCol).numFmt = '#,##0.00';
    row.getCell(valTotalCol).numFmt = '#,##0.00';
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
    somaTotal += item.valor_total;
  };

  if (ehPorLote) {
    // Group by lote
    const lotes = new Map<number, ItemRealinhado[]>();
    for (const item of itens) {
      const lote = item.numero_lote ?? 0;
      if (!lotes.has(lote)) lotes.set(lote, []);
      lotes.get(lote)!.push(item);
    }

    const lotesOrdenados = Array.from(lotes.entries()).sort((a, b) => a[0] - b[0]);
    let idx = 0;

    for (const [numeroLote, itensDoLote] of lotesOrdenados) {
      if (numeroLote > 0) {
        const loteRow = ws.addRow([`LOTE ${numeroLote}`]);
        loteRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
        loteRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corSecundaria}` } };
        ws.mergeCells(`A${loteRow.number}:${String.fromCharCode(64 + headers.length)}${loteRow.number}`);
      }

      let subtotal = 0;
      for (const item of itensDoLote) {
        addItemRow(item, idx % 2 === 0);
        subtotal += item.valor_total;
        idx++;
      }

      const subtotalRow = ws.addRow([]);
      const lastCol = headers.length;
      subtotalRow.getCell(lastCol - 1).value = `Subtotal Lote ${numeroLote}:`;
      subtotalRow.getCell(lastCol - 1).font = { bold: true };
      subtotalRow.getCell(lastCol - 1).alignment = { horizontal: 'right' };
      subtotalRow.getCell(lastCol).value = subtotal;
      subtotalRow.getCell(lastCol).numFmt = '#,##0.00';
      subtotalRow.getCell(lastCol).font = { bold: true };
      for (let c = 1; c <= lastCol; c++) {
        subtotalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFCFEEF7' } };
      }
    }
  } else {
    itens.forEach((item, idx) => addItemRow(item, idx % 2 === 0));
  }

  // ========== TOTAL ==========
  ws.addRow([]);
  const totalRow = ws.addRow([]);
  const lastCol = headers.length;
  totalRow.getCell(lastCol - 1).value = 'VALOR TOTAL REALINHADO:';
  totalRow.getCell(lastCol - 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  totalRow.getCell(lastCol - 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
  totalRow.getCell(lastCol - 1).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(lastCol).value = somaTotal;
  totalRow.getCell(lastCol).numFmt = '#,##0.00';
  totalRow.getCell(lastCol).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
  totalRow.getCell(lastCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
  totalRow.getCell(lastCol).alignment = { horizontal: 'right', vertical: 'middle' };

  // ========== OBSERVAÇÕES ==========
  if (observacoes) {
    ws.addRow([]);
    const obsTitle = ws.addRow(['OBSERVAÇÕES']);
    obsTitle.getCell(1).font = { bold: true, size: 11, color: { argb: `FF${corPrimaria}` } };
    ws.mergeCells(`A${obsTitle.number}:G${obsTitle.number}`);
    const obsRow = ws.addRow([observacoes]);
    obsRow.getCell(1).alignment = { wrapText: true };
    ws.mergeCells(`A${obsRow.number}:G${obsRow.number}`);
  }

  if (responsavelLegal) {
    ws.addRow([]);
    const rlRow = ws.addRow([`Responsável Legal: ${responsavelLegal}`]);
    rlRow.getCell(1).font = { bold: true };
    ws.mergeCells(`A${rlRow.number}:G${rlRow.number}`);
  }

  // ========== LARGURAS ==========
  if (ocultarMarca) {
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 18;
    ws.getColumn(6).width = 18;
  } else {
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 45;
    ws.getColumn(3).width = 18;
    ws.getColumn(4).width = 10;
    ws.getColumn(5).width = 10;
    ws.getColumn(6).width = 18;
    ws.getColumn(7).width = 18;
  }

  ws.addRow([]);
  const dataRow = ws.addRow([`Gerado em: ${new Date().toLocaleString('pt-BR')}`]);
  dataRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `Proposta_Realinhada_${fornecedor.razao_social.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.xlsx`;
  link.click();
  URL.revokeObjectURL(url);
}

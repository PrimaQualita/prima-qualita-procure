import ExcelJS from 'exceljs';
import { supabase } from '@/integrations/supabase/client';

const formatarCNPJ = (cnpj: string): string => {
  const n = cnpj.replace(/[^\d]/g, '');
  if (n.length !== 14) return cnpj;
  return `${n.slice(0,2)}.${n.slice(2,5)}.${n.slice(5,8)}/${n.slice(8,12)}-${n.slice(12,14)}`;
};

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  endereco_comercial: string;
  email?: string;
  telefone?: string;
}

export async function gerarPropostaFornecedorExcel(
  respostaId: string,
  fornecedor: DadosFornecedor,
  valorTotal: number,
  observacoes: string | null,
  tituloCotacao: string,
  usuarioNome?: string,
  usuarioCpf?: string,
  criterioJulgamento?: string,
  responsavelLegal?: string,
  tipoProcesso?: string
): Promise<void> {
  // Auto-detectar tipo do processo
  let tipoProcessoResolvido = tipoProcesso;
  if (!tipoProcessoResolvido) {
    const { data: respostaData } = await supabase
      .from('cotacao_respostas_fornecedor')
      .select('cotacao_id, cotacoes_precos!inner(processo_compra_id, processos_compras!inner(tipo))')
      .eq('id', respostaId)
      .single();
    if (respostaData) {
      tipoProcessoResolvido = (respostaData as any)?.cotacoes_precos?.processos_compras?.tipo;
    }
  }

  // Buscar itens
  const { data: itens, error: itensError } = await supabase
    .from('respostas_itens_fornecedor')
    .select(`
      valor_unitario_ofertado,
      percentual_desconto,
      marca,
      item_cotacao_id,
      itens_cotacao!inner (
        numero_item,
        descricao,
        quantidade,
        unidade,
        lote_id,
        lotes_cotacao (
          id,
          numero_lote,
          descricao_lote
        )
      )
    `)
    .eq('cotacao_resposta_fornecedor_id', respostaId);

  if (itensError) throw itensError;
  if (!itens || itens.length === 0) throw new Error('Nenhum item encontrado para esta proposta');

  // Lotes map
  let lotesMap: Map<string, { numero_lote: number; descricao_lote: string }> = new Map();
  if (criterioJulgamento === 'por_lote') {
    itens.forEach((item: any) => {
      const ic = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
      if (ic?.lote_id && ic?.lotes_cotacao) {
        if (!lotesMap.has(ic.lote_id)) {
          lotesMap.set(ic.lote_id, { numero_lote: ic.lotes_cotacao.numero_lote, descricao_lote: ic.lotes_cotacao.descricao_lote });
        }
      }
    });
  }

  const itensOrdenados = itens.sort((a: any, b: any) => {
    const itemA = Array.isArray(a.itens_cotacao) ? a.itens_cotacao[0] : a.itens_cotacao;
    const itemB = Array.isArray(b.itens_cotacao) ? b.itens_cotacao[0] : b.itens_cotacao;
    return (itemA?.numero_item || 0) - (itemB?.numero_item || 0);
  });

  const ehPrecoPublico = (fornecedor as any).email?.includes('precos.publicos');
  const ocultarMarca = ehPrecoPublico || (tipoProcessoResolvido && tipoProcessoResolvido !== 'material');
  const ehDesconto = criterioJulgamento === 'desconto';
  const ehPorLote = criterioJulgamento === 'por_lote';

  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet('Proposta');

  const corPrimaria = '006666';
  const corFundo = 'D1F7F7';
  const corBranca = 'FFFFFF';
  const corSecundaria = '006699';

  // ========== CABEÇALHO ==========
  const tituloDoc = ehPrecoPublico ? 'PROPOSTA DE PREÇOS PÚBLICOS' : 'PROPOSTA DE PREÇOS';
  const headerRow = ws.addRow([tituloDoc]);
  headerRow.height = 36;
  headerRow.getCell(1).font = { bold: true, size: 18, color: { argb: 'FFFFFFFF' } };
  headerRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
  headerRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('A1:G1');

  const refRow = ws.addRow([`Ref. Processo: ${tituloCotacao}`]);
  refRow.height = 22;
  refRow.getCell(1).font = { size: 11, color: { argb: 'FFFFFFFF' } };
  refRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
  refRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  ws.mergeCells('A2:G2');

  ws.addRow([]);

  // ========== DADOS DO FORNECEDOR ==========
  const tituloForn = ehPrecoPublico ? 'FONTE DOS PREÇOS' : 'DADOS DO FORNECEDOR';
  const fornTitleRow = ws.addRow([tituloForn]);
  fornTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: 'FF004747' } };
  fornTitleRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
  ws.mergeCells(`A${fornTitleRow.number}:G${fornTitleRow.number}`);

  if (ehPrecoPublico) {
    const r = ws.addRow([`Fonte: ${fornecedor.razao_social}`]);
    r.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
    ws.mergeCells(`A${r.number}:G${r.number}`);
  } else {
    const rows = [
      [`Razão Social: ${fornecedor.razao_social}`],
      [`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`],
    ];
    if (fornecedor.endereco_comercial) rows.push([`Endereço: ${fornecedor.endereco_comercial}`]);
    const extras: string[] = [];
    if ((fornecedor as any).telefone) extras.push(`Telefone: ${(fornecedor as any).telefone}`);
    if ((fornecedor as any).email) extras.push(`E-mail: ${(fornecedor as any).email}`);
    if (extras.length > 0) rows.push([extras.join(' | ')]);

    rows.forEach(r => {
      const row = ws.addRow(r);
      row.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
      ws.mergeCells(`A${row.number}:G${row.number}`);
    });
  }

  if (ehPrecoPublico && usuarioNome) {
    const r1 = ws.addRow([`Responsável: ${usuarioNome}`]);
    r1.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
    ws.mergeCells(`A${r1.number}:G${r1.number}`);
    if (usuarioCpf) {
      const r2 = ws.addRow([`CPF: ${usuarioCpf}`]);
      r2.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corFundo}` } };
      ws.mergeCells(`A${r2.number}:G${r2.number}`);
    }
  }

  ws.addRow([]);

  // ========== TABELA DE ITENS ==========
  const secTitleRow = ws.addRow(['ITENS DA PROPOSTA']);
  secTitleRow.getCell(1).font = { bold: true, size: 12, color: { argb: `FF${corPrimaria}` } };
  ws.mergeCells(`A${secTitleRow.number}:G${secTitleRow.number}`);

  // Headers
  let headers: string[];
  if (ehDesconto) {
    headers = ['Item', 'Descrição', 'Qtd', 'Unidade', '% Desconto'];
  } else if (ocultarMarca) {
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
  const dataStartRow = ws.rowCount + 1;

  const addItemRow = (item: any, isEven: boolean) => {
    const itemCot: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
    if (!itemCot) return;

    const valorUnitario = ehDesconto ? (item.percentual_desconto || 0) : (item.valor_unitario_ofertado || 0);
    const valorTotalItem = valorUnitario * itemCot.quantidade;
    if (!ehDesconto) somaTotal += valorTotalItem;

    let rowData: any[];
    if (ehDesconto) {
      rowData = [
        itemCot.numero_item,
        itemCot.descricao || '',
        itemCot.quantidade,
        itemCot.unidade || '',
        valorUnitario > 0 ? valorUnitario / 100 : 0,
      ];
    } else if (ocultarMarca) {
      rowData = [
        itemCot.numero_item,
        itemCot.descricao || '',
        itemCot.quantidade,
        itemCot.unidade || '',
        valorUnitario,
        valorTotalItem,
      ];
    } else {
      rowData = [
        itemCot.numero_item,
        itemCot.descricao || '',
        item.marca || '',
        itemCot.quantidade,
        itemCot.unidade || '',
        valorUnitario,
        valorTotalItem,
      ];
    }

    const row = ws.addRow(rowData);
    const bgColor = isEven ? 'FFF5FAFA' : `FF${corBranca}`;
    row.eachCell((cell, colNumber) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      cell.border = {
        top: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        bottom: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        left: { style: 'thin', color: { argb: 'FFE0E0E0' } },
        right: { style: 'thin', color: { argb: 'FFE0E0E0' } },
      };
      cell.alignment = { vertical: 'middle', wrapText: true };
    });

    // Format currency/percentage columns
    if (ehDesconto) {
      row.getCell(headers.length).numFmt = '0.00%';
    } else {
      const valUnitCol = ocultarMarca ? 5 : 6;
      const valTotalCol = ocultarMarca ? 6 : 7;
      row.getCell(valUnitCol).numFmt = '#,##0.00';
      row.getCell(valTotalCol).numFmt = '#,##0.00';
    }
    // Center item number
    row.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
  };

  if (ehPorLote && lotesMap.size > 0) {
    const itensPorLote = new Map<string, any[]>();
    for (const item of itensOrdenados) {
      const ic: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
      const loteId = ic?.lote_id;
      if (loteId) {
        if (!itensPorLote.has(loteId)) itensPorLote.set(loteId, []);
        itensPorLote.get(loteId)!.push(item);
      }
    }

    const lotesOrdenados = Array.from(lotesMap.entries()).sort((a, b) => a[1].numero_lote - b[1].numero_lote);
    let idx = 0;

    for (const [loteId, loteInfo] of lotesOrdenados) {
      const itensDoLote = itensPorLote.get(loteId) || [];
      if (itensDoLote.length === 0) continue;

      const loteRow = ws.addRow([`LOTE ${loteInfo.numero_lote} - ${loteInfo.descricao_lote}`]);
      loteRow.getCell(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
      loteRow.getCell(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corSecundaria}` } };
      ws.mergeCells(`A${loteRow.number}:${String.fromCharCode(64 + headers.length)}${loteRow.number}`);

      let subtotal = 0;
      for (const item of itensDoLote) {
        addItemRow(item, idx % 2 === 0);
        const ic: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
        subtotal += (item.valor_unitario_ofertado || 0) * (ic?.quantidade || 0);
        idx++;
      }

      const subtotalRow = ws.addRow([]);
      const lastCol = headers.length;
      subtotalRow.getCell(lastCol - 1).value = `Subtotal Lote ${loteInfo.numero_lote}:`;
      subtotalRow.getCell(lastCol - 1).font = { bold: true };
      subtotalRow.getCell(lastCol - 1).alignment = { horizontal: 'right' };
      subtotalRow.getCell(lastCol).value = subtotal;
      subtotalRow.getCell(lastCol).numFmt = '#,##0.00';
      subtotalRow.getCell(lastCol).font = { bold: true };
      const subtotalBg = 'FFCFEEF7';
      for (let c = 1; c <= lastCol; c++) {
        subtotalRow.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: subtotalBg } };
      }
      somaTotal += subtotal;
    }
  } else {
    itensOrdenados.forEach((item: any, idx: number) => {
      addItemRow(item, idx % 2 === 0);
    });
  }

  // ========== TOTAL GERAL ==========
  if (!ehDesconto) {
    ws.addRow([]);
    const totalRow = ws.addRow([]);
    const lastCol = headers.length;
    totalRow.getCell(lastCol - 1).value = 'VALOR TOTAL ANUAL:';
    totalRow.getCell(lastCol - 1).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    totalRow.getCell(lastCol - 1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
    totalRow.getCell(lastCol - 1).alignment = { horizontal: 'right', vertical: 'middle' };
    totalRow.getCell(lastCol).value = valorTotal;
    totalRow.getCell(lastCol).numFmt = '#,##0.00';
    totalRow.getCell(lastCol).font = { bold: true, size: 12, color: { argb: 'FFFFFFFF' } };
    totalRow.getCell(lastCol).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: `FF${corPrimaria}` } };
    totalRow.getCell(lastCol).alignment = { horizontal: 'right', vertical: 'middle' };
  }

  // ========== OBSERVAÇÕES ==========
  if (observacoes) {
    ws.addRow([]);
    const obsTitle = ws.addRow(['OBSERVAÇÕES DO FORNECEDOR']);
    obsTitle.getCell(1).font = { bold: true, size: 11, color: { argb: `FF${corPrimaria}` } };
    ws.mergeCells(`A${obsTitle.number}:G${obsTitle.number}`);
    const obsRow = ws.addRow([observacoes]);
    obsRow.getCell(1).alignment = { wrapText: true };
    ws.mergeCells(`A${obsRow.number}:G${obsRow.number}`);
  }

  // ========== RESPONSÁVEL LEGAL ==========
  if (responsavelLegal) {
    ws.addRow([]);
    const rlRow = ws.addRow([`Responsável Legal: ${responsavelLegal}`]);
    rlRow.getCell(1).font = { bold: true };
    ws.mergeCells(`A${rlRow.number}:G${rlRow.number}`);
  }

  // ========== LARGURAS DAS COLUNAS ==========
  if (ehDesconto) {
    ws.getColumn(1).width = 8;
    ws.getColumn(2).width = 50;
    ws.getColumn(3).width = 12;
    ws.getColumn(4).width = 12;
    ws.getColumn(5).width = 15;
  } else if (ocultarMarca) {
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

  // Data de geração
  ws.addRow([]);
  const dataRow = ws.addRow([`Gerado em: ${new Date().toLocaleString('pt-BR')}`]);
  dataRow.getCell(1).font = { italic: true, size: 9, color: { argb: 'FF888888' } };

  // Gerar e baixar
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const nomeArquivo = `Proposta_${fornecedor.razao_social.replace(/[^a-zA-Z0-9]/g, '_').substring(0, 30)}.xlsx`;
  link.href = url;
  link.download = nomeArquivo;
  link.click();
  URL.revokeObjectURL(url);
}

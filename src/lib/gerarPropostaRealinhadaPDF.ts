import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { supabase } from '@/integrations/supabase/client';

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
  endereco_comercial?: string | null;
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
  protocolo: string,
  observacoes?: string
): Promise<{ pdfBlob: Blob; pdfUrl: string }> => {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  let yPos = margin;

  // Protocolo de certificação
  const protocoloCertificacao = gerarProtocoloCertificacao();

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

  // Dados do Fornecedor
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPos, pageWidth - margin * 2, 20, 'F');
  
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('DADOS DO FORNECEDOR', margin + 5, yPos + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Razão Social: ${fornecedor.razao_social}`, margin + 5, yPos + 13);
  doc.text(`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`, pageWidth - margin - 60, yPos + 13);
  
  yPos += 27;

  // Verificar se tem lotes (critério por_lote)
  const temLotes = itens.some(item => item.numero_lote && item.numero_lote > 0);
  const criterio = processo.criterio_julgamento;

  // Título da tabela
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('ITENS DA PROPOSTA REALINHADA', margin, yPos);
  yPos += 5;

  // Cabeçalhos da tabela - SEM coluna de Lote (lote será linha de título)
  const headers = [['Item', 'Descrição', 'Qtd', 'Un', 'Marca', 'Vlr Unit.', 'Vlr Total']];

  // Dados da tabela
  let valorTotal = 0;
  const tableData: any[] = [];
  
  // Agrupar por lote se necessário
  if (criterio === 'por_lote' || temLotes) {
    const lotes = new Map<number, ItemPropostaRealinhada[]>();
    itens.forEach(item => {
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
          colSpan: 7, 
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
        tableData.push([
          item.numero_item.toString(),
          sanitizarTexto(item.descricao),
          item.quantidade.toString(),
          item.unidade,
          item.marca || '-',
          `R$ ${formatarMoeda(item.valor_unitario)}`,
          `R$ ${formatarMoeda(item.valor_total)}`
        ]);
      });
      
      // Linha de subtotal do lote
      tableData.push([
        { content: `SUBTOTAL LOTE ${numeroLote}`, colSpan: 6, styles: { fontStyle: 'bold', fillColor: [230, 230, 230], halign: 'right' } },
        { content: `R$ ${formatarMoeda(subtotalLote)}`, styles: { fontStyle: 'bold', fillColor: [230, 230, 230], halign: 'right' } }
      ]);
    });
  } else {
    itens.forEach(item => {
      valorTotal += item.valor_total;
      tableData.push([
        item.numero_item.toString(),
        sanitizarTexto(item.descricao),
        item.quantidade.toString(),
        item.unidade,
        item.marca || '-',
        `R$ ${formatarMoeda(item.valor_unitario)}`,
        `R$ ${formatarMoeda(item.valor_total)}`
      ]);
    });
  }

  // Linha de total geral
  tableData.push([
    { content: 'VALOR TOTAL DA PROPOSTA', colSpan: 6, styles: { fontStyle: 'bold', fillColor: [0, 75, 140], textColor: [255, 255, 255], halign: 'right' } },
    { content: `R$ ${formatarMoeda(valorTotal)}`, styles: { fontStyle: 'bold', fillColor: [0, 75, 140], textColor: [255, 255, 255], halign: 'right' } }
  ]);

  // Gerar tabela com descrição justificada e colunas centralizadas verticalmente
  autoTable(doc, {
    head: headers,
    body: tableData,
    startY: yPos,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 3,
      valign: 'middle', // Centralização vertical
    },
    headStyles: {
      fillColor: [0, 75, 140],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 15, halign: 'center', valign: 'middle' },  // Item
      1: { cellWidth: 'auto', halign: 'left', valign: 'middle' },  // Descrição - será justificada no didDrawCell
      2: { cellWidth: 15, halign: 'center', valign: 'middle' },  // Qtd
      3: { cellWidth: 15, halign: 'center', valign: 'middle' },  // Un
      4: { cellWidth: 25, halign: 'center', valign: 'middle' },  // Marca
      5: { cellWidth: 24, halign: 'right', valign: 'middle' },  // Vlr Unit
      6: { cellWidth: 24, halign: 'right', valign: 'middle' },  // Vlr Total
    },
    rowPageBreak: 'auto',
    didDrawCell: function(data) {
      // Renderizar descrição justificada (coluna 1, body rows)
      if (data.section !== 'body' || data.column.index !== 1) return;

      const cell = data.cell;
      const lines = (cell.text || []).map((t) => String(t));
      const fullText = lines.join(' ').trim();
      if (!fullText) return;

      // Segurança extra: ignorar linhas especiais (quando aplicável)
      if (/^(LOTE\s+\d+|SUBTOTAL|VALOR TOTAL)/i.test(fullText)) return;

      const paddingX = 2;
      const paddingY = 2;
      const maxWidth = cell.width - paddingX * 2;
      const lineHeight = 4;

      // Pintar fundo para "apagar" o texto padrão do autoTable
      const fill = (cell.styles as any)?.fillColor;
      if (Array.isArray(fill) && fill.length >= 3) {
        doc.setFillColor(fill[0], fill[1], fill[2]);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(cell.x + 0.2, cell.y + 0.2, cell.width - 0.4, cell.height - 0.4, 'F');

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(0, 0, 0);

      const totalHeight = lines.length * lineHeight;
      const yStart = cell.y + (cell.height - totalHeight) / 2 + lineHeight * 0.75;

      lines.forEach((line, idx) => {
        const y = yStart + idx * lineHeight;
        if (y > cell.y + cell.height - paddingY) return;

        const words = line.trim().split(/\s+/).filter(Boolean);
        const isLast = idx === lines.length - 1;

        if (!isLast && words.length > 1) {
          const textWidth = words.reduce((acc, w) => acc + doc.getTextWidth(w), 0);
          const extraSpace = Math.max(0, maxWidth - textWidth);
          const space = extraSpace / (words.length - 1);

          let xCursor = cell.x + paddingX;
          words.forEach((w, i) => {
            doc.text(w, xCursor, y);
            if (i < words.length - 1) xCursor += doc.getTextWidth(w) + space;
          });
        } else {
          doc.text(line, cell.x + paddingX, y);
        }
      });
    }
  });

  // Observações (se houver)
  let finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
  
  if (observacoes && observacoes.trim()) {
    if (finalY + 30 > pageHeight - 60) {
      doc.addPage();
      finalY = margin;
    } else {
      finalY += 10;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBSERVAÇÕES:', margin, finalY);
    finalY += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(sanitizarTexto(observacoes), pageWidth - margin * 2);
    doc.text(obsLines, margin, finalY);
    finalY += obsLines.length * 4 + 5;
  }

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
  
  // Box de certificação
  doc.setFillColor(245, 245, 245);
  doc.setDrawColor(0, 75, 140);
  doc.setLineWidth(0.5);
  doc.rect(margin, finalY, pageWidth - margin * 2, 40, 'FD');
  
  doc.setTextColor(0, 75, 140);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, finalY + 8, { align: 'center' });
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.text(`Protocolo de Autenticidade: ${protocoloCertificacao}`, pageWidth / 2, finalY + 16, { align: 'center' });
  doc.text(`Documento gerado eletronicamente em ${new Date().toLocaleString('pt-BR')}`, pageWidth / 2, finalY + 23, { align: 'center' });
  doc.text(`Responsável: ${fornecedor.razao_social}`, pageWidth / 2, finalY + 30, { align: 'center' });
  
  doc.setFontSize(7);
  doc.setTextColor(100, 100, 100);
  doc.text('Verifique a autenticidade em: https://primaqualita.com.br/verificar-documento', pageWidth / 2, finalY + 37, { align: 'center' });

  // Rodapé em todas as páginas
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
    doc.text(
      `Protocolo: ${protocoloCertificacao}`,
      margin,
      pageHeight - 10
    );
  }

  // Converter para Blob
  const pdfBlob = doc.output('blob');

  // Salvar no storage
  const timestamp = Date.now();
  const nomeArquivo = `proposta_realinhada_${protocoloCertificacao.replace(/-/g, '_')}_${timestamp}.pdf`;
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
    pdfUrl: urlData.publicUrl
  };
};

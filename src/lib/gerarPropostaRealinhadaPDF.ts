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
  observacoes?: string
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
          item.marca || '',
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
        item.marca || '',
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
      cellPadding: 2,
      overflow: 'linebreak',
      lineColor: [200, 200, 200],
      lineWidth: 0.3
    },
    headStyles: {
      fillColor: [0, 75, 140],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'center',
      valign: 'middle',
    },
    columnStyles: {
      0: { cellWidth: 12, halign: 'center' },  // Item
      1: { cellWidth: 65, halign: 'left' },    // Descrição
      2: { cellWidth: 15, halign: 'center' },  // Qtd
      3: { cellWidth: 15, halign: 'center' },  // Un
      4: { cellWidth: 25, halign: 'center' },  // Marca
      5: { cellWidth: 25, halign: 'right' },   // Vlr Unit
      6: { cellWidth: 23, halign: 'right' },   // Vlr Total
    },
    rowPageBreak: 'auto',
    didParseCell: (data) => {
      // Adicionar padding dinâmico para descrições longas
      if (data.column.index === 1 && data.section === 'body' && data.cell.text && typeof data.cell.text === 'object') {
        const textLines = Array.isArray(data.cell.text) ? data.cell.text.length : 1;
        if (textLines > 2) {
          data.cell.styles.cellPadding = { top: 2, right: 2, bottom: 2 + (textLines - 2) * 1.5, left: 2 };
        }
      }
    },
    didDrawCell: (data) => {
      // Ignorar header e linhas especiais (lote, subtotal, total)
      if (data.section !== 'body') return;
      
      const rowData = tableData[data.row.index];
      if (!rowData) return;
      
      // Verificar se é linha especial (array com objeto colSpan ou objeto especial)
      if (Array.isArray(rowData) && rowData.length === 1 && rowData[0]?.colSpan) return;
      if (Array.isArray(rowData) && rowData.length === 2 && rowData[0]?.colSpan) return;
      
      const cellX = data.cell.x;
      const cellY = data.cell.y;
      const cellWidth = data.cell.width;
      const cellHeight = data.cell.height;
      
      // Preencher fundo da célula
      const fillColor = data.cell.styles.fillColor;
      if (fillColor && Array.isArray(fillColor)) {
        doc.setFillColor(fillColor[0], fillColor[1], fillColor[2]);
      } else {
        doc.setFillColor(255, 255, 255);
      }
      doc.rect(cellX + 0.3, cellY + 0.3, cellWidth - 0.6, cellHeight - 0.6, 'F');
      
      // Configurar fonte
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);
      
      // Coluna 1 (Descrição): texto justificado
      if (data.column.index === 1 && data.cell.text && Array.isArray(data.cell.text) && data.cell.text.length > 0) {
        const padding = 2;
        const larguraTexto = cellWidth - (padding * 2);
        const textLines = data.cell.text as string[];
        const lineHeight = 3.5;
        
        textLines.forEach((linha, index) => {
          const yLinha = cellY + padding + 2 + (index * lineHeight);
          
          // Verificar se a linha está dentro dos limites da célula
          if (yLinha < cellY + cellHeight - 1) {
            const isUltimaLinha = index === textLines.length - 1;
            
            if (isUltimaLinha || textLines.length === 1) {
              // Última linha ou linha única: alinhamento à esquerda
              doc.text(linha.trim(), cellX + padding, yLinha);
            } else {
              // Linhas intermediárias: justificar
              const palavras = linha.trim().split(/\s+/).filter(p => p.length > 0);
              if (palavras.length > 1) {
                let larguraPalavras = 0;
                palavras.forEach(palavra => {
                  larguraPalavras += doc.getTextWidth(palavra);
                });
                const espacoDisponivel = larguraTexto - larguraPalavras;
                const espacoEntrePalavras = espacoDisponivel / (palavras.length - 1);
                
                let xAtual = cellX + padding;
                palavras.forEach((palavra, idx) => {
                  doc.text(palavra, xAtual, yLinha);
                  if (idx < palavras.length - 1) {
                    xAtual += doc.getTextWidth(palavra) + espacoEntrePalavras;
                  }
                });
              } else {
                doc.text(linha.trim(), cellX + padding, yLinha);
              }
            }
          }
        });
      }
      // Outras colunas: centralizar verticalmente
      else if (data.cell.text && Array.isArray(data.cell.text) && data.cell.text.length > 0) {
        const texto = data.cell.text.join(' ').trim();
        const yCenter = cellY + (cellHeight / 2) + 1;
        
        // Colunas com alinhamento à direita (valores)
        if (data.column.index === 5 || data.column.index === 6) {
          doc.text(texto, cellX + cellWidth - 2, yCenter, { align: 'right' });
        }
        // Colunas com alinhamento central
        else {
          doc.text(texto, cellX + (cellWidth / 2), yCenter, { align: 'center' });
        }
      }
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
  doc.text(`Responsável: ${fornecedor.razao_social}`, margin + 5, finalY + 16);
  doc.text(`Protocolo: ${protocolo}`, margin + 5, finalY + 22);
  
  doc.setFont('helvetica', 'bold');
  doc.text('Verificar autenticidade em:', margin + 5, finalY + 28);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(0, 0, 255);
  doc.textWithLink(linkVerificacao, margin + 5, finalY + 33, { url: linkVerificacao });
  
  doc.setTextColor(0, 0, 0);
  doc.setFontSize(7);
  doc.text('Este documento possui certificação digital conforme Lei 14.063/2020', margin + 5, finalY + 40);

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
      `Protocolo: ${protocolo}`,
      margin,
      pageHeight - 10
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

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

const sanitizarTexto = (texto: string): string => {
  if (!texto) return '';
  return texto
    .replace(/²/g, '2').replace(/₂/g, '2')
    .replace(/³/g, '3').replace(/₃/g, '3')
    .replace(/¹/g, '1').replace(/₁/g, '1')
    .replace(/°/g, 'o').replace(/º/g, 'o').replace(/ª/g, 'a')
    .replace(/µ/g, 'u').replace(/μ/g, 'u')
    .replace(/–/g, '-').replace(/—/g, '-')
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/…/g, '...').replace(/•/g, '-');
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

  // Dados do Processo
  doc.setFillColor(240, 240, 240);
  doc.rect(margin, yPos, pageWidth - margin * 2, 25, 'F');
  
  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.text('DADOS DO PROCESSO', margin + 5, yPos + 6);
  
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(9);
  doc.text(`Processo: ${processo.numero_processo_interno}`, margin + 5, yPos + 13);
  doc.text(`Objeto: ${sanitizarTexto(processo.objeto_resumido).substring(0, 80)}${processo.objeto_resumido.length > 80 ? '...' : ''}`, margin + 5, yPos + 19);
  
  yPos += 32;

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

  // Cabeçalhos da tabela
  const headers = criterio === 'por_lote' || temLotes
    ? [['Lote', 'Item', 'Descrição', 'Qtd', 'Un', 'Marca', 'Vlr Unit.', 'Vlr Total']]
    : [['Item', 'Descrição', 'Qtd', 'Un', 'Marca', 'Vlr Unit.', 'Vlr Total']];

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
      
      itensLote.forEach(item => {
        subtotalLote += item.valor_total;
        valorTotal += item.valor_total;
        tableData.push([
          `Lote ${numeroLote}`,
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
        { content: `SUBTOTAL LOTE ${numeroLote}`, colSpan: 7, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } },
        { content: `R$ ${formatarMoeda(subtotalLote)}`, styles: { fontStyle: 'bold', fillColor: [230, 230, 230] } }
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
  const colspanTotal = criterio === 'por_lote' || temLotes ? 7 : 6;
  tableData.push([
    { content: 'VALOR TOTAL DA PROPOSTA', colSpan: colspanTotal, styles: { fontStyle: 'bold', fillColor: [0, 75, 140], textColor: [255, 255, 255] } },
    { content: `R$ ${formatarMoeda(valorTotal)}`, styles: { fontStyle: 'bold', fillColor: [0, 75, 140], textColor: [255, 255, 255] } }
  ]);

  // Gerar tabela
  autoTable(doc, {
    head: headers,
    body: tableData,
    startY: yPos,
    margin: { left: margin, right: margin },
    styles: {
      fontSize: 8,
      cellPadding: 2,
    },
    headStyles: {
      fillColor: [0, 75, 140],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
    },
    columnStyles: criterio === 'por_lote' || temLotes
      ? {
          0: { cellWidth: 18 },  // Lote
          1: { cellWidth: 15 },  // Item
          2: { cellWidth: 'auto' },  // Descrição
          3: { cellWidth: 15, halign: 'center' },  // Qtd
          4: { cellWidth: 15, halign: 'center' },  // Un
          5: { cellWidth: 25 },  // Marca
          6: { cellWidth: 22, halign: 'right' },  // Vlr Unit
          7: { cellWidth: 22, halign: 'right' },  // Vlr Total
        }
      : {
          0: { cellWidth: 15 },  // Item
          1: { cellWidth: 'auto' },  // Descrição
          2: { cellWidth: 15, halign: 'center' },  // Qtd
          3: { cellWidth: 15, halign: 'center' },  // Un
          4: { cellWidth: 25 },  // Marca
          5: { cellWidth: 22, halign: 'right' },  // Vlr Unit
          6: { cellWidth: 22, halign: 'right' },  // Vlr Total
        },
    rowPageBreak: 'auto',
  });

  // Observações (se houver)
  if (observacoes && observacoes.trim()) {
    const finalY = (doc as any).lastAutoTable?.finalY || yPos + 50;
    if (finalY + 30 > pageHeight - 40) {
      doc.addPage();
      yPos = margin;
    } else {
      yPos = finalY + 10;
    }

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.text('OBSERVAÇÕES:', margin, yPos);
    yPos += 5;
    
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    const obsLines = doc.splitTextToSize(sanitizarTexto(observacoes), pageWidth - margin * 2);
    doc.text(obsLines, margin, yPos);
  }

  // Rodapé com certificação
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.setTextColor(128, 128, 128);
    doc.text(
      `Página ${i} de ${totalPages}`,
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
  const nomeArquivo = `proposta_realinhada_${protocolo.replace(/[^a-zA-Z0-9]/g, '_')}_${timestamp}.pdf`;
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

import jsPDF from 'jspdf';
import { supabase } from '@/integrations/supabase/client';

interface ItemProposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  valor_unitario_ofertado: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  endereco_comercial: string;
}

export async function gerarPropostaFornecedorPDF(
  respostaId: string,
  fornecedor: DadosFornecedor,
  valorTotal: number,
  observacoes: string | null,
  tituloCotacao: string
): Promise<{ url: string; nome: string }> {
  try {
    // Buscar itens da resposta
    const { data: itens, error: itensError } = await supabase
      .from('respostas_itens_fornecedor')
      .select(`
        valor_unitario_ofertado,
        itens_cotacao:item_cotacao_id (
          numero_item,
          descricao,
          quantidade,
          unidade
        )
      `)
      .eq('cotacao_resposta_fornecedor_id', respostaId);

    if (itensError) throw itensError;

    const doc = new jsPDF();
    let y = 20;

    // Cabeçalho
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text('PROPOSTA COMERCIAL', 105, y, { align: 'center' });
    y += 10;

    // Informações do fornecedor
    doc.setFontSize(12);
    doc.text('DADOS DO FORNECEDOR', 20, y);
    y += 8;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Razão Social: ${fornecedor.razao_social}`, 20, y);
    y += 6;
    doc.text(`CNPJ: ${fornecedor.cnpj}`, 20, y);
    y += 6;
    if (fornecedor.endereco_comercial) {
      doc.text(`Endereço: ${fornecedor.endereco_comercial}`, 20, y);
      y += 6;
    }
    y += 5;

    // Título da cotação
    doc.setFont('helvetica', 'bold');
    doc.text(`Cotação: ${tituloCotacao}`, 20, y);
    y += 10;

    // Tabela de itens
    doc.setFont('helvetica', 'bold');
    doc.text('ITENS DA PROPOSTA', 20, y);
    y += 8;

    // Cabeçalho da tabela
    doc.setFontSize(9);
    doc.text('Item', 20, y);
    doc.text('Descrição', 35, y);
    doc.text('Qtd', 120, y);
    doc.text('Unid', 140, y);
    doc.text('Vlr Unit', 160, y);
    doc.text('Vlr Total', 180, y);
    y += 2;
    doc.line(20, y, 200, y);
    y += 5;

    // Itens
    doc.setFont('helvetica', 'normal');
    let subtotal = 0;

    const itensOrdenados = (itens as any[] || [])
      .map((item: any) => ({
        numero_item: item.itens_cotacao?.numero_item || 0,
        descricao: item.itens_cotacao?.descricao || "",
        quantidade: item.itens_cotacao?.quantidade || 0,
        unidade: item.itens_cotacao?.unidade || "",
        valor_unitario_ofertado: item.valor_unitario_ofertado || 0
      }))
      .sort((a, b) => a.numero_item - b.numero_item);

    for (const item of itensOrdenados) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const valorTotal = item.quantidade * item.valor_unitario_ofertado;
      subtotal += valorTotal;

      doc.text(item.numero_item.toString(), 20, y);
      
      const descricaoMaxWidth = 80;
      const descricaoLines = doc.splitTextToSize(item.descricao, descricaoMaxWidth);
      doc.text(descricaoLines[0], 35, y);
      
      doc.text(item.quantidade.toFixed(2), 120, y);
      doc.text(item.unidade, 140, y);
      doc.text(`R$ ${item.valor_unitario_ofertado.toFixed(2)}`, 160, y);
      doc.text(`R$ ${valorTotal.toFixed(2)}`, 180, y);
      
      y += 6;
    }

    // Linha de separação
    y += 2;
    doc.line(20, y, 200, y);
    y += 6;

    // Valor total
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`VALOR TOTAL: R$ ${valorTotal.toFixed(2)}`, 140, y);
    y += 10;

    // Observações
    if (observacoes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(10);
      doc.text('OBSERVAÇÕES:', 20, y);
      y += 6;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      const obsLines = doc.splitTextToSize(observacoes, 170);
      doc.text(obsLines, 20, y);
      y += obsLines.length * 5;
    }

    // Gerar PDF como blob
    const pdfBlob = doc.output('blob');
    const nomeArquivo = `proposta_${fornecedor.cnpj.replace(/[^\d]/g, '')}_${Date.now()}.pdf`;

    // Upload para o storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(nomeArquivo, pdfBlob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    // Obter URL pública (bucket é privado, então precisamos de signed URL)
    const { data: signedUrlData } = await supabase.storage
      .from('processo-anexos')
      .createSignedUrl(uploadData.path, 31536000); // 1 ano

    return {
      url: uploadData.path,
      nome: nomeArquivo
    };
  } catch (error) {
    console.error('Erro ao gerar PDF da proposta:', error);
    throw error;
  }
}

import jsPDF from 'jspdf';
import { stripHtml } from './htmlUtils';
import { supabase } from '@/integrations/supabase/client';
import { v4 as uuidv4 } from 'uuid';

interface ItemProposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca: string | null;
  valor_unitario_ofertado: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  email?: string;
}

const formatarMoeda = (valor: number): string => {
  return new Intl.NumberFormat('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  }).format(valor);
};

// Função para gerar protocolo no formato customizado (XXXX-XXXX-XXXX-XXXX)

export async function gerarPropostaSelecaoPDF(
  propostaId: string,
  fornecedor: DadosFornecedor,
  valorTotal: number,
  observacoes: string | null,
  tituloSelecao: string
): Promise<{ url: string; nome: string; hash: string }> {
  try {
    // Verificar se já existe protocolo para esta proposta
    const { data: propostaExistente } = await supabase
      .from('selecao_propostas_fornecedor')
      .select('protocolo')
      .eq('id', propostaId)
      .single();

    // Gerar ou reutilizar protocolo
    const protocolo = propostaExistente?.protocolo || uuidv4();
    console.log('Protocolo utilizado:', protocolo);

    // Buscar itens da proposta com informações completas
    const { data: itens, error: itensError } = await supabase
      .from('selecao_respostas_itens_fornecedor')
      .select(`
        numero_item,
        descricao,
        quantidade,
        unidade,
        marca,
        valor_unitario_ofertado,
        valor_total_item
      `)
      .eq('proposta_id', propostaId)
      .order('numero_item');

    console.log('Query de itens executada');
    console.log('Erro:', itensError);
    console.log('Itens retornados:', itens?.length || 0);

    if (itensError) {
      console.error('Erro detalhado ao buscar itens:', JSON.stringify(itensError, null, 2));
      throw new Error(`Erro ao buscar itens: ${itensError.message}`);
    }

    if (!itens || itens.length === 0) {
      console.error('NENHUM ITEM ENCONTRADO - Proposta ID:', propostaId);
      throw new Error(`Nenhum item encontrado para esta proposta (ID: ${propostaId})`);
    }

    console.log(`✅ ${itens.length} itens carregados com sucesso`);

    const itensFormatados: ItemProposta[] = itens.map((item: any) => ({
      numero_item: item.numero_item,
      descricao: item.descricao,
      quantidade: item.quantidade,
      unidade: item.unidade,
      valor_unitario_ofertado: item.valor_unitario_ofertado || 0,
      marca: item.marca
    }));

    const doc = new jsPDF();
    const dataEnvio = new Date().toLocaleString('pt-BR');
    
    const itensOrdenados = [...itensFormatados].sort((a, b) => a.numero_item - b.numero_item);
    
    let y = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margemEsquerda = 15;
    const larguraUtil = pageWidth - 30;

    // Cabeçalho
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(14, 165, 233); // Azul do sistema
    doc.text('PROPOSTA DE SELEÇÃO DE FORNECEDORES', pageWidth / 2, y, { align: 'center' });
    y += 12;

    // Informações da Seleção
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const tituloLines = doc.splitTextToSize(tituloSelecao, larguraUtil);
    doc.text(tituloLines, margemEsquerda, y);
    y += tituloLines.length * 5 + 3;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Envio: ${dataEnvio}`, margemEsquerda, y);
    y += 10;

    // Dados do Fornecedor
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Dados do Fornecedor', margemEsquerda, y);
    y += 7;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Razão Social: ${fornecedor.razao_social}`, margemEsquerda, y);
    y += 5;
    doc.text(`CNPJ: ${fornecedor.cnpj}`, margemEsquerda, y);
    y += 5;
    
    if (fornecedor.email) {
      doc.text(`E-mail: ${fornecedor.email}`, margemEsquerda, y);
      y += 8;
    } else {
      y += 3;
    }

    // Tabela de Itens
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('Itens Cotados', margemEsquerda, y);
    y += 8;

    // Cabeçalho da tabela
    doc.setFillColor(14, 165, 233); // Azul do sistema
    doc.rect(margemEsquerda, y - 5, larguraUtil, 8, 'F');
    
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    
    const colItem = margemEsquerda + 2;
    const colDesc = margemEsquerda + 15;
    const colQtd = margemEsquerda + 85;
    const colUni = margemEsquerda + 105;
    const colMarca = margemEsquerda + 125;
    const colValorUnit = margemEsquerda + 150;
    const colValorTotal = margemEsquerda + 170;
    
    doc.text('Item', colItem, y);
    doc.text('Descrição', colDesc, y);
    doc.text('Qtd', colQtd, y);
    doc.text('Unid', colUni, y);
    doc.text('Marca', colMarca, y);
    doc.text('Vlr Unit.', colValorUnit, y);
    doc.text('Vlr Total', colValorTotal, y);
    
    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Linhas da tabela
    for (const item of itensOrdenados) {
      if (y > 270) {
        doc.addPage();
        y = 20;
      }

      const valorTotalItem = item.quantidade * item.valor_unitario_ofertado;
      
      const descLines = doc.splitTextToSize(item.descricao, 65);
      const alturaLinha = Math.max(descLines.length * 4, 6);
      
      doc.setDrawColor(200, 200, 200);
      doc.line(margemEsquerda, y + alturaLinha, margemEsquerda + larguraUtil, y + alturaLinha);
      
      doc.text(item.numero_item.toString(), colItem, y + 3);
      doc.text(descLines, colDesc, y + 3);
      doc.text(item.quantidade.toString(), colQtd, y + 3);
      doc.text(item.unidade, colUni, y + 3);
      doc.text(item.marca || '-', colMarca, y + 3);
      doc.text(formatarMoeda(item.valor_unitario_ofertado), colValorUnit, y + 3);
      doc.text(formatarMoeda(valorTotalItem), colValorTotal, y + 3);
      
      y += alturaLinha;
    }

    y += 5;

    // Valor Total
    doc.setFillColor(240, 240, 240);
    doc.rect(margemEsquerda, y, larguraUtil, 8, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('VALOR TOTAL DA PROPOSTA:', colDesc, y + 5);
    doc.text(`R$ ${formatarMoeda(valorTotal)}`, colValorTotal, y + 5);
    
    y += 12;

    // Observações
    if (observacoes && observacoes.trim()) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Observações:', margemEsquerda, y);
      y += 5;
      
      doc.setFont('helvetica', 'normal');
      const obsLimpa = stripHtml(observacoes);
      const obsLines = doc.splitTextToSize(obsLimpa, larguraUtil);
      doc.text(obsLines, margemEsquerda, y);
      y += obsLines.length * 5 + 5;
    }

    // Certificação Digital (espaçamento uniforme 1.15)
    if (y > 220) {
      doc.addPage();
      y = 20;
    }
    
    y += 15;
    const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;
    
    // Calcular largura útil dentro do quadro (com margens internas)
    const larguraInternaQuadro = larguraUtil - 10;
    
    // Espaçamento uniforme entre linhas (1.15)
    const espacamentoLinha = 5.75; // 5 * 1.15
    
    // Quebrar textos longos
    doc.setFontSize(11);
    const responsavelLines = doc.splitTextToSize(`Responsável: ${fornecedor.razao_social}`, larguraInternaQuadro);
    const protocoloLines = doc.splitTextToSize(`Protocolo: ${protocolo}`, larguraInternaQuadro);
    
    doc.setFontSize(10);
    const linkLines = doc.splitTextToSize(linkVerificacao, larguraInternaQuadro);
    const textoLeiLines = doc.splitTextToSize('Este documento possui certificação digital conforme Lei 14.063/2020', larguraInternaQuadro);
    
    // Calcular altura total do quadro
    const alturaQuadro = 10 + 8 + 
                        (responsavelLines.length * espacamentoLinha) + 
                        (protocoloLines.length * espacamentoLinha) + 
                        espacamentoLinha + 
                        (linkLines.length * espacamentoLinha) + 
                        (textoLeiLines.length * espacamentoLinha) + 5;
    
    // Desenhar quadro com bordas pretas e fundo branco
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(margemEsquerda, y, larguraUtil, alturaQuadro, 'FD');
    
    // Título centralizado em azul
    y += 10;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 139);
    doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, y, { align: 'center' });
    
    // Espaço após título
    y += 8;
    
    // Responsável
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(0, 0, 0);
    responsavelLines.forEach((linha: string, index: number) => {
      doc.text(linha, margemEsquerda + 5, y + (index * espacamentoLinha));
    });
    y += (responsavelLines.length * espacamentoLinha);
    
    // Protocolo
    protocoloLines.forEach((linha: string, index: number) => {
      doc.text(linha, margemEsquerda + 5, y + (index * espacamentoLinha));
    });
    y += (protocoloLines.length * espacamentoLinha);
    
    // "Verificar autenticidade em:" em negrito
    doc.setFont('helvetica', 'bold');
    doc.text('Verificar autenticidade em:', margemEsquerda + 5, y);
    y += espacamentoLinha;
    
    // Link em azul
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(0, 0, 255);
    linkLines.forEach((linha: string, index: number) => {
      doc.textWithLink(linha, margemEsquerda + 5, y + (index * espacamentoLinha), { url: linkVerificacao });
    });
    y += (linkLines.length * espacamentoLinha);
    
    // Texto final sobre a lei
    doc.setTextColor(0, 0, 0);
    textoLeiLines.forEach((linha: string, index: number) => {
      doc.text(linha, margemEsquerda + 5, y + (index * espacamentoLinha));
    });


    // Gerar PDF como blob
    const pdfBlob = doc.output('blob');
    
    // Upload para Supabase Storage
    const nomeArquivo = `proposta-selecao-${propostaId}-${Date.now()}.pdf`;
    const filePath = `propostas-selecao/${nomeArquivo}`;

    const { error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(filePath, pdfBlob, {
        contentType: 'application/pdf',
        upsert: true
      });

    if (uploadError) {
      console.error('Erro ao fazer upload:', uploadError);
      throw uploadError;
    }

    // Atualizar o protocolo se não existir
    if (!propostaExistente?.protocolo) {
      const { error: updateError } = await supabase
        .from('selecao_propostas_fornecedor')
        .update({ protocolo })
        .eq('id', propostaId);

      if (updateError) {
        console.error('Erro ao atualizar protocolo:', updateError);
        throw updateError;
      }
      
      console.log('Protocolo salvo:', protocolo);
    }

    return {
      url: filePath,
      nome: nomeArquivo,
      hash: ''
    };
  } catch (error) {
    console.error('Erro ao gerar PDF da proposta de seleção:', error);
    throw error;
  }
}

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
  logradouro?: string;
  numero?: string;
  bairro?: string;
  municipio?: string;
  uf?: string;
  cep?: string;
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
  tituloSelecao: string,
  dataEnvioProposta: string
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
    const dataEnvio = new Date(dataEnvioProposta).toLocaleString('pt-BR');
    
    const itensOrdenados = [...itensFormatados].sort((a, b) => a.numero_item - b.numero_item);
    
    let y = 20;
    const pageWidth = doc.internal.pageSize.getWidth();
    const margemEsquerda = 15;
    const larguraUtil = pageWidth - 30;

    // Cabeçalho Principal
    doc.setFontSize(20);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(30, 159, 204); // Azul do logo Prima Qualitá
    doc.text('PROPOSTA DE PREÇOS', pageWidth / 2, y, { align: 'center' });
    y += 10;

    // Informações da Seleção
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const tituloLines = doc.splitTextToSize(tituloSelecao, larguraUtil);
    doc.text(tituloLines, margemEsquerda, y);
    y += tituloLines.length * 5 + 3;
    
    doc.setFont('helvetica', 'normal');
    doc.text(`Data de Envio: ${dataEnvio}`, margemEsquerda, y);
    y += 12;

    // Cabeçalho "Dados do Fornecedor" com sombra
    doc.setFillColor(30, 159, 204); // Azul do logo
    doc.rect(margemEsquerda, y - 5, larguraUtil, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('DADOS DO FORNECEDOR', margemEsquerda + 2, y);
    y += 7;
    doc.setTextColor(0, 0, 0);

    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Razão Social: ${fornecedor.razao_social}`, margemEsquerda, y);
    y += 5;
    doc.text(`CNPJ: ${fornecedor.cnpj}`, margemEsquerda, y);
    y += 5;
    doc.text(`E-mail: ${fornecedor.email || 'Não informado'}`, margemEsquerda, y);
    y += 5;
    
    if (fornecedor.logradouro) {
      const enderecoCompleto = `${fornecedor.logradouro}${fornecedor.numero ? ', ' + fornecedor.numero : ''}${fornecedor.bairro ? ', ' + fornecedor.bairro : ''}`;
      doc.text(`Endereço: ${enderecoCompleto}`, margemEsquerda, y);
      y += 5;
    }
    
    if (fornecedor.municipio || fornecedor.uf) {
      const localidade = `${fornecedor.municipio || ''}${fornecedor.uf ? ' - ' + fornecedor.uf : ''}${fornecedor.cep ? ', CEP: ' + fornecedor.cep : ''}`;
      doc.text(localidade, margemEsquerda, y);
      y += 8;
    } else {
      y += 3;
    }

    // Cabeçalho "Itens da Proposta" com sombra - CENTRALIZADO
    doc.setFillColor(30, 159, 204); // Azul do logo
    doc.rect(margemEsquerda, y - 5, larguraUtil, 8, 'F');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    doc.text('ITENS DA PROPOSTA', pageWidth / 2, y, { align: 'center' });
    y += 8;
    doc.setTextColor(0, 0, 0);

    // Desenhar borda externa da tabela (perímetro)
    const tabelaY = y - 5;
    const alturaHeader = 8;
    
    // Cabeçalho da tabela com sombra
    doc.setFillColor(30, 159, 204); // Azul do logo
    doc.rect(margemEsquerda, y - 5, larguraUtil, 8, 'F');
    
    // Bordas do cabeçalho
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(255, 255, 255);
    
    const colItem = margemEsquerda + 2;
    const colDesc = margemEsquerda + 15;
    const colQtd = margemEsquerda + 85;
    const colUni = margemEsquerda + 105;
    const colMarca = margemEsquerda + 125;
    const colValorUnit = margemEsquerda + 148;
    const colValorTotal = margemEsquerda + 168;
    
    // Posições das colunas para linhas verticais
    const colPositions = [
      margemEsquerda + 13,
      margemEsquerda + 83,
      margemEsquerda + 103,
      margemEsquerda + 123,
      margemEsquerda + 146,
      margemEsquerda + 166
    ];
    
    const headerYCenter = y - 1;
    
    doc.text('Item', colItem, headerYCenter);
    doc.text('Descrição', colDesc, headerYCenter);
    doc.text('Qtd', colQtd, headerYCenter);
    doc.text('Unid', colUni, headerYCenter);
    doc.text('Marca', colMarca, headerYCenter);
    doc.text('Vlr Unit.', colValorUnit, headerYCenter);
    doc.text('Vlr Total', colValorTotal, headerYCenter);
    
    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Calcular altura total da tabela primeiro
    let alturaTotal = 0;
    const alturasPorItem: number[] = [];
    for (const item of itensOrdenados) {
      const descLines = doc.splitTextToSize(item.descricao, 65);
      const alturaLinha = Math.max(descLines.length * 4, 6);
      alturasPorItem.push(alturaLinha);
      alturaTotal += alturaLinha;
    }

    // Linhas da tabela com sombras alternadas
    let itemIndex = 0;
    let yInicio = y;
    for (const item of itensOrdenados) {
      if (y > 270) {
        // Fechar tabela na página atual antes de mudar
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.3);
        doc.rect(margemEsquerda, tabelaY, larguraUtil, y - tabelaY, 'S');
        
        doc.addPage();
        y = 20;
        yInicio = y;
      }

      const valorTotalItem = item.quantidade * item.valor_unitario_ofertado;
      
      const descLines = doc.splitTextToSize(item.descricao, 65);
      const alturaLinha = Math.max(descLines.length * 4, 6);
      
      // Sombra azul claro alternada (zebra striping)
      if (itemIndex % 2 === 1) {
        doc.setFillColor(224, 242, 250); // Azul muito claro
        doc.rect(margemEsquerda, y, larguraUtil, alturaLinha, 'F');
      }
      
      // Linha horizontal inferior
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.3);
      doc.line(margemEsquerda, y + alturaLinha, margemEsquerda + larguraUtil, y + alturaLinha);
      
      // Linhas verticais para cada coluna
      colPositions.forEach(xPos => {
        doc.line(xPos, y, xPos, y + alturaLinha);
      });
      
      // Centralização vertical para todas as colunas
      const yVerticalCenter = y + (alturaLinha / 2) + 1;
      
      doc.text(item.numero_item.toString(), colItem, yVerticalCenter);
      
      // Descrição com alinhamento justificado
      const descricaoLargura = 65;
      const descricaoX = colDesc;
      const descricaoYInicio = y + 3;
      const espacamentoLinhaDesc = 4;
      
      // Renderizar cada linha da descrição com justificação
      descLines.forEach((linha: string, index: number) => {
        const yLinha = descricaoYInicio + (index * espacamentoLinhaDesc);
        // Para última linha ou linhas curtas, usar alinhamento esquerdo
        if (index === descLines.length - 1 || linha.length < 40) {
          doc.text(linha, descricaoX, yLinha);
        } else {
          // Justificar linhas completas
          doc.text(linha, descricaoX, yLinha, { align: 'justify', maxWidth: descricaoLargura });
        }
      });
      
      doc.text(item.quantidade.toString(), colQtd, yVerticalCenter);
      doc.text(item.unidade, colUni, yVerticalCenter);
      doc.text(item.marca || '-', colMarca, yVerticalCenter);
      doc.text(formatarMoeda(item.valor_unitario_ofertado), colValorUnit, yVerticalCenter);
      doc.text(formatarMoeda(valorTotalItem), colValorTotal, yVerticalCenter);
      
      y += alturaLinha;
      itemIndex++;
    }

    // Desenhar borda externa completa da tabela (perímetro)
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.3);
    doc.rect(margemEsquerda, tabelaY, larguraUtil, (y - tabelaY) + alturaHeader, 'S');
    
    // Linhas verticais completas da tabela
    colPositions.forEach(xPos => {
      doc.line(xPos, tabelaY, xPos, y);
    });

    y += 5;

    // Valor Total
    doc.setFillColor(240, 240, 240);
    doc.rect(margemEsquerda, y, larguraUtil, 8, 'F');
    
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text('VALOR TOTAL DA PROPOSTA:', margemEsquerda + 2, y + 5);
    const valorTexto = `R$ ${formatarMoeda(valorTotal)}`;
    const valorWidth = doc.getTextWidth(valorTexto);
    doc.text(valorTexto, margemEsquerda + larguraUtil - valorWidth - 2, y + 5);
    
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
    
    // Desenhar quadro com bordas pretas e fundo cinza claro
    doc.setFillColor(245, 245, 245);
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

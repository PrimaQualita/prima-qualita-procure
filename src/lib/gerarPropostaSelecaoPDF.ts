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

// Função para sanitizar texto - remove/substitui caracteres especiais que jsPDF não renderiza bem
const sanitizarTexto = (texto: string): string => {
  if (!texto) return '';
  
  return texto
    .replace(/²/g, '2')      // Superscript 2
    .replace(/₂/g, '2')      // Subscript 2 (SpO₂)
    .replace(/³/g, '3')      // Superscript 3
    .replace(/₃/g, '3')      // Subscript 3
    .replace(/¹/g, '1')      // Superscript 1
    .replace(/₁/g, '1')      // Subscript 1
    .replace(/⁰/g, '0').replace(/₀/g, '0')
    .replace(/⁴/g, '4').replace(/₄/g, '4')
    .replace(/⁵/g, '5').replace(/₅/g, '5')
    .replace(/⁶/g, '6').replace(/₆/g, '6')
    .replace(/⁷/g, '7').replace(/₇/g, '7')
    .replace(/⁸/g, '8').replace(/₈/g, '8')
    .replace(/⁹/g, '9').replace(/₉/g, '9')
    .replace(/°/g, 'o')      // Degree symbol
    .replace(/º/g, 'o')      // Ordinal masculine
    .replace(/ª/g, 'a')      // Ordinal feminine
    .replace(/µ/g, 'u')      // Micro
    .replace(/μ/g, 'u')      // Greek mu
    .replace(/–/g, '-')      // En dash
    .replace(/—/g, '-')      // Em dash
    .replace(/'/g, "'").replace(/'/g, "'")
    .replace(/"/g, '"').replace(/"/g, '"')
    .replace(/…/g, '...')    // Ellipsis
    .replace(/•/g, '-');     // Bullet
};

// Função para renderizar texto justificado no jsPDF
const renderizarTextoJustificado = (
  doc: jsPDF, 
  texto: string, 
  x: number, 
  y: number, 
  larguraMaxima: number
): void => {
  const palavras = texto.trim().split(/\s+/).filter(p => p.length > 0);
  
  if (palavras.length <= 1) {
    doc.text(texto, x, y);
    return;
  }

  // Calcular largura total das palavras
  let larguraPalavras = 0;
  palavras.forEach(palavra => {
    larguraPalavras += doc.getTextWidth(palavra);
  });

  // Calcular espaço extra entre palavras
  const espacoDisponivel = larguraMaxima - larguraPalavras;
  const espacoEntrePalavras = espacoDisponivel / (palavras.length - 1);

  // Renderizar cada palavra com espaçamento calculado
  let xAtual = x;
  palavras.forEach((palavra, index) => {
    doc.text(palavra, xAtual, y);
    if (index < palavras.length - 1) {
      xAtual += doc.getTextWidth(palavra) + espacoEntrePalavras;
    }
  });
};

// Função para formatar protocolo UUID no formato XXXX-XXXX-XXXX-XXXX para exibição
const formatarProtocoloExibicao = (uuid: string): string => {
  // Remove hífens do UUID e pega os primeiros 16 caracteres
  const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
  // Formata como XXXX-XXXX-XXXX-XXXX
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

export async function gerarPropostaSelecaoPDF(
  propostaId: string,
  fornecedor: DadosFornecedor,
  valorTotal: number,
  observacoes: string | null,
  tituloSelecao: string,
  dataEnvioProposta: string,
  itensAtualizados?: Array<{ numero_item: number; descricao: string; quantidade: number; unidade: string; marca: string | null; valor_unitario_ofertado: number }>,
  criterioJulgamento?: string
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

    // Usar itens passados OU buscar do banco de dados
    let itensFormatados: ItemProposta[];
    
    if (itensAtualizados && itensAtualizados.length > 0) {
      console.log('Usando itens passados diretamente:', itensAtualizados.length);
      itensFormatados = itensAtualizados.map(item => ({
        numero_item: item.numero_item,
        descricao: item.descricao,
        quantidade: item.quantidade,
        unidade: item.unidade,
        valor_unitario_ofertado: item.valor_unitario_ofertado || 0,
        marca: item.marca
      }));
    } else {
      // Buscar proposta para pegar o selecao_id e cotacao_id
      const { data: proposta, error: propostaError } = await supabase
        .from('selecao_propostas_fornecedor')
        .select('selecao_id')
        .eq('id', propostaId)
        .single();

      if (propostaError) throw new Error(`Erro ao buscar proposta: ${propostaError.message}`);

      // Buscar a seleção para pegar cotacao_relacionada_id
      const { data: selecao, error: selecaoError } = await supabase
        .from('selecoes_fornecedores')
        .select('cotacao_relacionada_id')
        .eq('id', proposta.selecao_id)
        .single();

      if (selecaoError) throw new Error(`Erro ao buscar seleção: ${selecaoError.message}`);

      // Buscar TODOS os itens da cotação original
      const { data: todosItens, error: itensError } = await supabase
        .from('itens_cotacao')
        .select('*')
        .eq('cotacao_id', selecao.cotacao_relacionada_id)
        .order('numero_item');

      if (itensError) throw new Error(`Erro ao buscar itens: ${itensError.message}`);
      if (!todosItens || todosItens.length === 0) {
        throw new Error('Nenhum item encontrado para esta seleção');
      }

      // Buscar respostas do fornecedor para esta proposta
      const { data: respostas, error: respostasError } = await supabase
        .from('selecao_respostas_itens_fornecedor')
        .select('numero_item, marca, valor_unitario_ofertado')
        .eq('proposta_id', propostaId);

      if (respostasError) throw new Error(`Erro ao buscar respostas: ${respostasError.message}`);

      // Criar mapa de respostas por numero_item
      const respostasMap = new Map<number, any>();
      respostas?.forEach(r => {
        respostasMap.set(r.numero_item, r);
      });

      // Combinar todos os itens com as respostas do fornecedor
      itensFormatados = todosItens.map((item: any) => {
        const resposta = respostasMap.get(item.numero_item);
        return {
          numero_item: item.numero_item,
          descricao: item.descricao,
          quantidade: item.quantidade,
          unidade: item.unidade,
          valor_unitario_ofertado: resposta?.valor_unitario_ofertado || 0,
          marca: resposta?.marca || null
        };
      });

      console.log(`✅ ${itensFormatados.length} itens carregados com sucesso`);
    }

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
    
    // Definir colunas baseado no critério de julgamento
    const isDesconto = criterioJulgamento === "desconto";
    
    // Posições das linhas verticais (divisores) - ajustadas para evitar overflow
    const colPositions = isDesconto 
      ? [
          margemEsquerda + 12,   // Fim Item
          margemEsquerda + 82,   // Fim Descrição
          margemEsquerda + 96,   // Fim Qtd
          margemEsquerda + 110,  // Fim Unid
          margemEsquerda + 140   // Fim Marca (% Desconto vai até o fim sem linha)
        ]
      : [
          margemEsquerda + 12,   // Fim Item
          margemEsquerda + 77,   // Fim Descrição
          margemEsquerda + 92,   // Fim Qtd
          margemEsquerda + 107,  // Fim Unid
          margemEsquerda + 132,  // Fim Marca
          margemEsquerda + 157   // Fim Valor Unitário
        ];
    
    // Centros das colunas calculados com base nas bordas
    const colItemCenter = margemEsquerda + (colPositions[0] - margemEsquerda) / 2;
    const colDescCenter = colPositions[0] + (colPositions[1] - colPositions[0]) / 2;
    const colQtdCenter = colPositions[1] + (colPositions[2] - colPositions[1]) / 2;
    const colUniCenter = colPositions[2] + (colPositions[3] - colPositions[2]) / 2;
    const colMarcaCenter = colPositions[3] + (colPositions[4] - colPositions[3]) / 2;
    const colValorUnitCenter = isDesconto ? undefined : colPositions[4] + (colPositions[5] - colPositions[4]) / 2;
    const colValorTotalCenter = isDesconto ? undefined : colPositions[5] + (margemEsquerda + larguraUtil - colPositions[5]) / 2;
    const colDescontoCenter = isDesconto ? colPositions[4] + (margemEsquerda + larguraUtil - colPositions[4]) / 2 : undefined;
    
    // Posição X para descrição (alinhada à esquerda com padding)
    const colDesc = colPositions[0] + 2;
    
    const headerYCenter = y - 1;
    
    // Cabeçalhos centralizados em suas respectivas colunas
    doc.text('Item', colItemCenter, headerYCenter, { align: 'center' });
    doc.text('Descrição', colDescCenter, headerYCenter, { align: 'center' });
    doc.text('Qtd', colQtdCenter, headerYCenter, { align: 'center' });
    doc.text('Unid', colUniCenter, headerYCenter, { align: 'center' });
    doc.text('Marca', colMarcaCenter, headerYCenter, { align: 'center' });
    
    if (isDesconto) {
      doc.text('% Desconto', colDescontoCenter!, headerYCenter, { align: 'center' });
    } else {
      doc.text('Vlr Unit.', colValorUnitCenter!, headerYCenter, { align: 'center' });
      doc.text('Vlr Total', colValorTotalCenter!, headerYCenter, { align: 'center' });
    }
    
    y += 5;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    // Largura da coluna de descrição baseada nas bordas - com padding adequado
    const descricaoLargura = colPositions[1] - colPositions[0] - 6;
    
    // Espaçamento entre linhas de texto da descrição (mais espaço para legibilidade)
    const espacamentoLinhaDescTexto = 4.2;
    
    // Calcular altura total da tabela primeiro
    let alturaTotal = 0;
    const alturasPorItem: number[] = [];
    for (const item of itensOrdenados) {
      const descLines = doc.splitTextToSize(sanitizarTexto(item.descricao), descricaoLargura);
      // Altura mínima de 7, e cada linha adicional soma espacamentoLinhaDescTexto
      const alturaLinha = Math.max(6 + ((descLines.length - 1) * espacamentoLinhaDescTexto), 7);
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
      
      const descLines = doc.splitTextToSize(sanitizarTexto(item.descricao), descricaoLargura);
      // Altura mínima de 7, e cada linha adicional soma espacamentoLinhaDescTexto
      const alturaLinha = Math.max(6 + ((descLines.length - 1) * espacamentoLinhaDescTexto), 7);
      
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
      
      // Centralização vertical para colunas fixas (não descrição)
      const yVerticalCenter = y + (alturaLinha / 2) + 1;
      
      // Item - centralizado horizontalmente
      doc.text(item.numero_item.toString(), colItemCenter, yVerticalCenter, { align: 'center' });
      
      // Descrição com alinhamento justificado - começando do topo da célula com padding
      const descricaoX = colDesc;
      const descricaoYInicio = y + 3.5;
      
      // Renderizar cada linha da descrição com justificação
      descLines.forEach((linha: string, index: number) => {
        const yLinha = descricaoYInicio + (index * espacamentoLinhaDescTexto);
        const isUltimaLinha = index === descLines.length - 1;
        
        // Verificar se a linha cabe dentro da célula
        if (yLinha <= y + alturaLinha - 1) {
          if (isUltimaLinha || descLines.length === 1) {
            // Última linha ou linha única: alinhamento à esquerda
            doc.text(linha.trim(), descricaoX, yLinha);
          } else {
            // Linhas intermediárias: justificado
            renderizarTextoJustificado(doc, linha.trim(), descricaoX, yLinha, descricaoLargura);
          }
        }
      });
      
      // Quantidade, Unidade, Marca - centralizados horizontalmente
      doc.text(item.quantidade.toString(), colQtdCenter, yVerticalCenter, { align: 'center' });
      doc.text(sanitizarTexto(item.unidade), colUniCenter, yVerticalCenter, { align: 'center' });
      doc.text(sanitizarTexto(item.marca || '-'), colMarcaCenter, yVerticalCenter, { align: 'center' });
      
      // Valores conforme critério
      if (isDesconto) {
        // Exibir apenas % de desconto alinhado à direita próximo da margem direita
        const descontoTexto = item.valor_unitario_ofertado && item.valor_unitario_ofertado > 0
          ? `${item.valor_unitario_ofertado.toFixed(2).replace('.', ',')}%`
          : '-';
        const valorDescontoRight = margemEsquerda + larguraUtil - 2;
        doc.text(descontoTexto, valorDescontoRight, yVerticalCenter, { align: 'right' });
      } else {
        // Valores em moeda - alinhados à direita dentro de suas colunas
        const valorUnitRight = colPositions[5] - 2;
        const valorTotalRight = margemEsquerda + larguraUtil - 2;
        doc.text(`R$ ${formatarMoeda(item.valor_unitario_ofertado)}`, valorUnitRight, yVerticalCenter, { align: 'right' });
        doc.text(`R$ ${formatarMoeda(valorTotalItem)}`, valorTotalRight, yVerticalCenter, { align: 'right' });
      }
      
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

    // Valor Total - apenas para critérios que não são desconto
    if (!isDesconto) {
      doc.setFillColor(240, 240, 240);
      doc.rect(margemEsquerda, y, larguraUtil, 8, 'F');
      
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.text('VALOR TOTAL DA PROPOSTA:', margemEsquerda + 2, y + 5);
      const valorTexto = `R$ ${formatarMoeda(valorTotal)}`;
      const valorWidth = doc.getTextWidth(valorTexto);
      doc.text(valorTexto, margemEsquerda + larguraUtil - valorWidth - 2, y + 5);
      
      y += 12;
    }

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
    const protocoloFormatado = formatarProtocoloExibicao(protocolo);
    const protocoloLines = doc.splitTextToSize(`Protocolo: ${protocoloFormatado}`, larguraInternaQuadro);
    
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

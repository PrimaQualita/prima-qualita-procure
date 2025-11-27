import jsPDF from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { createClient } from '@supabase/supabase-js';
import { gerarHashDocumento } from './certificacaoDigital';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_PUBLISHABLE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

const supabaseAnon = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: {
    persistSession: false,
    autoRefreshToken: false,
    detectSessionInUrl: false
  }
});

// Função para formatar CNPJ
const formatarCNPJ = (cnpj: string): string => {
  const apenasNumeros = cnpj.replace(/[^\d]/g, '');
  
  if (apenasNumeros.length !== 14) return cnpj;
  
  return `${apenasNumeros.slice(0, 2)}.${apenasNumeros.slice(2, 5)}.${apenasNumeros.slice(5, 8)}/${apenasNumeros.slice(8, 12)}-${apenasNumeros.slice(12, 14)}`;
};

// Função para gerar protocolo no formato XXXX-XXXX-XXXX-XXXX
const gerarProtocolo = (): string => {
  const parte1 = Math.floor(1000 + Math.random() * 9000);
  const parte2 = Math.floor(1000 + Math.random() * 9000);
  const parte3 = Math.floor(1000 + Math.random() * 9000);
  const parte4 = Math.floor(1000 + Math.random() * 9000);
  return `${parte1}-${parte2}-${parte3}-${parte4}`;
};

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
  tituloCotacao: string,
  comprovantes: File[] = [],
  usuarioNome?: string,
  usuarioCpf?: string,
  criterioJulgamento?: string
): Promise<{ url: string; nome: string; hash: string }> {
  try {
    console.log('📄 Dados recebidos no gerarPropostaFornecedorPDF:', {
      fornecedor,
      valorTotal,
      tituloCotacao
    });
    
    console.log('📎 Comprovantes recebidos na função:', comprovantes.length);
    comprovantes.forEach((arquivo, index) => {
      console.log(`  ${index + 1}. ${arquivo.name} (${arquivo.type}, ${arquivo.size} bytes)`);
    });
    // Buscar itens da resposta
    console.log('🔍 Buscando itens para resposta ID:', respostaId);
    
    const { data: itens, error: itensError } = await supabaseAnon
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
          unidade
        )
      `)
      .eq('cotacao_resposta_fornecedor_id', respostaId);

    console.log('📊 Resultado da busca:', {
      encontrou: itens?.length || 0,
      erro: itensError
    });
    
    // DEBUG: Log detalhado dos primeiros itens
    if (itens && itens.length > 0) {
      console.log('🔍 DEBUG - Primeiros 3 itens recebidos:');
      itens.slice(0, 3).forEach((item: any, idx: number) => {
        const itemCot = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
        console.log(`  Item ${idx}: numero_item=${itemCot?.numero_item}, tipo=${typeof itemCot}, isArray=${Array.isArray(item.itens_cotacao)}`);
      });
    }

    if (itensError) {
      console.error('❌ Erro ao buscar itens:', itensError);
      throw itensError;
    }

    if (!itens || itens.length === 0) {
      console.error('❌ Nenhum item encontrado para resposta:', respostaId);
      console.error('Isso pode ser um problema de RLS ou timing');
      throw new Error('Nenhum item encontrado para esta proposta');
    }

    // Ordenar itens por numero_item no JavaScript de forma mais robusta
    const itensOrdenados = itens.sort((a: any, b: any) => {
      // Garantir que sempre pegamos o objeto correto
      const itemA = Array.isArray(a.itens_cotacao) ? a.itens_cotacao[0] : a.itens_cotacao;
      const itemB = Array.isArray(b.itens_cotacao) ? b.itens_cotacao[0] : b.itens_cotacao;
      
      // Extrair números de forma segura
      const numeroA = (itemA && typeof itemA === 'object') ? (itemA.numero_item || 0) : 0;
      const numeroB = (itemB && typeof itemB === 'object') ? (itemB.numero_item || 0) : 0;
      
      return numeroA - numeroB;
    });

    console.log('✅ Itens ordenados. Primeiros 5 números:', itensOrdenados.slice(0, 5).map((i: any) => {
      const item = Array.isArray(i.itens_cotacao) ? i.itens_cotacao[0] : i.itens_cotacao;
      return item?.numero_item;
    }));

    const dataGeracao = new Date().toLocaleString('pt-BR');

    const doc = new jsPDF();
    doc.setLineHeightFactor(1.25);
    
    // Cores do sistema (HSL convertido para RGB)
    const corPrimaria = [0, 102, 102];
    const corSecundaria = [0, 102, 153];
    const corFundo = [209, 247, 247];
    const corTexto = [0, 71, 71];
    const corAccent = [128, 242, 242];
    
    let y = 0;

    // Cabeçalho com fundo colorido
    doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.rect(0, 0, 210, 50, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(24);
    doc.setFont('helvetica', 'bold');
    const tituloDocumento = fornecedor.cnpj === '00000000000000' ? 'PROPOSTA DE PREÇOS PÚBLICOS' : 'PROPOSTA DE PREÇOS';
    doc.text(tituloDocumento, 105, 25, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ref: ${tituloCotacao}`, 105, 38, { align: 'center' });
    
    y = 60;

    // Bloco de informações do fornecedor com fundo
    const isPrecosPublicos = fornecedor.cnpj === '00000000000000';
    const alturaBloco = isPrecosPublicos ? 26 : 44;
    
    doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
    doc.rect(15, y, 180, alturaBloco, 'F');
    
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(isPrecosPublicos ? 'FONTE DOS PREÇOS' : 'DADOS DO FORNECEDOR', 20, y + 8);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Se for preços públicos (CNPJ 00000000000000), mostrar apenas a fonte
    if (isPrecosPublicos) {
      doc.text(`Fonte: ${fornecedor.razao_social}`, 20, y + 16);
    } else {
      doc.text(`Razão Social: ${fornecedor.razao_social}`, 20, y + 16);
      doc.text(`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`, 20, y + 22);
      if (fornecedor.endereco_comercial) {
        doc.text(`Endereço: ${fornecedor.endereco_comercial}`, 20, y + 28);
      }
      // Adicionar telefone e email se disponíveis
      let yExtra = y + 34;
      const dadosExtras = [];
      if ((fornecedor as any).telefone) dadosExtras.push(`Telefone: ${(fornecedor as any).telefone}`);
      if ((fornecedor as any).email) dadosExtras.push(`E-mail: ${(fornecedor as any).email}`);
      if (dadosExtras.length > 0) {
        doc.text(dadosExtras.join(' | '), 20, yExtra);
      }
    }
    
    y += alturaBloco + 6;

    // Título da seção de itens
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.text('ITENS DA PROPOSTA', 20, y);
    y += 8;

    // Cabeçalho da tabela com fundo
    doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.rect(15, y - 5, 180, 8, 'F');
    
    // Borda superior da tabela
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    doc.line(15, y - 5, 195, y - 5);
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ITEM', 20, y, { align: 'center' });
    doc.text('DESCRIÇÃO', 45, y, { align: 'center' });
    doc.text('QTD', 95, y, { align: 'center' });
    doc.text('UNID', 115, y, { align: 'center' });
    doc.text('MARCA', 135, y, { align: 'center' });
    
    // Se critério for desconto, apenas uma coluna; senão, duas colunas (unit + total)
    if (criterioJulgamento === 'desconto') {
      doc.text('DESCONTO (%)', 172.5, y, { align: 'center' });
    } else {
      doc.text('VL. UNIT.', 160, y, { align: 'center' });
      doc.text('VL. TOTAL', 185, y, { align: 'center' });
    }
    
    y += 6;
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);

    // Itens da proposta
    let isAlternate = false;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    for (const item of itensOrdenados) {
      const itemCotacao: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
      
      if (!itemCotacao) {
        console.warn('Item sem dados de cotação:', item);
        continue;
      }
      
      // Quebrar descrição em múltiplas linhas com alinhamento justificado
      const linhasDescricao = doc.splitTextToSize(itemCotacao.descricao, 45);
      const alturaLinha = Math.max(6, linhasDescricao.length * 4 + 2);
      
      // Verificar se precisa de nova página
      if (y + alturaLinha > 270) {
        doc.addPage();
        y = 20;
        
        // Repetir cabeçalho da tabela
        doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
        doc.rect(15, y - 5, 180, 8, 'F');
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.text('ITEM', 20, y, { align: 'center' });
        doc.text('DESCRIÇÃO', 45, y, { align: 'center' });
        doc.text('QTD', 95, y, { align: 'center' });
        doc.text('UNID', 115, y, { align: 'center' });
        doc.text('MARCA', 135, y, { align: 'center' });
        
        // Se critério for desconto, apenas uma coluna; senão, duas colunas (unit + total)
        if (criterioJulgamento === 'desconto') {
          doc.text('DESCONTO (%)', 172.5, y, { align: 'center' });
        } else {
          doc.text('VL. UNIT.', 160, y, { align: 'center' });
          doc.text('VL. TOTAL', 185, y, { align: 'center' });
        }
        y += 6;
        doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
      }
      
      // Usar o valor correto dependendo do critério de julgamento
      const valorUnitario = criterioJulgamento === 'desconto' 
        ? (item.percentual_desconto || 0)
        : item.valor_unitario_ofertado;
      const valorTotalItem = valorUnitario * itemCotacao.quantidade;

      // Fundo alternado
      if (isAlternate) {
        doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
        doc.rect(15, y - 4, 180, alturaLinha, 'F');
      }

      // Bordas cinzas suaves
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      
      // Linha horizontal inferior
      doc.line(15, y + alturaLinha - 4, 195, y + alturaLinha - 4);
      
      // Linhas verticais entre colunas
      const yTop = y - 4;
      const yBottom = y + alturaLinha - 4;
      doc.line(25, yTop, 25, yBottom); // Após ITEM
      doc.line(75, yTop, 75, yBottom); // Após DESCRIÇÃO
      doc.line(105, yTop, 105, yBottom); // Após QTD
      doc.line(125, yTop, 125, yBottom); // Após UNID
      doc.line(150, yTop, 150, yBottom); // Após MARCA
      
      // Se critério não for desconto, adicionar linha vertical após VL. UNIT.
      if (criterioJulgamento !== 'desconto') {
        doc.line(172, yTop, 172, yBottom); // Após VL. UNIT.
      }
      
      // Bordas externas da tabela (esquerda e direita)
      doc.line(15, yTop, 15, yBottom); // Borda esquerda
      doc.line(195, yTop, 195, yBottom); // Borda direita

      // Calcular centro vertical real da célula (baseline do texto)
      const yCenter = yTop + (alturaLinha / 2) + 1.5;
      
      // Número do item (centralizado verticalmente)
      doc.text(itemCotacao.numero_item.toString(), 20, yCenter, { align: 'center' });
      
      // Descrição completa com múltiplas linhas e alinhamento justificado (centralizada verticalmente)
      const yDescStart = yTop + (alturaLinha - linhasDescricao.length * 3.5) / 2 + 2.5;
      doc.text(linhasDescricao, 28, yDescStart, { maxWidth: 45, align: 'justify' });
      
      // Demais colunas (todas centralizadas verticalmente)
      doc.text(itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 90, yCenter, { align: 'center' });
      doc.text(itemCotacao.unidade, 115, yCenter, { align: 'center' });
      doc.text(item.marca || '-', 137.5, yCenter, { align: 'center' });
      
      // Formatar valores de acordo com o critério de julgamento
      if (criterioJulgamento === 'desconto') {
        // Quando é desconto, mostrar apenas uma coluna com o desconto unitário
        const descontoFormatted = `${valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
        doc.text(descontoFormatted, 172.5, yCenter, { align: 'center' });
      } else {
        // Quando não é desconto, mostrar valor unitário e valor total
        const valorUnitFormatted = valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const valorTotalFormatted = valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        doc.text(valorUnitFormatted, 161, yCenter, { align: 'center' });
        doc.text(valorTotalFormatted, 183.5, yCenter, { align: 'center' });
      }
      
      y += alturaLinha;
      isAlternate = !isAlternate;
    }

    // Linha de separação
    y += 2;
    doc.setDrawColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);
    y += 8;

    // Valor total com destaque (APENAS quando não for desconto)
    if (criterioJulgamento !== 'desconto') {
      doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.rect(120, y - 6, 75, 12, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      
      const valorTotalFormatted = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      doc.text(`VALOR TOTAL: ${valorTotalFormatted}`, 193, y, { align: 'right' });
      
      doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
      y += 15;
    }

    // Observações
    if (observacoes) {
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(11);
      doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.text('OBSERVAÇÕES:', 20, y);
      y += 7;

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(9);
      doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
      const obsLines = doc.splitTextToSize(observacoes, 170);
      doc.text(obsLines, 20, y);
      y += obsLines.length * 5;
    }

    // Adicionar espaço extra após observações ou valor total
    y += 10;

    // Gerar protocolo
    const protocolo = gerarProtocolo();

    // Salvar o protocolo no banco
    const { error: protocoloError } = await supabaseAnon
      .from('cotacao_respostas_fornecedor')
      .update({ 
        protocolo: protocolo
      })
      .eq('id', respostaId);

    if (protocoloError) {
      console.error('Erro ao salvar protocolo:', protocoloError);
    }

    // Gerar PDF base como blob
    const pdfBlob = doc.output('blob');
    
    // Carregar PDF base com pdf-lib
    const pdfPropostaBytes = await pdfBlob.arrayBuffer();
    let pdfFinal = await PDFDocument.load(pdfPropostaBytes);
    
    // Adicionar certificação ANTES de mesclar comprovantes
    // Verificar se há espaço na última página
    const ultimaPagina = pdfFinal.getPage(pdfFinal.getPageCount() - 1);
    const { height } = ultimaPagina.getSize();
    
    // Altura do quadro de certificação
    const alturaQuadroCert = 100;
    
    // Converter posição Y do jsPDF para pdf-lib (invertendo o eixo Y)
    // jsPDF mede do topo para baixo, pdf-lib mede de baixo para cima
    const yPosJsPDF = y; // Posição atual no jsPDF
    const yPosPdfLib = height - (yPosJsPDF * 2.83465); // Conversão de mm para pontos
    
    // Verificar se há espaço suficiente na página atual
    let paginaCert;
    let yPosCert;
    
    if (yPosPdfLib < alturaQuadroCert + 20) {
      // Não há espaço suficiente - criar nova página
      paginaCert = pdfFinal.addPage();
      yPosCert = height - 60; // Posicionar no topo da nova página
    } else {
      // Usar a última página com a posição calculada
      paginaCert = ultimaPagina;
      yPosCert = yPosPdfLib - 20; // Adicionar pequeno espaço
    }

    const { width } = paginaCert.getSize();
    const font = await pdfFinal.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfFinal.embedFont(StandardFonts.HelveticaBold);

    // Altura do quadro de certificação (ajustado com responsável)
    const alturaQuadro = 95;

    // Desenhar retângulo de fundo
    paginaCert.drawRectangle({
      x: 40,
      y: yPosCert - alturaQuadro,
      width: width - 80,
      height: alturaQuadro,
      color: rgb(0.96, 0.96, 0.96),
      borderColor: rgb(0, 0, 0),
      borderWidth: 1,
    });

    // Título
    paginaCert.drawText('CERTIFICAÇÃO DIGITAL', {
      x: width / 2 - 80,
      y: yPosCert - 15,
      size: 12,
      font: fontBold,
      color: rgb(0, 0, 0.55),
    });

    let yPos = yPosCert - 35;
    const fontSize = 10;
    const lineHeight = 15;

    // Responsável pela geração
    // Se for preços públicos (CNPJ 00000000000000), SEMPRE usar o usuário que preencheu
    // Se for fornecedor normal, usar a razão social do fornecedor
    const responsavel = fornecedor.cnpj === '00000000000000'
      ? (usuarioNome || 'Não informado')
      : fornecedor.razao_social;
    
    paginaCert.drawText(`Responsável: ${responsavel}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Protocolo
    paginaCert.drawText(`Protocolo: ${protocolo}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Link de verificação
    const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;
    paginaCert.drawText('Verificar autenticidade em:', {
      x: 50,
      y: yPos,
      size: 9,
      font: fontBold,
    });
    yPos -= 12;

    paginaCert.drawText(linkVerificacao, {
      x: 50,
      y: yPos,
      size: 7,
      font: font,
      color: rgb(0, 0, 1),
    });
    yPos -= 12;

    // Texto legal
    paginaCert.drawText('Este documento possui certificação digital conforme Lei 14.063/2020', {
      x: 50,
      y: yPos,
      size: 7,
      font: font,
      color: rgb(0.3, 0.3, 0.3),
    });

    // AGORA sim salvar e calcular hash
    const pdfComCertBytes = await pdfFinal.save();
    const hash = await gerarHashDocumento(pdfComCertBytes as unknown as ArrayBuffer);
    
    console.log('Hash calculado do PDF (com certificação, sem comprovantes):', hash);

    // Se houver comprovantes PDF, carregar novamente e mesclar
    console.log('🔄 Verificando comprovantes para mesclar...', comprovantes.length);
    if (comprovantes.length > 0) {
      console.log('✅ Iniciando mesclagem de', comprovantes.length, 'comprovantes');
      pdfFinal = await PDFDocument.load(pdfComCertBytes);
      
      for (const comprovante of comprovantes) {
        try {
          console.log('📄 Processando comprovante:', comprovante.name, 'tipo:', comprovante.type);
          // Só tenta mesclar se for PDF
          if (comprovante.type === 'application/pdf' || comprovante.name.toLowerCase().endsWith('.pdf')) {
            console.log('✅ Arquivo é PDF, mesclando...');
            const comprovanteBytes = await comprovante.arrayBuffer();
            const pdfComprovante = await PDFDocument.load(comprovanteBytes);
            
            const pageIndices = pdfComprovante.getPageIndices();
            const copiedPages = await pdfFinal.copyPages(pdfComprovante, pageIndices);
            
            copiedPages.forEach((page) => {
              pdfFinal.addPage(page);
            });
            
            console.log('✅ Comprovante mesclado com sucesso:', comprovante.name);
          } else {
            console.log('⚠️ Comprovante não-PDF será enviado separadamente:', comprovante.name);
          }
        } catch (error) {
          console.error('❌ Erro ao mesclar comprovante:', comprovante.name, error);
        }
      }
    } else {
      console.log('ℹ️ Nenhum comprovante para mesclar');
    }

    // Salvar PDF final (com certificação E comprovantes se houver)
    const pdfFinalBytes = await pdfFinal.save();
    const pdfFinalBlob = new Blob([pdfFinalBytes as unknown as BlobPart], { type: 'application/pdf' });

    const nomeArquivo = `proposta_${fornecedor.cnpj.replace(/[^\d]/g, '')}_${Date.now()}.pdf`;

    // Upload para o storage
    const { data: uploadData, error: uploadError } = await supabaseAnon.storage
      .from('processo-anexos')
      .upload(nomeArquivo, pdfFinalBlob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    return {
      url: uploadData.path,
      nome: nomeArquivo,
      hash: hash
    };

  } catch (error) {
    console.error('Erro ao gerar PDF da proposta:', error);
    throw error;
  }
}

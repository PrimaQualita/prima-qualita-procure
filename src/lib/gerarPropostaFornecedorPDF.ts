import jsPDF from 'jspdf';
import { PDFDocument } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { gerarHashDocumento, adicionarCertificacaoDigital } from './certificacaoDigital';
import { v4 as uuidv4 } from 'uuid';

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
  usuarioCpf?: string
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

    // Criar conteúdo para hash de certificação
    const dataGeracao = new Date().toLocaleString('pt-BR');
    const conteudoHash = `
      Fornecedor: ${fornecedor.razao_social}
      CNPJ: ${fornecedor.cnpj}
      Cotação: ${tituloCotacao}
      Data: ${dataGeracao}
      Valor Total: ${valorTotal.toFixed(2)}
      Itens: ${JSON.stringify(itens)}
    `;
    
    const hash = await gerarHashDocumento(conteudoHash);

    const doc = new jsPDF();
    
    // Cores do sistema (HSL convertido para RGB)
    // --primary: 196 100% 20% = rgb(0, 102, 102)
    // --secondary: 210 100% 20% = rgb(0, 102, 153)
    // --muted: 196 100% 87% = rgb(209, 247, 247)
    // --foreground: 199 100% 14% = rgb(0, 71, 71)
    // --accent: 196 100% 75% = rgb(128, 242, 242)
    
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
    doc.text('PROPOSTA DE PREÇOS PÚBLICOS', 105, 25, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ref: ${tituloCotacao}`, 105, 38, { align: 'center' });
    
    y = 60;

    // Bloco de informações do fornecedor com fundo
    doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
    doc.rect(15, y, 180, 26, 'F');
    
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text('FONTE DOS PREÇOS', 20, y + 8);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.text(`Nome: ${fornecedor.razao_social}`, 20, y + 16);
    doc.text(`CNPJ: ${fornecedor.cnpj}`, 20, y + 22);
    
    y += 32;

    // Título da seção de itens
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.text('ITENS DA PROPOSTA', 20, y);
    y += 8;

    // Cabeçalho da tabela com fundo
    // Larguras das colunas: Item(10), Desc(60), Qtd(18), Unid(20), VlrUnit(28), VlrTotal(28)
    doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.rect(15, y - 5, 180, 8, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    
    // Cabeçalhos das colunas com posições ajustadas
    doc.text('Item', 20, y + 1, { align: 'center' });
    doc.text('Descrição', 55, y + 1, { align: 'left' });
    doc.text('Qtd', 119, y + 1, { align: 'center' });
    doc.text('Unid', 135, y + 1, { align: 'center' });
    doc.text('Vlr Unit', 158, y + 1, { align: 'right' });
    doc.text('Vlr Total', 185, y + 1, { align: 'right' });
    y += 5;

    // Itens com linhas alternadas
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    let subtotal = 0;
    let isAlternate = false;

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
      if (y > 265) {
        doc.addPage();
        y = 20;
        isAlternate = false;
      }

      // Fundo alternado para as linhas
      if (isAlternate) {
        doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
        doc.rect(15, y - 3.5, 180, 7, 'F');
      }
      
      const valorTotal = item.quantidade * item.valor_unitario_ofertado;
      subtotal += valorTotal;

      doc.setFontSize(8);
      // Item (coluna 1: 15-25) - centralizado
      doc.text(item.numero_item.toString(), 20, y + 1, { align: 'center' });
      
      // Descrição (coluna 2: 30-110) - largura de 55
      const descricaoMaxWidth = 55;
      const descricaoLines = doc.splitTextToSize(item.descricao, descricaoMaxWidth);
      doc.text(descricaoLines[0], 30, y + 1);
      
      // Quantidade (coluna 3: 110-123) - centralizado
      doc.text(item.quantidade.toFixed(2), 119, y + 1, { align: 'center' });
      
      // Unidade (coluna 4: 123-143) - centralizado
      doc.text(item.unidade, 135, y + 1, { align: 'center' });
      
      // Valor Unitário (coluna 5: 143-171) - alinhado à direita
      doc.text(`R$ ${item.valor_unitario_ofertado.toFixed(2)}`, 158, y + 1, { align: 'right' });
      
      // Valor Total (coluna 6: 171-195) - alinhado à direita
      doc.text(`R$ ${valorTotal.toFixed(2)}`, 185, y + 1, { align: 'right' });
      
      y += 7;
      isAlternate = !isAlternate;
    }


    // Linha de separação
    y += 2;
    doc.setDrawColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);
    y += 8;

    // Valor total com destaque
    doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.rect(120, y - 6, 75, 12, 'F');
    
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.text(`VALOR TOTAL: R$ ${valorTotal.toFixed(2)}`, 193, y, { align: 'right' });
    
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    y += 15;

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

    // Certificação Digital
    if (y > 220) {
      doc.addPage();
      y = 20;
    }

    y += 10;

    const protocolo = uuidv4();
    const linkVerificacao = `${window.location.origin}/verificar-proposta?protocolo=${protocolo}`;

    // Salvar o protocolo no banco ANTES de gerar o PDF
    await supabase.from('anexos_cotacao_fornecedor').insert({
      cotacao_resposta_fornecedor_id: respostaId,
      tipo_anexo: 'protocolo_certificacao',
      nome_arquivo: `protocolo_${protocolo}`,
      url_arquivo: protocolo
    });

    adicionarCertificacaoDigital(doc, {
      protocolo,
      dataHora: dataGeracao,
      responsavel: usuarioNome || fornecedor.razao_social,
      cpf: usuarioCpf || fornecedor.cnpj,
      hash,
      linkVerificacao
    }, y);

    // Gerar PDF base como blob
    const pdfBlob = doc.output('blob');
    
    // Se houver comprovantes, mesclar os PDFs
    let pdfFinal: Blob;
    
    if (comprovantes.length > 0) {
      // Carregar o PDF da proposta
      const pdfPropostaBytes = await pdfBlob.arrayBuffer();
      const pdfProposta = await PDFDocument.load(pdfPropostaBytes);
      
      // Mesclar cada comprovante na ordem
      for (const comprovante of comprovantes) {
        try {
          const comprovanteBytes = await comprovante.arrayBuffer();
          const pdfComprovante = await PDFDocument.load(comprovanteBytes);
          
          // Copiar todas as páginas do comprovante para a proposta
          const pageIndices = pdfComprovante.getPageIndices();
          const copiedPages = await pdfProposta.copyPages(pdfComprovante, pageIndices);
          
          copiedPages.forEach((page) => {
            pdfProposta.addPage(page);
          });
        } catch (error) {
          console.error('Erro ao mesclar comprovante:', error);
        }
      }
      
      // Salvar PDF mesclado
      const pdfMescladoBytes = await pdfProposta.save();
      pdfFinal = new Blob([new Uint8Array(pdfMescladoBytes)], { type: 'application/pdf' });
    } else {
      pdfFinal = pdfBlob;
    }

    const nomeArquivo = `proposta_${fornecedor.cnpj.replace(/[^\d]/g, '')}_${Date.now()}.pdf`;

    // Upload para o storage
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(nomeArquivo, pdfFinal, {
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

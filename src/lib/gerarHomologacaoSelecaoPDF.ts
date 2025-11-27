import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import capaLogo from "@/assets/capa-processo-logo.png";
import capaRodape from "@/assets/capa-processo-rodape.png";

const formatarProtocoloExibicao = (uuid: string): string => {
  const limpo = uuid.replace(/-/g, '').toUpperCase().substring(0, 16);
  return `${limpo.substring(0, 4)}-${limpo.substring(4, 8)}-${limpo.substring(8, 12)}-${limpo.substring(12, 16)}`;
};

export async function gerarHomologacaoSelecaoPDF(selecaoId: string) {
  try {
    // Buscar dados da seleção e processo
    const { data: selecao, error: selecaoError } = await supabase
      .from("selecoes_fornecedores")
      .select(`
        *,
        processos_compras (
          numero_processo_interno,
          objeto_resumido,
          criterio_julgamento,
          contratos_gestao (
            ente_federativo
          )
        )
      `)
      .eq("id", selecaoId)
      .single();

    if (selecaoError) throw selecaoError;
    if (!selecao) throw new Error("Seleção não encontrada");

    const processo = selecao.processos_compras as any;
    const criterioJulgamento = processo?.criterio_julgamento;
    const enteFederativo = processo?.contratos_gestao?.ente_federativo || "Santa Maria Madalena - RJ";

    // Buscar itens e vencedores
    const { data: todosLancesData, error: lancesError } = await supabase
      .from("lances_fornecedores")
      .select(`
        numero_item,
        valor_lance,
        fornecedor_id,
        tipo_lance,
        fornecedores (
          razao_social,
          cnpj
        )
      `)
      .eq("selecao_id", selecaoId);

    if (lancesError) throw lancesError;

    // Buscar inabilitações
    const { data: inabilitacoesData } = await supabase
      .from("fornecedores_inabilitados_selecao")
      .select("fornecedor_id, itens_afetados, revertido")
      .eq("selecao_id", selecaoId);

    // Filtrar inabilitados
    const inabilitacoesPorFornecedor = new Map<string, number[]>();
    (inabilitacoesData || []).forEach((inab) => {
      if (!inab.revertido) {
        inabilitacoesPorFornecedor.set(inab.fornecedor_id, inab.itens_afetados || []);
      }
    });

    const lancesFiltrados = (todosLancesData || []).filter((lance: any) => {
      const itensInabilitados = inabilitacoesPorFornecedor.get(lance.fornecedor_id);
      if (!itensInabilitados) return true;
      return !itensInabilitados.includes(lance.numero_item || 0);
    });

    // Ordenar e identificar vencedores
    const isDesconto = criterioJulgamento === "desconto";
    const lancesOrdenados = lancesFiltrados.sort((a: any, b: any) => {
      if (a.numero_item !== b.numero_item) {
        return a.numero_item - b.numero_item;
      }
      const aIsNegociacao = a.tipo_lance === "negociacao";
      const bIsNegociacao = b.tipo_lance === "negociacao";
      if (aIsNegociacao && !bIsNegociacao) return -1;
      if (!aIsNegociacao && bIsNegociacao) return 1;
      if (isDesconto) {
        return b.valor_lance - a.valor_lance;
      } else {
        return a.valor_lance - b.valor_lance;
      }
    });

    const vencedoresPorItem = new Map<number, any>();
    lancesOrdenados.forEach((lance: any) => {
      if (!vencedoresPorItem.has(lance.numero_item || 0)) {
        vencedoresPorItem.set(lance.numero_item || 0, lance);
      }
    });

    // Agrupar por fornecedor
    const vencedoresPorFornecedor = new Map<string, { fornecedor: any; itens: number[]; valorTotal: number }>();
    
    vencedoresPorItem.forEach((lance, numeroItem) => {
      const fornecedorId = lance.fornecedor_id;
      if (!vencedoresPorFornecedor.has(fornecedorId)) {
        vencedoresPorFornecedor.set(fornecedorId, {
          fornecedor: lance.fornecedores,
          itens: [],
          valorTotal: 0
        });
      }
      const grupo = vencedoresPorFornecedor.get(fornecedorId)!;
      grupo.itens.push(numeroItem);
      grupo.valorTotal += lance.valor_lance || 0;
    });

    // Converter imagens para base64
    const toBase64 = (url: string): Promise<string> => {
      return new Promise((resolve, reject) => {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.onload = () => {
          const canvas = document.createElement("canvas");
          canvas.width = img.width;
          canvas.height = img.height;
          const ctx = canvas.getContext("2d");
          ctx?.drawImage(img, 0, 0);
          resolve(canvas.toDataURL("image/png"));
        };
        img.onerror = reject;
        img.src = url;
      });
    };

    const logoBase64 = await toBase64(capaLogo);
    const rodapeBase64 = await toBase64(capaRodape);

    // Gerar PDF
    const doc = new jsPDF("portrait");
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    
    // Margens de 1.5mm convertido para pontos (1mm = 2.83465pt, então 1.5mm ≈ 4.25pt)
    const sideMargin = 1.5 * 2.83465; // ~4.25pt = 1.5mm
    const marginLeft = 15;
    const marginRight = 15;
    const contentWidth = pageWidth - marginLeft - marginRight;
    
    const logoHeight = 40;
    const rodapeHeight = 25;
    const contentStartY = logoHeight + 10;
    const contentEndY = pageHeight - rodapeHeight - 8;

    // Logo no topo com margem de 1.5mm
    doc.addImage(logoBase64, 'PNG', sideMargin, 0, pageWidth - (sideMargin * 2), logoHeight);

    // Rodapé com margem de 1.5mm
    doc.addImage(rodapeBase64, 'PNG', sideMargin, pageHeight - rodapeHeight, pageWidth - (sideMargin * 2), rodapeHeight);

    let yPosition = contentStartY;

    // Título
    doc.setFontSize(16);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 128, 128); // Verde Prima Qualitá
    doc.text("TERMO DE HOMOLOGAÇÃO", pageWidth / 2, yPosition, { align: "center" });
    yPosition += 12;

    // Número do processo
    doc.setFontSize(14);
    doc.text(`PROCESSO Nº ${processo.numero_processo_interno}`, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 10;

    // Número da seleção
    doc.text(`SELEÇÃO DE FORNECEDORES Nº ${selecao.numero_selecao}`, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 15;

    // Texto de homologação
    doc.setFontSize(11);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    
    // Limpar HTML tags do objeto
    const objetoLimpo = processo.objeto_resumido
      ?.replace(/<[^>]*>/g, '')
      .replace(/&nbsp;/g, ' ')
      .trim() || "N/A";

    const criterioTexto = criterioJulgamento === "por_item" 
      ? "menor preço unitário"
      : criterioJulgamento === "global" 
      ? "menor preço global"
      : criterioJulgamento === "por_lote"
      ? "menor preço por lote"
      : criterioJulgamento === "desconto"
      ? "maior percentual de desconto"
      : "menor preço";

    const contratoNumero = processo.numero_processo_interno?.split('/')[0] || "XXX";
    const contratoAno = processo.numero_processo_interno?.split('/')[1] || "XXXX";

    const textoHomologacao = `HOMOLOGO, nos termos da legislação em vigor, o Processo Interno nº ${processo.numero_processo_interno}, por meio da Seleção de Fornecedores nº ${selecao.numero_selecao}, cujo objeto consiste em ${objetoLimpo} vinculados ao Contrato de Gestão ${contratoNumero}/${contratoAno}, firmado com o município de ${enteFederativo}, pelo critério de ${criterioTexto}, pelo Sistema de Registro de Preços, para atender as necessidades das unidades gerenciadas pela OS Prima Qualitá Saúde por meio de seus Contratos de Gestão, em favor das empresas:`;

    const linhasTexto = doc.splitTextToSize(textoHomologacao, contentWidth);
    linhasTexto.forEach((linha: string, index: number) => {
      const words = linha.split(' ');
      const lineWidth = doc.getTextWidth(linha);
      
      if (index < linhasTexto.length - 1 && words.length > 1) {
        // Justificar linhas intermediárias
        const totalSpacing = contentWidth - lineWidth;
        const spaceBetweenWords = totalSpacing / (words.length - 1);
        let xPos = marginLeft;
        
        words.forEach((word, wordIndex) => {
          doc.text(word, xPos, yPosition + (index * 5));
          if (wordIndex < words.length - 1) {
            xPos += doc.getTextWidth(word + ' ') + spaceBetweenWords;
          }
        });
      } else {
        // Última linha alinhada à esquerda
        doc.text(linha, marginLeft, yPosition + (index * 5));
      }
    });
    yPosition += linhasTexto.length * 5 + 10;

    // Tabela de vencedores
    const empresasVencedoras: string[][] = [];
    vencedoresPorFornecedor.forEach((grupo) => {
      const itensStr = grupo.itens.sort((a, b) => a - b).join(", ");
      const valorStr = isDesconto 
        ? `${grupo.valorTotal.toFixed(2).replace('.', ',')}%`
        : grupo.valorTotal.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
      
      empresasVencedoras.push([
        grupo.fornecedor.razao_social,
        itensStr,
        valorStr
      ]);
    });

    // Cabeçalho da tabela
    doc.setFillColor(0, 128, 128);
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);

    const colWidths = [80, 50, 40];
    const tableX = marginLeft;
    
    // Desenhar retângulos do cabeçalho
    doc.rect(tableX, yPosition, colWidths[0], 8, "F");
    doc.rect(tableX + colWidths[0], yPosition, colWidths[1], 8, "F");
    doc.rect(tableX + colWidths[0] + colWidths[1], yPosition, colWidths[2], 8, "F");
    
    // Texto do cabeçalho
    doc.text("Empresa", tableX + 2, yPosition + 5.5);
    
    const headerItens = "Itens Vencedores";
    const headerItensWidth = doc.getTextWidth(headerItens);
    doc.text(headerItens, tableX + colWidths[0] + (colWidths[1] - headerItensWidth) / 2, yPosition + 5.5);
    
    const labelColuna3 = isDesconto ? "Desconto Vencedor" : "Valor (R$)";
    const headerValorWidth = doc.getTextWidth(labelColuna3);
    doc.text(labelColuna3, tableX + colWidths[0] + colWidths[1] + (colWidths[2] - headerValorWidth) / 2, yPosition + 5.5);
    
    yPosition += 8;

    // Linhas da tabela
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    empresasVencedoras.forEach((linha, idx) => {
      const bgColor = idx % 2 === 0 ? 245 : 255;
      doc.setFillColor(bgColor, bgColor, bgColor);
      
      const linhasEmpresa = doc.splitTextToSize(linha[0], colWidths[0] - 4);
      const linhasItens = linha[1];
      const linhasValor = linha[2];
      const maxLinhas = Math.max(linhasEmpresa.length, 1);
      const altura = maxLinhas * 5 + 2;

      doc.rect(tableX, yPosition, colWidths[0], altura);
      doc.rect(tableX + colWidths[0], yPosition, colWidths[1], altura);
      doc.rect(tableX + colWidths[0] + colWidths[1], yPosition, colWidths[2], altura);

      doc.text(linhasEmpresa, tableX + 2, yPosition + 4);
      
      // Centralizar itens
      const itensWidth = doc.getTextWidth(linha[1]);
      doc.text(linha[1], tableX + colWidths[0] + (colWidths[1] - itensWidth) / 2, yPosition + 4);
      
      // Centralizar valor/desconto
      const valorWidth = doc.getTextWidth(linha[2]);
      doc.text(linha[2], tableX + colWidths[0] + colWidths[1] + (colWidths[2] - valorWidth) / 2, yPosition + 4);

      yPosition += altura;
    });

    yPosition += 20;

    // CERTIFICAÇÃO DIGITAL (igual à Ata)
    const protocolo = uuidv4();
    const protocoloFormatado = formatarProtocoloExibicao(protocolo);
    
    // Buscar nome do responsável legal (usuário logado)
    const { data: userData } = await supabase.auth.getUser();
    const { data: profileData } = await supabase
      .from("profiles")
      .select("nome_completo")
      .eq("id", userData.user?.id)
      .single();
    
    const nomeResponsavel = profileData?.nome_completo || "REPRESENTANTE LEGAL";
    const verificationUrl = `${window.location.origin}/verificar-documento?protocolo=${protocolo}`;
    
    // Posicionar certificação acima do rodapé
    const certY = contentEndY - 40;
    
    doc.setFontSize(8);
    const urlLines = doc.splitTextToSize(verificationUrl, contentWidth - 10);
    const certHeight = 38 + (urlLines.length * 3.5);
    
    // Fundo cinza
    doc.setFillColor(245, 245, 245);
    doc.rect(marginLeft, certY, contentWidth, certHeight, 'F');
    
    // Borda
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(0.5);
    doc.rect(marginLeft, certY, contentWidth, certHeight, 'S');

    // Título em azul escuro
    doc.setFontSize(11);
    doc.setFont("helvetica", "bold");
    doc.setTextColor(0, 0, 139);
    doc.text("CERTIFICAÇÃO DIGITAL", marginLeft + contentWidth / 2, certY + 6, { align: "center" });

    doc.setFontSize(9);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 0);
    
    let certTextY = certY + 13;
    
    // Protocolo
    doc.text(`Protocolo:  ${protocoloFormatado}`, marginLeft + 5, certTextY);
    certTextY += 4;
    
    // Responsável
    doc.text(`Responsável:  ${nomeResponsavel}`, marginLeft + 5, certTextY);
    certTextY += 5;
    
    // Verificação - Label
    doc.setFont("helvetica", "bold");
    doc.text("Verificar autenticidade em:", marginLeft + 5, certTextY);
    certTextY += 3.5;
    
    // URL como link clicável
    doc.setFont("helvetica", "normal");
    doc.setTextColor(0, 0, 255);
    doc.setFontSize(8);
    urlLines.forEach((linha: string, index: number) => {
      doc.textWithLink(linha, marginLeft + 5, certTextY + (index * 3.5), { url: verificationUrl });
    });
    certTextY += urlLines.length * 3.5 + 2.5;
    
    // Texto legal
    doc.setTextColor(80, 80, 80);
    doc.setFontSize(7);
    doc.text("Este documento possui certificação digital conforme Lei 14.063/2020", marginLeft + 5, certTextY);
    doc.setTextColor(0, 0, 0);

    // Salvar PDF
    const pdfBlob = doc.output("blob");
    const nomeArquivo = `homologacao-SF-${selecao.numero_selecao}-${Date.now()}.pdf`;
    const storagePath = `homologacoes-selecao/${selecaoId}/${nomeArquivo}`;

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("processo-anexos")
      .upload(storagePath, pdfBlob, {
        contentType: "application/pdf",
        upsert: false,
      });

    if (uploadError) throw uploadError;

    const { data: urlData } = supabase.storage
      .from("processo-anexos")
      .getPublicUrl(storagePath);

    // Salvar registro no banco
    const { data: homologacao, error: insertError } = await supabase
      .from("homologacoes_selecao")
      .insert({
        selecao_id: selecaoId,
        protocolo: protocolo,
        nome_arquivo: nomeArquivo,
        url_arquivo: urlData.publicUrl,
        usuario_gerador_id: userData.user?.id,
      })
      .select()
      .single();

    if (insertError) throw insertError;

    return { 
      homologacao, 
      url: urlData.publicUrl,
      protocolo 
    };

  } catch (error) {
    console.error("Erro ao gerar homologação:", error);
    throw error;
  }
}

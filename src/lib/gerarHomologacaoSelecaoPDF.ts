import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";
import { v4 as uuidv4 } from "uuid";
import capaLogo from "@/assets/capa-processo-logo.png";
import capaRodape from "@/assets/capa-processo-rodape.png";

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
          criterio_julgamento
        )
      `)
      .eq("id", selecaoId)
      .single();

    if (selecaoError) throw selecaoError;
    if (!selecao) throw new Error("Seleção não encontrada");

    const processo = selecao.processos_compras as any;
    const criterioJulgamento = processo?.criterio_julgamento;

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

    // Gerar PDF
    const doc = new jsPDF("portrait");
    const pageWidth = doc.internal.pageSize.width;
    const pageHeight = doc.internal.pageSize.height;
    const margin = 15;

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

    const base64Logo = await toBase64(capaLogo);
    const base64Rodape = await toBase64(capaRodape);

    // Logo no topo
    const logoWidth = pageWidth;
    const logoHeight = 40;
    doc.addImage(base64Logo, "PNG", 0, 0, logoWidth, logoHeight);

    // Rodapé
    const rodapeHeight = 30;
    doc.addImage(base64Rodape, "PNG", 0, pageHeight - rodapeHeight, pageWidth, rodapeHeight);

    let yPosition = logoHeight + 15;

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

    const textoHomologacao = `HOMOLOGO, nos termos da legislação em vigor, o Processo Interno nº ${processo.numero_processo_interno}, por meio da Seleção de Fornecedores nº ${selecao.numero_selecao}, cujo objeto consiste em ${objetoLimpo}, pelo critério de ${criterioTexto}, pelo Sistema de Registro de Preços, para atender as necessidades das unidades gerenciadas pela OS Prima Qualitá Saúde por meio de seus Contratos de Gestão, em favor das empresas:`;

    const linhasTexto = doc.splitTextToSize(textoHomologacao, pageWidth - 2 * margin);
    doc.text(linhasTexto, margin, yPosition, { align: "justify" });
    yPosition += linhasTexto.length * 6 + 10;

    // Tabela de vencedores
    const empresasVencedoras: string[][] = [];
    vencedoresPorFornecedor.forEach((grupo) => {
      const itensStr = grupo.itens.sort((a, b) => a - b).join(", ");
      const valorStr = isDesconto 
        ? "-" 
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
    const tableX = margin;
    
    // Header
    doc.rect(tableX, yPosition, colWidths[0], 8, "F");
    doc.text("Empresa", tableX + 2, yPosition + 5.5);
    
    doc.rect(tableX + colWidths[0], yPosition, colWidths[1], 8, "F");
    doc.text("Itens Vencedores", tableX + colWidths[0] + 2, yPosition + 5.5);
    
    doc.rect(tableX + colWidths[0] + colWidths[1], yPosition, colWidths[2], 8, "F");
    doc.text("Valor (R$)", tableX + colWidths[0] + colWidths[1] + 2, yPosition + 5.5);
    
    yPosition += 8;

    // Linhas da tabela
    doc.setTextColor(0, 0, 0);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);

    empresasVencedoras.forEach((linha, idx) => {
      const bgColor = idx % 2 === 0 ? 245 : 255;
      doc.setFillColor(bgColor, bgColor, bgColor);
      
      const linhasEmpresa = doc.splitTextToSize(linha[0], colWidths[0] - 4);
      const linhasItens = doc.splitTextToSize(linha[1], colWidths[1] - 4);
      const maxLinhas = Math.max(linhasEmpresa.length, linhasItens.length, 1);
      const altura = maxLinhas * 5 + 2;

      doc.rect(tableX, yPosition, colWidths[0], altura, "F");
      doc.rect(tableX + colWidths[0], yPosition, colWidths[1], altura, "F");
      doc.rect(tableX + colWidths[0] + colWidths[1], yPosition, colWidths[2], altura, "F");

      doc.text(linhasEmpresa, tableX + 2, yPosition + 4);
      doc.text(linhasItens, tableX + colWidths[0] + 2, yPosition + 4);
      doc.text(linha[2], tableX + colWidths[0] + colWidths[1] + 2, yPosition + 4);

      yPosition += altura;
    });

    yPosition += 20;

    // Data e local
    const dataAtual = new Date().toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "long",
      year: "numeric"
    });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(11);
    doc.text(`São Paulo, ${dataAtual}.`, margin, yPosition);
    yPosition += 20;

    // Linha de assinatura
    doc.setLineWidth(0.5);
    doc.line(margin + 20, yPosition, pageWidth - margin - 20, yPosition);
    yPosition += 6;

    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.text("REPRESENTANTE LEGAL", pageWidth / 2, yPosition, { align: "center" });

    // Certificação Digital Simplificada
    yPosition = pageHeight - rodapeHeight - 25;
    
    const protocolo = `${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}-${Math.random().toString(36).substr(2, 4).toUpperCase()}`;
    
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(0, 128, 128);
    doc.text("CERTIFICAÇÃO DIGITAL", pageWidth / 2, yPosition, { align: "center" });
    yPosition += 5;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(0, 0, 0);
    doc.text(`Protocolo:  ${protocolo}`, pageWidth / 2, yPosition, { align: "center" });
    yPosition += 4;

    doc.text("Responsável:  REPRESENTANTE LEGAL", pageWidth / 2, yPosition, { align: "center" });
    yPosition += 4;

    const linkVerificacao = `${window.location.origin}/verificar-documento?protocolo=${protocolo}`;
    doc.setTextColor(0, 0, 255);
    doc.textWithLink("Verificar autenticidade", pageWidth / 2, yPosition, { 
      align: "center",
      url: linkVerificacao
    });

    // Salvar PDF
    const pdfBlob = doc.output("blob");
    const nomeArquivo = `Homologacao_SF${selecao.numero_selecao}_${Date.now()}.pdf`;
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
    const { data: user } = await supabase.auth.getUser();
    
    const { data: homologacao, error: insertError } = await supabase
      .from("homologacoes_selecao")
      .insert({
        selecao_id: selecaoId,
        protocolo: protocolo,
        nome_arquivo: nomeArquivo,
        url_arquivo: urlData.publicUrl,
        usuario_gerador_id: user?.user?.id,
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

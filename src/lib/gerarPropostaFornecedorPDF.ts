import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { gerarHashDocumento } from './certificacaoDigital';
import { valorPorExtenso } from './valorPorExtenso';
import type { SupabaseClient } from '@supabase/supabase-js';

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

// Função para sanitizar texto - remove/substitui caracteres especiais que jsPDF não renderiza bem
const sanitizarTexto = (texto: string): string => {
  if (!texto) return '';
  
  // Primeiro, substituir caracteres especiais conhecidos
  let resultado = texto
    // Superscript e subscript (SpO₂ usa subscript!)
    .replace(/²/g, '2')      // Superscript 2 (U+00B2)
    .replace(/₂/g, '2')      // Subscript 2 (U+2082)
    .replace(/³/g, '3')      // Superscript 3
    .replace(/₃/g, '3')      // Subscript 3
    .replace(/¹/g, '1')      // Superscript 1
    .replace(/₁/g, '1')      // Subscript 1
    .replace(/⁰/g, '0')      // Superscript 0
    .replace(/₀/g, '0')      // Subscript 0
    .replace(/⁴/g, '4')      // Superscript 4
    .replace(/₄/g, '4')      // Subscript 4
    .replace(/⁵/g, '5')      // Superscript 5
    .replace(/₅/g, '5')      // Subscript 5
    .replace(/⁶/g, '6')      // Superscript 6
    .replace(/₆/g, '6')      // Subscript 6
    .replace(/⁷/g, '7')      // Superscript 7
    .replace(/₇/g, '7')      // Subscript 7
    .replace(/⁸/g, '8')      // Superscript 8
    .replace(/₈/g, '8')      // Subscript 8
    .replace(/⁹/g, '9')      // Superscript 9
    .replace(/₉/g, '9')      // Subscript 9
    // Símbolos
    .replace(/°/g, 'o')      // Degree symbol
    .replace(/º/g, 'o')      // Ordinal masculine
    .replace(/ª/g, 'a')      // Ordinal feminine
    .replace(/½/g, '1/2')    // Fraction
    .replace(/¼/g, '1/4')    // Fraction
    .replace(/¾/g, '3/4')    // Fraction
    .replace(/×/g, 'x')      // Multiplication
    .replace(/÷/g, '/')      // Division
    .replace(/±/g, '+/-')    // Plus-minus
    .replace(/≥/g, '>=')     // Greater or equal
    .replace(/≤/g, '<=')     // Less or equal
    .replace(/µ/g, 'u')      // Micro (U+00B5)
    .replace(/μ/g, 'u')      // Greek mu (U+03BC)
    .replace(/®/g, '(R)')    // Registered
    .replace(/™/g, '(TM)')   // Trademark
    .replace(/©/g, '(C)')    // Copyright
    .replace(/–/g, '-')      // En dash
    .replace(/—/g, '-')      // Em dash
    .replace(/'/g, "'")      // Smart quote
    .replace(/'/g, "'")      // Smart quote
    .replace(/"/g, '"')      // Smart quote
    .replace(/"/g, '"')      // Smart quote
    .replace(/…/g, '...')    // Ellipsis
    .replace(/•/g, '-')      // Bullet
    .replace(/→/g, '->')     // Arrow
    .replace(/←/g, '<-')     // Arrow
    .replace(/≈/g, '~')      // Approximately
    .replace(/≠/g, '!=')     // Not equal
    .replace(/∞/g, 'inf')    // Infinity
    .replace(/Ω/g, 'Ohm')    // Ohm
    .replace(/α/g, 'alfa')   // Alpha
    .replace(/β/g, 'beta')   // Beta
    .replace(/γ/g, 'gama')   // Gamma
    .replace(/δ/g, 'delta'); // Delta
  
  // Depois, converter caracteres acentuados para versão sem acento (jsPDF Helvetica não suporta bem)
  const acentos: { [key: string]: string } = {
    'á': 'a', 'à': 'a', 'ã': 'a', 'â': 'a', 'ä': 'a',
    'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
    'í': 'i', 'ì': 'i', 'î': 'i', 'ï': 'i',
    'ó': 'o', 'ò': 'o', 'õ': 'o', 'ô': 'o', 'ö': 'o',
    'ú': 'u', 'ù': 'u', 'û': 'u', 'ü': 'u',
    'ç': 'c', 'ñ': 'n',
    'Á': 'A', 'À': 'A', 'Ã': 'A', 'Â': 'A', 'Ä': 'A',
    'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
    'Í': 'I', 'Ì': 'I', 'Î': 'I', 'Ï': 'I',
    'Ó': 'O', 'Ò': 'O', 'Õ': 'O', 'Ô': 'O', 'Ö': 'O',
    'Ú': 'U', 'Ù': 'U', 'Û': 'U', 'Ü': 'U',
    'Ç': 'C', 'Ñ': 'N'
  };
  
  // Aplicar conversão de acentos
  resultado = resultado.split('').map(char => acentos[char] || char).join('');
  
  // Por fim, remover qualquer caractere não-ASCII restante que possa causar problemas
  resultado = resultado.replace(/[^\x20-\x7E\n\r\t]/g, '');
  
  return resultado;
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
  email?: string;
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
  criterioJulgamento?: string,
  supabaseClient?: SupabaseClient<any, any, any>,
  responsavelLegal?: string,
  tipoProcesso?: string
): Promise<{ url: string; path: string; nome: string; hash: string; protocolo: string }> {
  // Usar cliente passado por parâmetro ou o default
  const sb = supabaseClient || supabase;
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
    console.log('📋 Critério de julgamento:', criterioJulgamento);
    
    const { data: itens, error: itensError } = await sb
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
          unidade,
          lote_id,
          lotes_cotacao (
            id,
            numero_lote,
            descricao_lote
          )
        )
      `)
      .eq('cotacao_resposta_fornecedor_id', respostaId);
    
    // Buscar lotes se critério for por_lote
    let lotesMap: Map<string, { numero_lote: number; descricao_lote: string }> = new Map();
    if (criterioJulgamento === 'por_lote' && itens && itens.length > 0) {
      const primeiroItem = itens[0] as any;
      const itemCot = Array.isArray(primeiroItem.itens_cotacao) ? primeiroItem.itens_cotacao[0] : primeiroItem.itens_cotacao;
      if (itemCot?.lotes_cotacao) {
        // Extrair lotes únicos de todos os itens
        itens.forEach((item: any) => {
          const ic = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
          if (ic?.lote_id && ic?.lotes_cotacao) {
            const lote = ic.lotes_cotacao;
            if (!lotesMap.has(ic.lote_id)) {
              lotesMap.set(ic.lote_id, { numero_lote: lote.numero_lote, descricao_lote: lote.descricao_lote });
            }
          }
        });
      }
    }

    console.log('📊 Resultado da busca:', {
      encontrou: itens?.length || 0,
      erro: itensError,
      primeirosItens: itens?.slice(0, 2).map(i => ({
        valor_unitario: i.valor_unitario_ofertado,
        percentual_desconto: i.percentual_desconto,
        numero_item: (Array.isArray(i.itens_cotacao) ? i.itens_cotacao[0] : i.itens_cotacao)?.numero_item
      }))
    });
    
    // Validar se é critério de desconto mas não tem dados de desconto
    if (criterioJulgamento === 'desconto' && itens && itens.length > 0) {
      const temDescontos = itens.some(i => i.percentual_desconto !== null && i.percentual_desconto !== undefined);
      if (!temDescontos) {
        console.warn('⚠️ AVISO: Esta é uma proposta ANTIGA criada antes da implementação do critério de desconto!');
        console.warn('⚠️ Os dados de desconto não existem para esta proposta.');
        console.warn('⚠️ Para ver os descontos corretos, visualize uma proposta mais recente ou envie uma nova.');
      }
    }
    
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
    
    // Função para identificar preço público - APENAS por email
    const ehPrecoPublico = (email?: string) => {
      return !!(email && email.includes('precos.publicos'));
    };
    
    const isPrecosPublicos = ehPrecoPublico((fornecedor as any).email);
    // Preços públicos NUNCA mostram marca
    const ocultarMarca = isPrecosPublicos;
    const tituloDocumento = isPrecosPublicos ? 'PROPOSTA DE PREÇOS PÚBLICOS' : 'PROPOSTA DE PREÇOS';
    doc.text(tituloDocumento, 105, 25, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ref. Processo: ${tituloCotacao}`, 105, 38, { align: 'center' });
    
    y = 60;

    // Bloco de informações do fornecedor com fundo
    // Calcular altura dinâmica do bloco baseado no conteúdo
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    const larguraInternaBloco = 170; // 180 de largura total - 10 de margem interna (20-15=5 cada lado)
    
    let alturaBloco: number;
    if (isPrecosPublicos) {
      alturaBloco = 26;
    } else {
      // Calcular altura necessária para o endereço
      let linhasEndereco = 0;
      if (fornecedor.endereco_comercial) {
        const enderecoTexto = `Endereco: ${fornecedor.endereco_comercial}`;
        const enderecoLines = doc.splitTextToSize(enderecoTexto, larguraInternaBloco);
        linhasEndereco = enderecoLines.length;
      }
      // Base: título(8) + razão(6) + cnpj(6) + endereço(linhas*5) + extras(6) + padding(6)
      const alturaEndereco = linhasEndereco > 0 ? linhasEndereco * 5 : 0;
      alturaBloco = 8 + 6 + 6 + alturaEndereco + 6 + 6 + 4;
    }
    
    doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
    doc.rect(15, y, 180, alturaBloco, 'F');
    
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.text(isPrecosPublicos ? 'FONTE DOS PREÇOS' : 'DADOS DO FORNECEDOR', 20, y + 8);
    
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    
    // Se for preços públicos, mostrar apenas a fonte (sem CNPJ/email)
    if (isPrecosPublicos) {
      doc.text(`Fonte: ${fornecedor.razao_social}`, 20, y + 16);
    } else {
      doc.text(`Razão Social: ${fornecedor.razao_social}`, 20, y + 16);
      doc.text(`CNPJ: ${formatarCNPJ(fornecedor.cnpj)}`, 20, y + 22);
      let yConteudo = y + 28;
      if (fornecedor.endereco_comercial) {
        const enderecoTexto = `Endereco: ${fornecedor.endereco_comercial}`;
        const enderecoLines = doc.splitTextToSize(enderecoTexto, larguraInternaBloco);
        doc.text(enderecoLines, 20, yConteudo);
        yConteudo += enderecoLines.length * 5 + 1;
      }
      // Adicionar telefone e email se disponíveis
      const dadosExtras = [];
      if ((fornecedor as any).telefone) dadosExtras.push(`Telefone: ${(fornecedor as any).telefone}`);
      if ((fornecedor as any).email) dadosExtras.push(`E-mail: ${(fornecedor as any).email}`);
      if (dadosExtras.length > 0) {
        doc.text(dadosExtras.join(' | '), 20, yConteudo);
      }
    }
    
    y += alturaBloco + 6;

    // Título da seção de itens
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.text('ITENS DA PROPOSTA', 20, y);
    y += 8;

    // Preparar dados para autoTable
    const ehDesconto = criterioJulgamento === 'desconto';
    const ehPorLote = criterioJulgamento === 'por_lote';
    
    const prepararDadosTabela = () => {
      const dados: any[] = [];
      let somaTotal = 0;
      
      // Se critério for por_lote, agrupar por lote
      if (ehPorLote && lotesMap.size > 0) {
        // Agrupar itens por lote_id
        const itensPorLote = new Map<string, any[]>();
        for (const item of itensOrdenados) {
          const itemCot: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
          const loteId = itemCot?.lote_id;
          if (loteId) {
            if (!itensPorLote.has(loteId)) {
              itensPorLote.set(loteId, []);
            }
            itensPorLote.get(loteId)!.push(item);
          }
        }
        
        // Ordenar lotes por numero_lote
        const lotesOrdenados = Array.from(lotesMap.entries()).sort((a, b) => a[1].numero_lote - b[1].numero_lote);
        
        for (const [loteId, loteInfo] of lotesOrdenados) {
          const itensDoLote = itensPorLote.get(loteId) || [];
          if (itensDoLote.length === 0) continue;
          
          // Linha de título do lote
          const colSpanLote = ocultarMarca ? 6 : 7;
          dados.push([
            { content: `LOTE ${loteInfo.numero_lote} - ${loteInfo.descricao_lote}`, colSpan: colSpanLote, styles: { fillColor: [0, 102, 153], textColor: [255, 255, 255], fontStyle: 'bold', halign: 'center' } }
          ]);
          
          // Itens do lote
          let subtotalLote = 0;
          for (const item of itensDoLote) {
            const itemCotacao: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
            if (!itemCotacao) continue;
            
            const valorUnitario = item.valor_unitario_ofertado || 0;
            const valorTotalItem = valorUnitario * itemCotacao.quantidade;
            subtotalLote += valorTotalItem;
            
            if (ocultarMarca) {
              dados.push([
                itemCotacao.numero_item.toString(),
                sanitizarTexto(itemCotacao.descricao || ''),
                itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
                sanitizarTexto(itemCotacao.unidade || ''),
                valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              ]);
            } else {
              dados.push([
                itemCotacao.numero_item.toString(),
                sanitizarTexto(itemCotacao.descricao || ''),
                sanitizarTexto(item.marca || ''),
                itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
                sanitizarTexto(itemCotacao.unidade || ''),
                valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
                valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
              ]);
            }
          }
          
          // Subtotal do lote
          const colSpanSubtotal = ocultarMarca ? 5 : 6;
          dados.push([
            { content: `Subtotal Lote ${loteInfo.numero_lote}:`, colSpan: colSpanSubtotal, styles: { fillColor: [207, 238, 247], fontStyle: 'bold', halign: 'right' } },
            { content: subtotalLote.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), styles: { fillColor: [207, 238, 247], fontStyle: 'bold', halign: 'right' } }
          ]);
          
          somaTotal += subtotalLote;
        }
      } else {
        // Renderização normal sem lotes
        for (const item of itensOrdenados) {
          const itemCotacao: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
          if (!itemCotacao) continue;
          
          const valorUnitario = ehDesconto 
            ? (item.percentual_desconto || 0)
            : item.valor_unitario_ofertado;
          const valorTotalItem = valorUnitario * itemCotacao.quantidade;
          somaTotal += ehDesconto ? 0 : valorTotalItem;
          
          if (ehDesconto) {
            dados.push([
              itemCotacao.numero_item.toString(),
              sanitizarTexto(itemCotacao.descricao || ''),
              itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
              sanitizarTexto(itemCotacao.unidade || ''),
              (valorUnitario && valorUnitario > 0) ? `${valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%` : '-'
            ]);
          } else if (ocultarMarca) {
            dados.push([
              itemCotacao.numero_item.toString(),
              sanitizarTexto(itemCotacao.descricao || ''),
              itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
              sanitizarTexto(itemCotacao.unidade || ''),
              valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
              valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ]);
          } else {
            dados.push([
              itemCotacao.numero_item.toString(),
              sanitizarTexto(itemCotacao.descricao || ''),
              sanitizarTexto(item.marca || ''),
              itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }),
              sanitizarTexto(itemCotacao.unidade || ''),
              valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }),
              valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
            ]);
          }
        }
      }
      
      return { dados, somaTotal };
    };
    
    const { dados: dadosTabela } = prepararDadosTabela();
    
    // Configurações de colunas baseadas no critério
    const headersDesconto = ['ITEM', 'DESCRICAO', 'QTD', 'UNID', 'DESCONTO (%)'];
    const headersPreco = ['ITEM', 'DESCRICAO', 'MARCA', 'QTD', 'UNID', 'VL. UNIT.', 'VL. TOTAL'];
    const headersPrecoSemMarca = ['ITEM', 'DESCRICAO', 'QTD', 'UNID', 'VL. UNIT.', 'VL. TOTAL'];
    
    const columnStylesDesconto: any = {
      0: { cellWidth: 14, halign: 'center', valign: 'middle' },
      1: { cellWidth: 90, halign: 'justify', valign: 'middle' },
      2: { cellWidth: 20, halign: 'center', valign: 'middle' },
      3: { cellWidth: 18, halign: 'center', valign: 'middle' },
      4: { cellWidth: 32, halign: 'center', valign: 'middle' }
    };
    
    const columnStylesPreco: any = {
      0: { cellWidth: 14, halign: 'center', valign: 'middle' },
      1: { cellWidth: 63, halign: 'justify', valign: 'middle' },
      2: { cellWidth: 19, halign: 'center', valign: 'middle' },
      3: { cellWidth: 14, halign: 'center', valign: 'middle' },
      4: { cellWidth: 16, halign: 'center', valign: 'middle' },
      5: { cellWidth: 25, halign: 'right', valign: 'middle' },
      6: { cellWidth: 25, halign: 'right', valign: 'middle' }
    };
    
    // Sem marca: expandir descrição e colunas de valor
    const columnStylesPrecoSemMarca: any = {
      0: { cellWidth: 14, halign: 'center', valign: 'middle' },
      1: { cellWidth: 82, halign: 'justify', valign: 'middle' },
      2: { cellWidth: 16, halign: 'center', valign: 'middle' },
      3: { cellWidth: 16, halign: 'center', valign: 'middle' },
      4: { cellWidth: 26, halign: 'right', valign: 'middle' },
      5: { cellWidth: 26, halign: 'right', valign: 'middle' }
    };
    
    const selectedHeaders = ehDesconto ? headersDesconto : (ocultarMarca ? headersPrecoSemMarca : headersPreco);
    const selectedColumnStyles = ehDesconto ? columnStylesDesconto : (ocultarMarca ? columnStylesPrecoSemMarca : columnStylesPreco);
    
    autoTable(doc, {
      startY: y,
      head: [selectedHeaders],
      body: dadosTabela,
      theme: 'grid',
      headStyles: {
        fillColor: [corSecundaria[0], corSecundaria[1], corSecundaria[2]],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        halign: 'center',
        fontSize: 9
      },
      styles: {
        overflow: 'linebreak',
        lineWidth: 0.3,
        lineColor: [corSecundaria[0], corSecundaria[1], corSecundaria[2]],
        cellPadding: { top: 2, right: 2, bottom: 2, left: 2 }
      },
      bodyStyles: {
        fontSize: 7.5,
        textColor: [corTexto[0], corTexto[1], corTexto[2]],
        valign: 'top'
      },
      alternateRowStyles: {
        fillColor: [corFundo[0], corFundo[1], corFundo[2]]
      },
      columnStyles: selectedColumnStyles,
      margin: { left: 15, right: 15, top: 25, bottom: 25 },
      tableWidth: 180,
      rowPageBreak: 'auto',
      showHead: 'everyPage',
      didParseCell: (data) => {
        if (data.column.index === 1 && data.section === 'body') {
          data.cell.styles.cellWidth = ehDesconto ? 90 : (ocultarMarca ? 82 : 63);
          // Adicionar padding extra na altura para compensar o bug de cálculo
          const textLines = data.cell.text.length;
          const extraPadding = Math.ceil(textLines * 0.5);
          data.cell.styles.cellPadding = { 
            top: 2, 
            right: 2, 
            bottom: 2 + extraPadding, 
            left: 2 
          };
        }
      }
    });
    
    y = (doc as any).lastAutoTable.finalY;

    // Linha de separação
    y += 2;
    doc.setDrawColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.setLineWidth(0.5);
    doc.line(15, y, 195, y);
    y += 8;

    // Valor total com destaque (APENAS quando não for desconto)
    if (!ehDesconto) {
      // Calcular valor por extenso primeiro para determinar altura do quadro
      const extenso = valorPorExtenso(valorTotal).toUpperCase();
      const extensoTexto = `(${extenso})`;
      
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      const extensoLines = doc.splitTextToSize(extensoTexto, 170);
      const alturaExtenso = extensoLines.length * 4;
      const alturaQuadro = 12 + alturaExtenso + 4;
      
      doc.setFillColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
      doc.rect(15, y - 6, 180, alturaQuadro, 'F');
      
      doc.setTextColor(255, 255, 255);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(12);
      
      const valorTotalFormatted = valorTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      doc.text(`VALOR TOTAL: ${valorTotalFormatted}`, 193, y, { align: 'right' });
      
      // Valor por extenso justificado abaixo
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      let yExtenso = y + 6;
      extensoLines.forEach((linha: string, index: number) => {
        const isUltimaLinha = index === extensoLines.length - 1;
        const palavras = linha.trim().split(/\s+/).filter((p: string) => p.length > 0);
        
        if (!isUltimaLinha && palavras.length > 1) {
          let larguraPalavras = 0;
          palavras.forEach((palavra: string) => {
            larguraPalavras += doc.getTextWidth(palavra);
          });
          const espacoDisponivel = 170 - larguraPalavras;
          const espacoEntrePalavras = espacoDisponivel / (palavras.length - 1);
          
          let xAtual = 20;
          palavras.forEach((palavra: string, idx: number) => {
            doc.text(palavra, xAtual, yExtenso);
            if (idx < palavras.length - 1) {
              xAtual += doc.getTextWidth(palavra) + espacoEntrePalavras;
            }
          });
        } else {
          doc.text(linha.trim(), 20, yExtenso);
        }
        yExtenso += 4;
      });
      
      doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
      y += alturaQuadro + 8;
    }

    // Observações
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(corPrimaria[0], corPrimaria[1], corPrimaria[2]);
    doc.text('OBSERVAÇÕES:', 20, y);
    y += 7;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
    
    // Observações do fornecedor (se houver)
    if (observacoes) {
      const obsLines = doc.splitTextToSize(observacoes, 170);
      doc.text(obsLines, 20, y);
      y += obsLines.length * 5 + 3;
    }
    
    // Declarações obrigatórias
    const declaracao1 = 'Declaramos estar ciente e concordar integralmente com os termos e condicoes contidas no Termo de Referencia e/ou Instrumento Convocatorio.';
    const declaracao2 = 'Validade da proposta: 60 dias.';
    
    const decl1Lines = doc.splitTextToSize(declaracao1, 170);
    doc.text(decl1Lines, 20, y);
    y += decl1Lines.length * 5 + 3;
    
    doc.text(declaracao2, 20, y);
    y += 8;

    // Adicionar espaço extra após observações
    y += 5;

    // Gerar protocolo
    const protocolo = gerarProtocolo();

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
    const alturaQuadroCert = 115;
    
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

    // Buscar data de envio da resposta
    const { data: respostaData } = await sb
      .from('cotacao_respostas_fornecedor')
      .select('data_envio_resposta')
      .eq('id', respostaId)
      .single();
    
    const dataEnvioFormatada = respostaData?.data_envio_resposta
      ? new Date(respostaData.data_envio_resposta).toLocaleString('pt-BR')
      : new Date().toLocaleString('pt-BR');

    // Altura do quadro de certificação (ajustado com responsável + data)
    const alturaQuadro = 110;

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

    // Função para identificar preço público - APENAS por email
    const ehPrecoPublicoCert = (email?: string) => {
      return !!(email && email.includes('precos.publicos'));
    };

    // Responsável pela geração
    const isPrecosPublicosCert = ehPrecoPublicoCert((fornecedor as any).email);
    const responsavel = isPrecosPublicosCert
      ? (usuarioNome || 'Não informado')
      : (responsavelLegal || fornecedor.razao_social);
    
    paginaCert.drawText(`Responsável: ${responsavel}`, {
      x: 50,
      y: yPos,
      size: fontSize,
      font: font,
    });
    yPos -= lineHeight;

    // Data/Hora de Envio
    paginaCert.drawText(`Data/Hora de Envio: ${dataEnvioFormatada}`, {
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
    const storagePath = `propostas/${nomeArquivo}`;

    // Upload para o storage (pasta "propostas" é necessária para upload público)
    const { data: uploadData, error: uploadError } = await sb.storage
      .from('processo-anexos')
      .upload(storagePath, pdfFinalBlob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    // Obter URL pública completa do storage
    const { data: { publicUrl } } = sb.storage
      .from('processo-anexos')
      .getPublicUrl(uploadData.path);

    return {
      url: publicUrl,
      path: uploadData.path, // Path do storage para uso em signed URLs
      nome: nomeArquivo,
      hash: hash,
      protocolo: protocolo
    };

  } catch (error) {
    console.error('Erro ao gerar PDF da proposta:', error);
    throw error;
  }
}

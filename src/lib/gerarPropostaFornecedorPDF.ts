import jsPDF from 'jspdf';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import { supabase } from '@/integrations/supabase/client';
import { gerarHashDocumento } from './certificacaoDigital';

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
): Promise<{ url: string; nome: string; hash: string; protocolo: string }> {
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
    
    const { data: itens, error: itensError } = await supabase
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
    
    // Função para identificar preço público - pelo email (novo) ou CNPJ sequencial (antigo)
    const ehPrecoPublico = (cnpj: string, email?: string) => {
      if (email && email.includes('precos.publicos')) return true;
      if (!cnpj) return false;
      const primeiroDigito = cnpj.charAt(0);
      return cnpj.split('').every(d => d === primeiroDigito);
    };
    
    const isPrecosPublicos = ehPrecoPublico(fornecedor.cnpj, (fornecedor as any).email);
    const tituloDocumento = isPrecosPublicos ? 'PROPOSTA DE PREÇOS PÚBLICOS' : 'PROPOSTA DE PREÇOS';
    doc.text(tituloDocumento, 105, 25, { align: 'center' });
    
    doc.setFontSize(11);
    doc.setFont('helvetica', 'normal');
    doc.text(`Ref. Processo: ${tituloCotacao}`, 105, 38, { align: 'center' });
    
    y = 60;

    // Bloco de informações do fornecedor com fundo
    const alturaBloco = isPrecosPublicos ? 26 : 44;
    
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

    // Calcular larguras dinâmicas das colunas de valores (apenas para critério não-desconto)
    let larguraVlUnit = 22;
    let larguraVlTotal = 24;
    let larguraMarca = 18;
    let larguraQtd = 14;
    let larguraUnid = 22;
    
    if (criterioJulgamento !== 'desconto') {
      // Encontrar os maiores valores para dimensionar colunas
      let maiorVlUnit = 0;
      let maiorVlTotal = 0;
      
      itensOrdenados.forEach((item: any) => {
        const itemCotacao: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
        if (itemCotacao) {
          const vlUnit = item.valor_unitario_ofertado || 0;
          const vlTotal = vlUnit * (itemCotacao.quantidade || 0);
          maiorVlUnit = Math.max(maiorVlUnit, vlUnit);
          maiorVlTotal = Math.max(maiorVlTotal, vlTotal);
        }
      });
      
      // Formatar para determinar largura necessária
      const vlUnitFormatado = maiorVlUnit.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const vlTotalFormatado = maiorVlTotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      
      // Estimar largura necessária (aproximadamente 2.5 por caractere)
      const larguraEstimadaUnit = Math.max(22, Math.ceil(vlUnitFormatado.length * 2.5));
      const larguraEstimadaTotal = Math.max(24, Math.ceil(vlTotalFormatado.length * 2.5));
      
      // Limitar larguras máximas
      larguraVlUnit = Math.min(larguraEstimadaUnit, 32);
      larguraVlTotal = Math.min(larguraEstimadaTotal, 36);
      
      // Calcular espaço restante para distribuir entre MARCA, QTD, UNID
      const espacoFixo = 15 + 58; // ITEM + DESCRIÇÃO
      const espacoValores = larguraVlUnit + larguraVlTotal;
      const espacoRestante = 180 - espacoFixo - espacoValores; // Total 180 (largura da tabela)
      
      // Distribuir proporcionalmente
      larguraMarca = Math.floor(espacoRestante * 0.40);
      larguraQtd = Math.floor(espacoRestante * 0.25);
      larguraUnid = Math.floor(espacoRestante * 0.35);
    }
    
    // Calcular posições das colunas baseado nas larguras
    const colItemX = 15;
    const colDescX = colItemX + 15;
    const colMarcaX = colDescX + 58;
    const colQtdX = colMarcaX + larguraMarca;
    const colUnidX = colQtdX + larguraQtd;
    const colVlUnitX = colUnidX + larguraUnid;
    const colVlTotalX = colVlUnitX + larguraVlUnit;

    // Cabeçalho da tabela com fundo
    doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
    doc.rect(15, y - 5, 180, 8, 'F');
    
    // Bordas do cabeçalho - cinza clara
    doc.setDrawColor(200, 200, 200);
    doc.setLineWidth(0.1);
    // Borda externa do cabeçalho
    doc.rect(15, y - 5, 180, 8, 'S');
    
    // Bordas verticais internas do cabeçalho
    if (criterioJulgamento === 'desconto') {
      doc.line(30, y - 5, 30, y + 3);
      doc.line(130, y - 5, 130, y + 3);
      doc.line(155, y - 5, 155, y + 3);
      doc.line(172, y - 5, 172, y + 3);
    } else {
      doc.line(colDescX, y - 5, colDescX, y + 3);
      doc.line(colMarcaX, y - 5, colMarcaX, y + 3);
      doc.line(colQtdX, y - 5, colQtdX, y + 3);
      doc.line(colUnidX, y - 5, colUnidX, y + 3);
      doc.line(colVlUnitX, y - 5, colVlUnitX, y + 3);
      doc.line(colVlTotalX, y - 5, colVlTotalX, y + 3);
    }
    
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    
    // Posições diferentes baseado no critério
    if (criterioJulgamento === 'desconto') {
      // Critério DESCONTO: ITEM | DESCRICAO | QTD | UNID | DESCONTO
      doc.text('ITEM', 22.5, y, { maxWidth: 15, align: 'center' });
      doc.text('DESCRICAO', 80, y, { maxWidth: 96, align: 'center' });
      doc.text('QTD', 142.5, y, { maxWidth: 16, align: 'center' });
      doc.text('UNID', 163.5, y, { maxWidth: 18, align: 'center' });
      doc.text('DESCONTO (%)', 183.5, y, { maxWidth: 23, align: 'center' });
    } else {
      // Outros critérios: ITEM | DESCRICAO | MARCA | QTD | UNID | VL. UNIT. | VL. TOTAL
      const centerItemX = colItemX + 7.5;
      const centerDescX = colDescX + 29;
      const centerMarcaX = colMarcaX + (larguraMarca / 2);
      const centerQtdX = colQtdX + (larguraQtd / 2);
      const centerUnidX = colUnidX + (larguraUnid / 2);
      const centerVlUnitX = colVlUnitX + (larguraVlUnit / 2);
      const centerVlTotalX = colVlTotalX + (larguraVlTotal / 2);
      
      doc.text('ITEM', centerItemX, y, { maxWidth: 15, align: 'center' });
      doc.text('DESCRICAO', centerDescX, y, { maxWidth: 58, align: 'center' });
      doc.text('MARCA', centerMarcaX, y, { maxWidth: larguraMarca, align: 'center' });
      doc.text('QTD', centerQtdX, y, { maxWidth: larguraQtd, align: 'center' });
      doc.text('UNID', centerUnidX, y, { maxWidth: larguraUnid, align: 'center' });
      doc.text('VL. UNIT.', centerVlUnitX, y, { maxWidth: larguraVlUnit, align: 'center' });
      doc.text('VL. TOTAL', centerVlTotalX, y, { maxWidth: larguraVlTotal, align: 'center' });
    }
    
    y += 6;
    doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);

    // Itens da proposta
    let isAlternate = false;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);

    // Função auxiliar para renderizar linha de título de lote
    const renderLoteTitulo = (loteNumero: number, loteDescricao: string) => {
      if (y + 10 > 270) {
        doc.addPage();
        y = 20;
      }
      // Usar mesma cor do cabeçalho da tabela (corSecundaria)
      doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
      doc.rect(15, y - 4, 180, 8, 'F');
      // Borda cinza clara ao redor do título do lote
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.rect(15, y - 4, 180, 8, 'S');
      doc.setTextColor(255, 255, 255);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`LOTE ${loteNumero} - ${loteDescricao}`, 105, y, { align: 'center' });
      y += 8;
      doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
      isAlternate = false;
    };

    // Função auxiliar para renderizar subtotal de lote
    const renderSubtotalLote = (loteNumero: number, subtotal: number) => {
      if (criterioJulgamento === 'desconto') return;
      if (y + 10 > 270) {
        doc.addPage();
        y = 20;
      }
      doc.setFillColor(207, 238, 247);
      doc.rect(15, y - 4, 180, 8, 'F');
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      doc.rect(15, y - 4, 180, 8, 'S');
      doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`Subtotal Lote ${loteNumero}:`, 140, y, { align: 'right' });
      doc.text(subtotal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 193, y, { align: 'right' });
      y += 10;
      doc.setFontSize(8);
      doc.setFont('helvetica', 'normal');
    };

    // Função auxiliar para renderizar um item
    const renderItem = (item: any) => {
      const itemCotacao: any = Array.isArray(item.itens_cotacao) ? item.itens_cotacao[0] : item.itens_cotacao;
      
      if (!itemCotacao) {
        console.warn('Item sem dados de cotação:', item);
        return 0;
      }
      
      // Sanitizar descrição para remover caracteres especiais problemáticos
      const descricaoSanitizada = sanitizarTexto(itemCotacao.descricao || '');
      
      // Quebrar descrição em múltiplas linhas - usar largura menor para evitar sobreposição
      const maxWidthDesc = criterioJulgamento === 'desconto' ? 92 : 52;
      const linhasDescricao = doc.splitTextToSize(descricaoSanitizada, maxWidthDesc);
      
      // Calcular altura baseada em TODAS as colunas (não só descrição)
      // LineHeight de 3.5 para texto de 8pt
      const itemLineHeight = 3.5;
      let maxLinhas = linhasDescricao.length;
      
      if (criterioJulgamento !== 'desconto') {
        const marcaSanitizada = sanitizarTexto(item.marca || '-');
        const unidadeSanitizada = sanitizarTexto(itemCotacao.unidade || '');
        const marcaLinhas = doc.splitTextToSize(marcaSanitizada, larguraMarca - 4);
        const unidLinhas = doc.splitTextToSize(unidadeSanitizada, larguraUnid - 4);
        const qtdLinhas = doc.splitTextToSize(itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), larguraQtd - 2);
        maxLinhas = Math.max(maxLinhas, marcaLinhas.length, unidLinhas.length, qtdLinhas.length);
      }
      
      // Altura mínima de 7, com padding adequado para texto não sobrepor bordas
      const alturaLinha = Math.max(7, maxLinhas * itemLineHeight + 4);
      
      // Verificar se precisa de nova página
      if (y + alturaLinha > 270) {
        doc.addPage();
        y = 20;
        
        // Repetir cabeçalho da tabela
        doc.setFillColor(corSecundaria[0], corSecundaria[1], corSecundaria[2]);
        doc.rect(15, y - 5, 180, 8, 'F');
        doc.setDrawColor(200, 200, 200);
        doc.setLineWidth(0.1);
        // Borda externa do cabeçalho
        doc.rect(15, y - 5, 180, 8, 'S');
        
        // Bordas verticais internas do cabeçalho
        if (criterioJulgamento === 'desconto') {
          doc.line(30, y - 5, 30, y + 3);
          doc.line(130, y - 5, 130, y + 3);
          doc.line(155, y - 5, 155, y + 3);
          doc.line(172, y - 5, 172, y + 3);
        } else {
          doc.line(colDescX, y - 5, colDescX, y + 3);
          doc.line(colMarcaX, y - 5, colMarcaX, y + 3);
          doc.line(colQtdX, y - 5, colQtdX, y + 3);
          doc.line(colUnidX, y - 5, colUnidX, y + 3);
          doc.line(colVlUnitX, y - 5, colVlUnitX, y + 3);
          doc.line(colVlTotalX, y - 5, colVlTotalX, y + 3);
        }
        
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        
        if (criterioJulgamento === 'desconto') {
          doc.text('ITEM', 22.5, y, { maxWidth: 15, align: 'center' });
          doc.text('DESCRICAO', 80, y, { maxWidth: 96, align: 'center' });
          doc.text('QTD', 142.5, y, { maxWidth: 16, align: 'center' });
          doc.text('UNID', 163.5, y, { maxWidth: 18, align: 'center' });
          doc.text('DESCONTO (%)', 183.5, y, { maxWidth: 23, align: 'center' });
        } else {
          const centerItemX = colItemX + 7.5;
          const centerDescX = colDescX + 29;
          const centerMarcaX = colMarcaX + (larguraMarca / 2);
          const centerQtdX = colQtdX + (larguraQtd / 2);
          const centerUnidX = colUnidX + (larguraUnid / 2);
          const centerVlUnitX = colVlUnitX + (larguraVlUnit / 2);
          const centerVlTotalX = colVlTotalX + (larguraVlTotal / 2);
          
          doc.text('ITEM', centerItemX, y, { maxWidth: 15, align: 'center' });
          doc.text('DESCRICAO', centerDescX, y, { maxWidth: 58, align: 'center' });
          doc.text('MARCA', centerMarcaX, y, { maxWidth: larguraMarca, align: 'center' });
          doc.text('QTD', centerQtdX, y, { maxWidth: larguraQtd, align: 'center' });
          doc.text('UNID', centerUnidX, y, { maxWidth: larguraUnid, align: 'center' });
          doc.text('VL. UNIT.', centerVlUnitX, y, { maxWidth: larguraVlUnit, align: 'center' });
          doc.text('VL. TOTAL', centerVlTotalX, y, { maxWidth: larguraVlTotal, align: 'center' });
        }
        y += 6;
        doc.setTextColor(corTexto[0], corTexto[1], corTexto[2]);
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(8);
      }
      
      const valorUnitario = criterioJulgamento === 'desconto' 
        ? (item.percentual_desconto || 0)
        : item.valor_unitario_ofertado;
      const valorTotalItem = valorUnitario * itemCotacao.quantidade;

      // Fundo alternado
      if (isAlternate) {
        doc.setFillColor(corFundo[0], corFundo[1], corFundo[2]);
        doc.rect(15, y - 4, 180, alturaLinha, 'F');
      }

      // Bordas cinza clara para toda a tabela
      doc.setDrawColor(200, 200, 200);
      doc.setLineWidth(0.1);
      
      const yTop = y - 4;
      const yBottom = y + alturaLinha - 4;
      
      // Borda superior (horizontal)
      doc.line(15, yTop, 195, yTop);
      // Borda inferior (horizontal)
      doc.line(15, yBottom, 195, yBottom);
      
      // Bordas verticais (todas as colunas)
      doc.line(15, yTop, 15, yBottom);   // Esquerda
      doc.line(195, yTop, 195, yBottom); // Direita
      
      if (criterioJulgamento === 'desconto') {
        doc.line(30, yTop, 30, yBottom);
        doc.line(130, yTop, 130, yBottom);
        doc.line(155, yTop, 155, yBottom);
        doc.line(172, yTop, 172, yBottom);
      } else {
        doc.line(colDescX, yTop, colDescX, yBottom);
        doc.line(colMarcaX, yTop, colMarcaX, yBottom);
        doc.line(colQtdX, yTop, colQtdX, yBottom);
        doc.line(colUnidX, yTop, colUnidX, yBottom);
        doc.line(colVlUnitX, yTop, colVlUnitX, yBottom);
        doc.line(colVlTotalX, yTop, colVlTotalX, yBottom);
      }

      const yCenter = yTop + (alturaLinha / 2) + 1.5;
      
      doc.text(itemCotacao.numero_item.toString(), 22.5, yCenter, { align: 'center' });
      
      if (criterioJulgamento === 'desconto') {
        // Calcular altura do texto para centralizar verticalmente
        const textHeight = linhasDescricao.length * itemLineHeight * 1.3; // 1.3 é o lineHeightFactor
        const yDescStart = yTop + (alturaLinha - textHeight) / 2 + itemLineHeight;
        doc.text(descricaoSanitizada, 32, yDescStart, { 
          maxWidth: 92, 
          align: 'justify',
          lineHeightFactor: 1.3
        });
        doc.text(itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }), 142.5, yCenter, { align: 'center' });
        doc.text(sanitizarTexto(itemCotacao.unidade || ''), 163.5, yCenter, { align: 'center' });
        const descontoFormatted = (valorUnitario && valorUnitario > 0)
          ? `${valorUnitario.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`
          : '-';
        doc.text(descontoFormatted, 183.5, yCenter, { align: 'center' });
      } else {
        // Calcular altura do texto para centralizar verticalmente
        const textHeight = linhasDescricao.length * itemLineHeight * 1.3; // 1.3 é o lineHeightFactor
        const yDescStart = yTop + (alturaLinha - textHeight) / 2 + itemLineHeight;
        doc.text(descricaoSanitizada, colDescX + 2, yDescStart, { 
          maxWidth: 52, 
          align: 'justify',
          lineHeightFactor: 1.3
        });
        
        const marcaSanitizada = sanitizarTexto(item.marca || '-');
        const marcaLinhas = doc.splitTextToSize(marcaSanitizada, larguraMarca - 4);
        const marcaTextHeight = marcaLinhas.length * itemLineHeight;
        const yMarcaStart = yTop + (alturaLinha - marcaTextHeight) / 2 + itemLineHeight * 0.7;
        const centerMarcaX = colMarcaX + (larguraMarca / 2);
        marcaLinhas.forEach((linha: string, index: number) => {
          doc.text(linha, centerMarcaX, yMarcaStart + (index * itemLineHeight), { maxWidth: larguraMarca - 4, align: 'center' });
        });
        
        const qtdLinhas = doc.splitTextToSize(itemCotacao.quantidade.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 }), larguraQtd - 2);
        const qtdTextHeight = qtdLinhas.length * itemLineHeight;
        const yQtdStart = yTop + (alturaLinha - qtdTextHeight) / 2 + itemLineHeight * 0.7;
        const centerQtdX = colQtdX + (larguraQtd / 2);
        qtdLinhas.forEach((linha: string, index: number) => {
          doc.text(linha, centerQtdX, yQtdStart + (index * itemLineHeight), { maxWidth: larguraQtd - 2, align: 'center' });
        });
        
        const unidadeSanitizada = sanitizarTexto(itemCotacao.unidade || '');
        const unidLinhas = doc.splitTextToSize(unidadeSanitizada, larguraUnid - 4);
        const unidTextHeight = unidLinhas.length * itemLineHeight;
        const yUnidStart = yTop + (alturaLinha - unidTextHeight) / 2 + itemLineHeight * 0.7;
        const centerUnidX = colUnidX + (larguraUnid / 2);
        unidLinhas.forEach((linha: string, index: number) => {
          doc.text(linha, centerUnidX, yUnidStart + (index * itemLineHeight), { maxWidth: larguraUnid - 4, align: 'center' });
        });
        
        const valorUnitFormatted = valorUnitario.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        const valorTotalFormatted = valorTotalItem.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
        
        const vlUnitLinhas = doc.splitTextToSize(valorUnitFormatted, larguraVlUnit - 2);
        const vlUnitTextHeight = vlUnitLinhas.length * itemLineHeight;
        const yVlUnitStart = yTop + (alturaLinha - vlUnitTextHeight) / 2 + itemLineHeight * 0.7;
        const rightVlUnitX = colVlUnitX + larguraVlUnit - 2;
        vlUnitLinhas.forEach((linha: string, index: number) => {
          doc.text(linha, rightVlUnitX, yVlUnitStart + (index * itemLineHeight), { maxWidth: larguraVlUnit - 2, align: 'right' });
        });
        
        const vlTotalLinhas = doc.splitTextToSize(valorTotalFormatted, larguraVlTotal - 2);
        const vlTotalTextHeight = vlTotalLinhas.length * itemLineHeight;
        const yVlTotalStart = yTop + (alturaLinha - vlTotalTextHeight) / 2 + itemLineHeight * 0.7;
        const rightVlTotalX = colVlTotalX + larguraVlTotal - 2;
        vlTotalLinhas.forEach((linha: string, index: number) => {
          doc.text(linha, rightVlTotalX, yVlTotalStart + (index * itemLineHeight), { maxWidth: larguraVlTotal - 2, align: 'right' });
        });
      }
      
      y += alturaLinha;
      isAlternate = !isAlternate;
      
      return criterioJulgamento === 'desconto' ? 0 : valorTotalItem;
    };

    // Renderizar itens - agrupados por lote se critério for por_lote
    if (criterioJulgamento === 'por_lote' && lotesMap.size > 0) {
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
        
        renderLoteTitulo(loteInfo.numero_lote, loteInfo.descricao_lote);
        
        let subtotalLote = 0;
        for (const item of itensDoLote) {
          subtotalLote += renderItem(item);
        }
        
        renderSubtotalLote(loteInfo.numero_lote, subtotalLote);
      }
    } else {
      // Renderização normal sem lotes
      for (const item of itensOrdenados) {
        renderItem(item);
      }
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

    // Função para identificar preço público (mesma lógica do início)
    const ehPrecoPublicoCert = (cnpj: string, email?: string) => {
      if (email && email.includes('precos.publicos')) return true;
      if (!cnpj) return false;
      const primeiroDigito = cnpj.charAt(0);
      return cnpj.split('').every(d => d === primeiroDigito);
    };

    // Responsável pela geração
    // Se for preços públicos, SEMPRE usar o usuário que preencheu
    // Se for fornecedor normal, usar a razão social do fornecedor
    const isPrecosPublicosCert = ehPrecoPublicoCert(fornecedor.cnpj, (fornecedor as any).email);
    const responsavel = isPrecosPublicosCert
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
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('processo-anexos')
      .upload(nomeArquivo, pdfFinalBlob, {
        contentType: 'application/pdf',
        cacheControl: '3600',
      });

    if (uploadError) throw uploadError;

    return {
      url: uploadData.path,
      nome: nomeArquivo,
      hash: hash,
      protocolo: protocolo
    };

  } catch (error) {
    console.error('Erro ao gerar PDF da proposta:', error);
    throw error;
  }
}

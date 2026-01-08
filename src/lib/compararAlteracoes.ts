/**
 * Compara dois objetos e retorna as alterações realizadas
 * @param anterior - Objeto com valores anteriores
 * @param novo - Objeto com novos valores
 * @param camposMonitorar - Lista de campos a comparar (opcional, se não informado compara todos)
 * @param traducoes - Mapa de traduções para os nomes dos campos
 * @returns Array de alterações no formato { campo, de, para }
 */
export function compararAlteracoes(
  anterior: Record<string, any>,
  novo: Record<string, any>,
  camposMonitorar?: string[],
  traducoes?: Record<string, string>
): Array<{ campo: string; de: string; para: string }> {
  const alteracoes: Array<{ campo: string; de: string; para: string }> = [];
  
  const traducoesDefault: Record<string, string> = {
    titulo_cotacao: "Título da Cotação",
    descricao_cotacao: "Descrição",
    data_limite_resposta: "Prazo de Resposta",
    numero_item: "Número do Item",
    descricao: "Descrição",
    quantidade: "Quantidade",
    unidade: "Unidade",
    valor_unitario_estimado: "Valor Unitário",
    marca: "Marca",
    lote_id: "Lote",
    numero_lote: "Número do Lote",
    descricao_lote: "Descrição do Lote",
    status_aprovacao: "Status",
    criterio_julgamento: "Critério de Julgamento",
    razao_social: "Razão Social",
    cnpj: "CNPJ",
    email: "E-mail",
    telefone: "Telefone",
    ...traducoes
  };
  
  const campos = camposMonitorar || Object.keys({ ...anterior, ...novo });
  
  for (const campo of campos) {
    const valorAnterior = anterior[campo];
    const valorNovo = novo[campo];
    
    // Ignorar campos undefined ou internos
    if (campo === 'id' || campo === 'created_at' || campo === 'updated_at') continue;
    
    // Normalizar valores para comparação
    const valorAnteriorStr = formatarValorParaComparacao(valorAnterior, campo);
    const valorNovoStr = formatarValorParaComparacao(valorNovo, campo);
    
    if (valorAnteriorStr !== valorNovoStr) {
      alteracoes.push({
        campo: traducoesDefault[campo] || campo,
        de: valorAnteriorStr || "(vazio)",
        para: valorNovoStr || "(vazio)"
      });
    }
  }
  
  return alteracoes;
}

/**
 * Formata um valor para comparação/exibição
 */
function formatarValorParaComparacao(valor: any, campo: string): string {
  if (valor === null || valor === undefined) return "";
  
  // Formatar datas
  if (campo.includes('data') || campo.includes('prazo')) {
    if (typeof valor === 'string' && valor.includes('T')) {
      try {
        const data = new Date(valor);
        return data.toLocaleString('pt-BR', { 
          dateStyle: 'short', 
          timeStyle: 'short' 
        });
      } catch {
        return String(valor);
      }
    }
  }
  
  // Formatar números/valores monetários
  if (campo.includes('valor') && typeof valor === 'number') {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  
  // Formatar quantidade
  if (campo === 'quantidade' && typeof valor === 'number') {
    return valor.toLocaleString('pt-BR');
  }
  
  // Truncar textos longos
  if (typeof valor === 'string' && valor.length > 100) {
    return valor.substring(0, 100) + '...';
  }
  
  return String(valor);
}

/**
 * Formata alterações para exibição nos detalhes de auditoria
 */
export function formatarAlteracoesParaDetalhes(
  alteracoes: Array<{ campo: string; de: string; para: string }>
): Record<string, string> {
  const resultado: Record<string, string> = {};
  
  alteracoes.forEach((alt, index) => {
    resultado[`alteracao_${index + 1}`] = `${alt.campo}: "${alt.de}" → "${alt.para}"`;
  });
  
  return resultado;
}

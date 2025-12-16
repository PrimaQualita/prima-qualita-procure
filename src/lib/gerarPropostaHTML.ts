import { gerarHashDocumento } from './certificacaoDigital';

interface ItemProposta {
  numero_item: number;
  descricao: string;
  quantidade: number;
  unidade: string;
  marca_ofertada: string;
  valor_unitario_ofertado: number;
}

interface DadosFornecedor {
  razao_social: string;
  cnpj: string;
  endereco_comercial: string;
}

// Função para formatar valores em Real brasileiro
const formatarMoeda = (valor: number): string => {
  return valor.toLocaleString('pt-BR', { 
    minimumFractionDigits: 2, 
    maximumFractionDigits: 2 
  });
};

export async function gerarPropostaHTML(
  processo: { numero: string; objeto: string },
  fornecedor: DadosFornecedor,
  itens: ItemProposta[],
  valorTotal: number,
  observacoes: string | null
): Promise<string> {
  const dataEnvio = new Date().toLocaleString('pt-BR');
  
  // Criar conteúdo para hash
  const conteudoHash = `
    Processo: ${processo.numero}
    Fornecedor: ${fornecedor.razao_social}
    CNPJ: ${fornecedor.cnpj}
    Data: ${dataEnvio}
    Valor Total: ${valorTotal.toFixed(2)}
    Itens: ${JSON.stringify(itens)}
  `;
  
  const hash = await gerarHashDocumento(conteudoHash);
  
  const itensOrdenados = [...itens].sort((a, b) => a.numero_item - b.numero_item);
  
  const htmlContent = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    body { font-family: Arial, sans-serif; margin: 40px; }
    h1 { color: #0ea5e9; font-size: 24px; margin-bottom: 10px; }
    h2 { color: #0284c7; font-size: 18px; margin-top: 30px; margin-bottom: 15px; }
    .info { margin-bottom: 20px; }
    .info p { margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; margin-top: 20px; }
    th, td { border: 1px solid #ddd; padding: 12px; text-align: left; }
    th { background-color: #0ea5e9; color: white; }
    .certificacao { margin-top: 40px; padding: 20px; background-color: #f0f9ff; border: 2px solid #0ea5e9; border-radius: 8px; }
    .certificacao h3 { margin-top: 0; color: #0284c7; font-size: 16px; }
    .certificacao p { margin: 8px 0; font-size: 13px; }
    .hash { font-family: monospace; color: #059669; word-break: break-all; font-size: 11px; }
    .autenticidade { margin-top: 15px; font-size: 12px; font-style: italic; color: #64748b; border-top: 1px solid #cbd5e1; padding-top: 15px; }
    .text-right { text-align: right; }
    .total { font-weight: bold; background-color: #f0f9ff; }
    .observacoes { margin-top: 30px; padding: 15px; background-color: #f8f9fa; border-left: 4px solid #0ea5e9; }
  </style>
</head>
<body>
  <h1>PROPOSTA DE COTAÇÃO DE PREÇOS</h1>
  
  <div class="info">
    <p><strong>${processo.numero}</strong></p>
    <p><strong>Descrição:</strong> ${processo.objeto}</p>
    <p><strong>Data de Envio:</strong> ${dataEnvio}</p>
  </div>

  <h2>Dados do Fornecedor</h2>
  <div class="info">
    <p><strong>Razão Social:</strong> ${fornecedor.razao_social}</p>
    <p><strong>CNPJ:</strong> ${fornecedor.cnpj}</p>
    <p><strong>Endereço:</strong> ${fornecedor.endereco_comercial}</p>
  </div>

  <h2>Itens Cotados</h2>
  
    <table>
      <thead>
        <tr>
          <th style="text-align: center;">Item</th>
          <th>Descrição</th>
          <th style="text-align: center;">Quantidade</th>
          <th style="text-align: center;">Unidade</th>
          <th style="text-align: center;">Marca</th>
          <th style="text-align: right;">Valor Unit. (R$)</th>
          <th style="text-align: right;">Valor Total (R$)</th>
        </tr>
      </thead>
      <tbody>
        ${itensOrdenados.map(item => {
          const valorItemTotal = item.quantidade * item.valor_unitario_ofertado;
          return `
        <tr>
          <td style="text-align: center;">${item.numero_item}</td>
          <td>${item.descricao}</td>
          <td style="text-align: center;">${formatarMoeda(item.quantidade)}</td>
          <td style="text-align: center;">${item.unidade}</td>
          <td style="text-align: center;">${item.marca_ofertada || ''}</td>
          <td class="text-right">${formatarMoeda(item.valor_unitario_ofertado)}</td>
          <td class="text-right">${formatarMoeda(valorItemTotal)}</td>
        </tr>`;
        }).join('')}
        <tr class="total">
          <td colspan="6" class="text-right"><strong>VALOR TOTAL DA PROPOSTA:</strong></td>
          <td class="text-right"><strong>R$ ${formatarMoeda(valorTotal)}</strong></td>
        </tr>
      </tbody>
    </table>

  ${observacoes ? `
  <div class="observacoes">
    <h3>Observações:</h3>
    <p>${observacoes}</p>
  </div>` : ''}

  <div class="certificacao">
    <h3>🔒 CERTIFICAÇÃO DIGITAL</h3>
    <p><strong>Hash SHA-256 do Documento:</strong></p>
    <p class="hash">${hash}</p>
    <p class="autenticidade">
      Este documento foi certificado digitalmente. O hash acima garante a autenticidade e integridade desta proposta.
      Qualquer alteração no conteúdo resultará em um hash diferente, invalidando a certificação.
    </p>
  </div>
</body>
</html>
  `.trim();
  
  return htmlContent;
}

import { jsPDF } from 'jspdf';

interface DadosCertificacao {
  protocolo: string;
  dataHora: string;
  responsavel: string;
  cpf: string;
  hash: string;
  linkVerificacao: string;
}

/**
 * Gera um hash SHA-256 de uma string de dados
 */
export const gerarHashDocumento = async (dados: string): Promise<string> => {
  const encoder = new TextEncoder();
  const data = encoder.encode(dados);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
};

export const adicionarCertificacaoDigital = (
  doc: jsPDF,
  dados: DadosCertificacao,
  yInicial: number
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margemEsquerda = 15;
  const larguraUtil = pageWidth - 30;
  
  let y = yInicial;
  
  // Desenhar retângulo com fundo cinza claro
  const certBoxY = y;
  const certBoxHeight = 68;
  
  // Fundo cinza
  doc.setFillColor(245, 245, 245);
  doc.rect(margemEsquerda, certBoxY, larguraUtil, certBoxHeight, 'F');
  
  // Borda preta
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(1);
  doc.rect(margemEsquerda, certBoxY, larguraUtil, certBoxHeight);
  
  // Título da certificação DENTRO DO QUADRO
  y += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 139); // Azul escuro
  doc.text('CERTIFICAÇÃO DIGITAL - AUTENTICIDADE DO DOCUMENTO', pageWidth / 2, y, { align: 'center' });
  
  y += 7;
  
  // Conteúdo da certificação
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.text(`Protocolo: ${dados.protocolo}`, margemEsquerda + 3, y);
  y += 5;
  
  doc.text(`Data/Hora de Geração: ${dados.dataHora}`, margemEsquerda + 3, y);
  y += 5;
  
  const responsavelText = doc.splitTextToSize(`Responsável pela Geração: ${dados.responsavel} - CPF: ${dados.cpf}`, larguraUtil - 6);
  doc.text(responsavelText, margemEsquerda + 3, y);
  y += responsavelText.length * 5;
  
  const hashText = doc.splitTextToSize(`Hash de Validação: ${dados.hash}`, larguraUtil - 6);
  doc.text(hashText, margemEsquerda + 3, y);
  y += hashText.length * 5 + 1;
  
  // Link de verificação com quebra de linha
  doc.setFont('helvetica', 'bold');
  doc.text('Verificar autenticidade em:', margemEsquerda + 3, y);
  y += 4;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 255); // Azul para o link
  
  // Quebrar o link em múltiplas linhas se necessário
  const linkLinhas = doc.splitTextToSize(dados.linkVerificacao, larguraUtil - 6);
  linkLinhas.forEach((linha: string, index: number) => {
    doc.textWithLink(linha, margemEsquerda + 3, y + (index * 4), {
      url: dados.linkVerificacao
    });
  });
  
  y += linkLinhas.length * 4 + 1;
  
  // Texto legal
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7);
  const textoLegal = doc.splitTextToSize('Este documento possui certificação digital conforme Lei 14.063/2020', larguraUtil - 6);
  doc.text(textoLegal, margemEsquerda + 3, y);
  
  y += 6;
  
  return y; // Retorna a posição Y final
};

import { jsPDF } from 'jspdf';

interface DadosCertificacao {
  protocolo: string;
  dataHora: string;
  responsavel: string;
  cpf: string;
  hash: string;
  linkVerificacao: string;
}

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
  const certBoxHeight = 56;
  
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
  
  doc.text(`Responsável pela Geração: ${dados.responsavel} - CPF: ${dados.cpf}`, margemEsquerda + 3, y);
  y += 5;
  
  doc.text(`Hash de Validação: ${dados.hash}`, margemEsquerda + 3, y);
  y += 6;
  
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
  
  y += linkLinhas.length * 4 + 2;
  
  // Texto legal
  doc.setTextColor(80, 80, 80); // Cinza escuro
  doc.setFontSize(8);
  doc.text('Este documento possui certificação digital conforme Lei 14.063/2020', margemEsquerda + 3, y);
  
  y += 6;
  
  return y; // Retorna a posição Y final
};

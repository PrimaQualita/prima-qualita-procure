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
  
  // Título da certificação
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 139); // Azul escuro
  doc.text('CERTIFICAÇÃO DIGITAL - AUTENTICIDADE DO DOCUMENTO', pageWidth / 2, y, { align: 'center' });
  
  y += 8;
  
  // Desenhar retângulo ao redor da certificação
  const certBoxY = y - 3;
  const certBoxHeight = 50;
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margemEsquerda, certBoxY, larguraUtil, certBoxHeight);
  
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
  y += 7;
  
  // Link de verificação
  doc.setFont('helvetica', 'bold');
  doc.text('Verificar autenticidade em:', margemEsquerda + 3, y);
  y += 5;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 255); // Azul para o link
  doc.textWithLink(dados.linkVerificacao, margemEsquerda + 3, y, {
    url: dados.linkVerificacao
  });
  
  y += 5;
  
  // Texto legal
  doc.setTextColor(100, 100, 100); // Cinza
  doc.setFontSize(8);
  const textoLegal = doc.splitTextToSize(
    'Este documento possui certificação digital conforme Lei 14.063/2020',
    larguraUtil - 6
  );
  doc.text(textoLegal, margemEsquerda + 3, y);
  
  y += textoLegal.length * 3 + 5;
  
  return y; // Retorna a posição Y final
};

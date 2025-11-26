import { jsPDF } from 'jspdf';

interface DadosCertificacaoSimplificada {
  protocolo: string;
  responsavel: string;
  linkVerificacao: string;
}

export const adicionarCertificacaoSimplificada = (
  doc: jsPDF,
  dados: DadosCertificacaoSimplificada,
  yInicial: number
): number => {
  const pageWidth = doc.internal.pageSize.getWidth();
  const margemEsquerda = 15;
  const larguraUtil = pageWidth - 30;
  
  let y = yInicial;
  const yInicioCertificacao = y;
  
  // Calcular altura do conteúdo
  let yTemp = y + 6; // Título
  yTemp += 7; // Espaço após título
  yTemp += 5; // Protocolo
  yTemp += 5; // Responsável
  yTemp += 4; // "Verificar autenticidade em:"
  
  doc.setFontSize(8);
  const linkText = doc.splitTextToSize(dados.linkVerificacao, larguraUtil - 6);
  yTemp += linkText.length * 3.5 + 1;
  
  yTemp += 3; // Texto legal
  yTemp += 3; // Margem final
  
  const alturaConteudo = yTemp - yInicioCertificacao;
  
  // Desenhar retângulo - Fundo cinza
  doc.setFillColor(245, 245, 245);
  doc.rect(margemEsquerda, yInicioCertificacao, larguraUtil, alturaConteudo, 'F');
  
  // Borda preta
  doc.setDrawColor(0, 0, 0);
  doc.setLineWidth(0.5);
  doc.rect(margemEsquerda, yInicioCertificacao, larguraUtil, alturaConteudo, 'S');
  
  // Título da certificação
  y += 6;
  doc.setFontSize(12);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(0, 0, 139);
  doc.text('CERTIFICAÇÃO DIGITAL', pageWidth / 2, y, { align: 'center' });
  
  y += 7;
  
  // Conteúdo da certificação
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 0);
  
  doc.text(`Protocolo: ${dados.protocolo}`, margemEsquerda + 3, y);
  y += 5;
  
  doc.text(`Responsável: ${dados.responsavel}`, margemEsquerda + 3, y);
  y += 5;
  
  // Link de verificação
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('Verificar autenticidade em:', margemEsquerda + 3, y);
  y += 4;
  
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(0, 0, 255);
  doc.setFontSize(8);
  
  const linkVerifLinhas = doc.splitTextToSize(dados.linkVerificacao, larguraUtil - 6);
  linkVerifLinhas.forEach((linha: string, index: number) => {
    doc.textWithLink(linha, margemEsquerda + 3, y + (index * 3.5), {
      url: dados.linkVerificacao
    });
  });
  
  y += linkVerifLinhas.length * 3.5 + 1;
  
  // Texto legal
  doc.setTextColor(80, 80, 80);
  doc.setFontSize(7);
  const textoLegal = doc.splitTextToSize('Este documento possui certificação digital conforme Lei 14.063/2020', larguraUtil - 6);
  doc.text(textoLegal, margemEsquerda + 3, y);
  
  y += 3;
  
  return y;
};

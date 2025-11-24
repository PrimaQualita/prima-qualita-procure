import html2pdf from 'html2pdf.js';
import capaLogo from '@/assets/capa-processo-logo.png';
import capaRodape from '@/assets/capa-processo-rodape.png';
import logoMarcaDagua from '@/assets/prima-qualita-logo.png';

interface DadosCapaProcesso {
  numeroProcesso: string;
  numeroContrato: string;
  observacoesContrato: string;
  objetoProcesso: string;
}

export const gerarCapaProcessoPDF = async (dados: DadosCapaProcesso) => {
  const dataGeracao = new Date().toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  const htmlContent = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="UTF-8">
        <style>
          @page {
            size: A4;
            margin: 0;
          }
          
          body {
            font-family: Arial, sans-serif;
            width: 210mm;
            margin: 0;
            padding: 0;
            position: relative;
          }
          
          .page-container {
            width: 210mm;
            position: relative;
            padding-bottom: 30mm;
          }
          
          .header img {
            width: 100%;
            display: block;
          }
          
          .watermark {
            position: absolute;
            top: 120mm;
            left: 50%;
            transform: translateX(-50%);
            opacity: 0.08;
            width: 160mm;
            z-index: 0;
          }
          
          .content {
            padding: 0 50px;
            position: relative;
            z-index: 1;
          }
          
          .processo-line {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 15px 0;
            color: #1a5490;
          }
          
          .contrato-line {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            margin: 0 0 15px 0;
            color: #1a5490;
          }
          
          .objeto-section {
            margin-bottom: 30px;
          }
          
          .objeto-title {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 3px;
          }
          
          .objeto-text {
            font-size: 15px;
            line-height: 1.3;
          }
          
          .data-text {
            text-align: center;
            font-size: 18px;
            font-weight: bold;
            color: #1a5490;
            margin: 40px 0;
          }
          
          .assunto-section {
            margin-bottom: 20px;
          }
          
          .assunto-title {
            font-size: 15px;
            font-weight: bold;
            margin-bottom: 3px;
          }
          
          .assunto-text {
            font-size: 15px;
            line-height: 1.3;
            text-align: justify;
          }
          
          .footer {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
          }
          
          .footer img {
            width: 100%;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="page-container">
          <div class="header">
            <img src="${capaLogo}" alt="Logo">
          </div>
          
          <img src="${logoMarcaDagua}" class="watermark" alt="Marca d'água">
          
          <div class="content">
            <div class="processo-line">Processo: ${dados.numeroProcesso}</div>
            <div class="contrato-line">Contrato de Gestão: ${dados.numeroContrato}</div>
            
            <div class="objeto-section">
              <div class="objeto-title">Objeto:</div>
              <div class="objeto-text">${dados.observacoesContrato || 'Não informado'}</div>
            </div>
            
            <div class="data-text">
              Rio de Janeiro, ${new Date().toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric' 
              })}
            </div>
            
            <div class="assunto-section">
              <div class="assunto-title">Assunto:</div>
              <div class="assunto-text">${dados.objetoProcesso}</div>
            </div>
          </div>
          
          <div class="footer">
            <img src="${capaRodape}" alt="Rodapé">
          </div>
        </div>
      </body>
    </html>
  `;

  const opt = {
    margin: 0,
    filename: `Capa_Processo_${dados.numeroProcesso}.pdf`,
    image: { type: 'jpeg' as const, quality: 0.98 },
    html2canvas: { 
      scale: 2,
      useCORS: true,
      logging: false,
      letterRendering: true,
      windowHeight: 1122
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' as const
    },
    pagebreak: { mode: 'avoid-all', after: '.page-container' }
  };

  return html2pdf().set(opt).from(htmlContent).toPdf().output('blob');
};

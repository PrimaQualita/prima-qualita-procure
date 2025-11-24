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
          
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }
          
          body {
            font-family: Arial, sans-serif;
            width: 210mm;
            height: 297mm;
            position: relative;
            background: white;
          }
          
          .header {
            width: 100%;
            height: auto;
            margin: 0;
            padding: 0;
            display: block;
          }
          
          .header img {
            width: 100%;
            height: auto;
            display: block;
          }
          
          .watermark {
            position: absolute;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            opacity: 0.05;
            z-index: 1;
            width: 400px;
            height: auto;
            pointer-events: none;
          }
          
          .content {
            position: relative;
            z-index: 2;
            padding: 40px 60px;
            text-align: center;
          }
          
          .title {
            font-size: 24px;
            font-weight: bold;
            color: #333;
            margin-bottom: 60px;
            text-transform: uppercase;
          }
          
          .info-section {
            margin-bottom: 40px;
            text-align: left;
          }
          
          .info-label {
            font-size: 16px;
            font-weight: bold;
            color: #1a5490;
            margin-bottom: 10px;
          }
          
          .info-value {
            font-size: 14px;
            color: #333;
            line-height: 1.6;
            padding-left: 20px;
          }
          
          .footer {
            position: absolute;
            bottom: 0;
            left: 0;
            width: 100%;
            height: auto;
          }
          
          .footer img {
            width: 100%;
            height: auto;
            display: block;
          }
        </style>
      </head>
      <body>
        <div class="header">
          <img src="${capaLogo}" alt="Logo Prima Qualitá Saúde">
        </div>
        
        <img src="${logoMarcaDagua}" class="watermark" alt="Marca d'água">
        
        <div class="content">
          <div class="title">PRIMA QUALITÁ SAÚDE</div>
          
          <div class="info-section">
            <div class="info-label">PROCESSO Nº</div>
            <div class="info-value">${dados.numeroProcesso}</div>
          </div>
          
          <div class="info-section">
            <div class="info-label">CONTRATO DE GESTÃO</div>
            <div class="info-value">${dados.numeroContrato}</div>
          </div>
          
          <div class="info-section">
            <div class="info-label">OBJETO:</div>
            <div class="info-value">${dados.observacoesContrato || 'Não informado'}</div>
          </div>
          
          <div class="info-section">
            <div class="info-label">DATA:</div>
            <div class="info-value">${dataGeracao}</div>
          </div>
          
          <div class="info-section">
            <div class="info-label">ASSUNTO:</div>
            <div class="info-value">${dados.objetoProcesso}</div>
          </div>
        </div>
        
        <div class="footer">
          <img src="${capaRodape}" alt="Rodapé Prima Qualitá">
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
      letterRendering: true
    },
    jsPDF: { 
      unit: 'mm', 
      format: 'a4', 
      orientation: 'portrait' as const
    },
    pagebreak: { mode: 'avoid-all' }
  };

  return html2pdf().set(opt).from(htmlContent).toPdf().output('blob');
};

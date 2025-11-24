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
            position: absolute;
            top: 0;
            left: 0;
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
            opacity: 0.08;
            z-index: 1;
            width: 650px;
            height: auto;
            pointer-events: none;
          }
          
          .content {
            position: relative;
            z-index: 2;
            margin-top: 65mm;
            margin-bottom: 40mm;
            margin-left: 60px;
            margin-right: 60px;
            display: flex;
            flex-direction: column;
            justify-content: space-between;
            min-height: calc(297mm - 65mm - 40mm);
          }
          
          .top-section {
            flex-shrink: 0;
          }
          
          .processo-line {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 15px;
            color: #1a5490;
          }
          
          .contrato-line {
            text-align: center;
            font-size: 20px;
            font-weight: bold;
            margin-bottom: 20px;
            color: #1a5490;
          }
          
          .objeto-section {
            margin-bottom: 0;
            text-align: left;
          }
          
          .objeto-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 2px;
          }
          
          .objeto-text {
            font-size: 16px;
            line-height: 1.2;
          }
          
          .middle-section {
            text-align: center;
            flex-grow: 0;
            flex-shrink: 0;
            margin: 10px 0;
          }
          
          .data-text {
            font-size: 20px;
            font-weight: bold;
            color: #1a5490;
          }
          
          .bottom-section {
            margin-bottom: 0;
            padding-bottom: 10px;
            text-align: left;
            flex-shrink: 0;
          }
          
          .assunto-title {
            font-size: 16px;
            font-weight: bold;
            margin-bottom: 2px;
          }
          
          .assunto-text {
            font-size: 16px;
            line-height: 1.2;
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
          <div class="top-section">
            <div class="processo-line">Processo: ${dados.numeroProcesso}</div>
            
            <div class="contrato-line">Contrato de Gestão: ${dados.numeroContrato}</div>
            
            <div class="objeto-section">
              <div class="objeto-title">Objeto:</div>
              <div class="objeto-text">${dados.observacoesContrato || 'Não informado'}</div>
            </div>
          </div>
          
          <div class="middle-section">
            <div class="data-text">
              Rio de Janeiro, ${new Date().toLocaleDateString('pt-BR', { 
                day: '2-digit', 
                month: 'long', 
                year: 'numeric' 
              })}
            </div>
          </div>
          
          <div class="bottom-section">
            <div class="assunto-title">Assunto:</div>
            <div class="assunto-text">${dados.objetoProcesso}</div>
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

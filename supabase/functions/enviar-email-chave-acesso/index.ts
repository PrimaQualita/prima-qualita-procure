import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface EmailRequest {
  email: string;
  razaoSocial: string;
  codigoAcesso: string;
  tituloSelecao: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, razaoSocial, codigoAcesso, tituloSelecao }: EmailRequest = await req.json();

    console.log("Enviando e-mail para:", email);
    console.log("Razão Social:", razaoSocial);
    console.log("Código de Acesso:", codigoAcesso);

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Prima Qualitá <onboarding@resend.dev>",
        to: [email],
        subject: "Confirmação de Envio de Proposta - Seleção de Fornecedores",
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h1 style="color: #333;">Proposta Enviada com Sucesso!</h1>
            
            <p>Prezado(a) <strong>${razaoSocial}</strong>,</p>
            
            <p>Sua proposta para a <strong>${tituloSelecao}</strong> foi enviada com sucesso!</p>
            
            <div style="background-color: #f5f5f5; padding: 20px; margin: 20px 0; border-radius: 8px;">
              <h2 style="margin-top: 0; color: #555;">Chave de Acesso</h2>
              <p style="font-size: 24px; font-weight: bold; color: #2563eb; text-align: center; letter-spacing: 2px;">
                ${codigoAcesso}
              </p>
              <p style="font-size: 14px; color: #666; margin-bottom: 0;">
                <strong>IMPORTANTE:</strong> Guarde esta chave de acesso. Você precisará dela para futuras consultas e acompanhamento da sua proposta.
              </p>
            </div>
            
            <p>Agradecemos pela participação!</p>
            
            <hr style="border: none; border-top: 1px solid #ddd; margin: 30px 0;">
            
            <p style="font-size: 12px; color: #999;">
              Atenciosamente,<br>
              <strong>Prima Qualitá</strong><br>
              Travessa do Ouvidor, 21, Sala 503, Centro<br>
              Rio de Janeiro - RJ, CEP: 20.040-040
            </p>
          </div>
        `,
      }),
    });

    const data = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Erro da API Resend:", data);
      throw new Error(data.message || "Erro ao enviar e-mail");
    }

    console.log("E-mail enviado com sucesso:", data);

    return new Response(JSON.stringify({ success: true, data }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Erro ao enviar e-mail:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);

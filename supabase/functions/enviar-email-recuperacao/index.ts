import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface RecoveryEmailRequest {
  email: string;
  redirectTo: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, redirectTo }: RecoveryEmailRequest = await req.json();

    console.log("Solicitação de recuperação de senha para:", email);

    // Criar cliente Supabase Admin
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Gerar link de recuperação sem enviar email
    const { data: linkData, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: email,
      options: {
        redirectTo: redirectTo,
      },
    });

    if (linkError) {
      console.error("Erro ao gerar link de recuperação:", linkError);
      throw new Error("Não foi possível gerar o link de recuperação. Verifique se o email está cadastrado.");
    }

    const resetLink = linkData.properties.action_link;
    console.log("Link de recuperação gerado com sucesso");

    // Enviar email personalizado via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "Prima Qualitá Saúde <noreply@primaqualitasaude.org>",
        to: [email],
        subject: "Recuperação de Senha - Sistema de Compras Prima Qualitá",
        html: `
          <!DOCTYPE html>
          <html lang="pt-BR">
          <head>
            <meta charset="UTF-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Recuperação de Senha</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: Arial, Helvetica, sans-serif; background-color: #f4f4f4;">
            <table role="presentation" style="width: 100%; border-collapse: collapse;">
              <tr>
                <td align="center" style="padding: 40px 0;">
                  <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
                    <!-- Header com Logo -->
                    <tr>
                      <td style="padding: 30px 40px; text-align: center; background-color: #0077B6; border-radius: 8px 8px 0 0;">
                        <h1 style="color: #ffffff; margin: 0; font-size: 24px; font-weight: bold;">
                          🏥 PRIMA QUALITÁ SAÚDE
                        </h1>
                        <p style="color: #ffffff; margin: 8px 0 0 0; font-size: 14px; opacity: 0.9;">
                          Sistema de Compras
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Conteúdo -->
                    <tr>
                      <td style="padding: 40px;">
                        <h2 style="color: #333333; margin: 0 0 20px 0; font-size: 22px;">
                          Recuperação de Senha
                        </h2>
                        
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                          Olá,
                        </p>
                        
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                          Recebemos uma solicitação para redefinir a senha da sua conta no 
                          <strong>Sistema de Compras da Prima Qualitá Saúde</strong>.
                        </p>
                        
                        <p style="color: #555555; font-size: 16px; line-height: 1.6; margin: 0 0 30px 0;">
                          Clique no botão abaixo para criar uma nova senha:
                        </p>
                        
                        <!-- Botão -->
                        <table role="presentation" style="width: 100%; border-collapse: collapse;">
                          <tr>
                            <td align="center">
                              <a href="${resetLink}" 
                                 style="display: inline-block; 
                                        background-color: #0077B6; 
                                        color: #ffffff; 
                                        text-decoration: none; 
                                        padding: 16px 40px; 
                                        border-radius: 6px; 
                                        font-size: 16px; 
                                        font-weight: bold;
                                        box-shadow: 0 2px 4px rgba(0,119,182,0.3);">
                                Redefinir Minha Senha
                              </a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 30px 0 0 0;">
                          Se você não solicitou a recuperação de senha, pode ignorar este e-mail com segurança. 
                          Sua senha atual permanecerá inalterada.
                        </p>
                        
                        <p style="color: #888888; font-size: 14px; line-height: 1.6; margin: 20px 0 0 0;">
                          Este link é válido por 24 horas.
                        </p>
                      </td>
                    </tr>
                    
                    <!-- Rodapé -->
                    <tr>
                      <td style="padding: 30px 40px; background-color: #f8f9fa; border-radius: 0 0 8px 8px; border-top: 1px solid #e9ecef;">
                        <p style="color: #666666; font-size: 13px; line-height: 1.5; margin: 0; text-align: center;">
                          <strong>Prima Qualitá Saúde</strong><br>
                          Travessa do Ouvidor, 21, Sala 503<br>
                          Centro, Rio de Janeiro - RJ<br>
                          CEP: 20.040-040
                        </p>
                        <p style="color: #999999; font-size: 12px; margin: 15px 0 0 0; text-align: center;">
                          Este é um e-mail automático. Por favor, não responda.
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
        `,
      }),
    });

    const emailData = await emailResponse.json();

    if (!emailResponse.ok) {
      console.error("Erro da API Resend:", emailData);
      throw new Error(emailData.message || "Erro ao enviar e-mail");
    }

    console.log("Email de recuperação enviado com sucesso:", emailData);

    return new Response(JSON.stringify({ success: true }), {
      status: 200,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Erro ao enviar email de recuperação:", error);
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

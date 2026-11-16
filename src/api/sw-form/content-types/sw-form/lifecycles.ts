import { recordStrapiEmail, strapiDelivery } from '../../../../utils/email-log';

export default {
  async afterCreate(event) {
    const { result } = event;

    if (!result?.email || !result?.name) {
      strapi.log.warn(
        `SW Form created (id: ${result?.documentId}) but missing email or name — skipping confirmation email`
      );
      return;
    }

    const defaultFrom = process.env.EMAIL_DEFAULT_FROM || 'noreply@example.com';
    const isVolunteer = result.college_course === 'VOLUNTÁRIO';
    const isCertificado = result.college_course === 'Certificado' || result.college_course === 'CERTIFICADO';

    let content;

    if (isVolunteer) {
      content = {
          subject: 'Inscrição de Voluntário recebida – Startup Weekend',
          introHtml:
            'Recebemos sua inscrição como <strong>voluntário do Startup Weekend Anápolis</strong>. Bora fazer esse evento acontecer!',
          introText:
            'Recebemos sua inscrição como voluntário do Startup Weekend Anápolis. Bora fazer esse evento acontecer!',
          bulletsHtml: [
            'Nossa equipe vai entrar em contato no <strong>WhatsApp</strong> com os próximos passos da operação.',
            'Você vai receber os detalhes de função, turnos e benefícios da crew.',
            'Prepara o hype e vem bombar o evento com a gente!',
          ],
          bulletsText: [
            '- Nossa equipe vai entrar em contato no WhatsApp com os próximos passos da operação.',
            '- Você vai receber os detalhes de função, turnos e benefícios da crew.',
            '- Prepara o hype e vem bombar o evento com a gente!',
          ],
        };
    } else if (isCertificado) {
      content = {
          subject: 'Confirmação de Dados Recebida – Startup Weekend',
          introHtml:
            'Recebemos seus dados para a <strong>emissão do certificado do Startup Weekend Anápolis</strong> com sucesso.',
          introText:
            'Recebemos seus dados para a emissão do certificado do Startup Weekend Anápolis com sucesso.',
          bulletsHtml: [
            'As informações já estão registradas em nossa base.',
            'Em breve, o seu certificado de participação será disponibilizado.',
            'Acompanhe nossos canais para não perder a atualização!',
          ],
          bulletsText: [
            '- As informações já estão registradas em nossa base.',
            '- Em breve, o seu certificado de participação será disponibilizado.',
            '- Acompanhe nossos canais para não perder a atualização!',
          ],
        };
    } else {
      content = {
          subject: 'Inscrição para Apadrinhamento recebida – Startup Weekend',
          introHtml:
            'Recebemos sua aplicação para o <strong>apadrinhamento do Startup Weekend Anápolis</strong> com sucesso.',
          introText:
            'Recebemos sua aplicação para o apadrinhamento do Startup Weekend Anápolis com sucesso.',
          bulletsHtml: [
            'Nossos recrutadores vão analisar seu pitch com atenção.',
            'Entraremos em contato pelo seu <strong>e-mail</strong> ou <strong>WhatsApp</strong> para informar o resultado.',
            'Fique colado no seu celular!',
          ],
          bulletsText: [
            '- Nossos recrutadores vão analisar seu pitch com atenção.',
            '- Entraremos em contato pelo seu e-mail ou WhatsApp para informar o resultado.',
            '- Fique colado no seu celular!',
          ],
        };
    }

    // REA-52: recorded in the e-mail history (and counted in the quota) like the bff's e-mails.
    try {
      const sent = await strapi.plugin('email').service('email').send({
        from: `Pedro Goiania <${defaultFrom}>`,
        to: result.email,
        subject: content.subject,
        text: [
          `Olá, ${result.name}!`,
          '',
          'INSCRIÇÃO RECEBIDA!',
          '',
          content.introText,
          '',
          'PRÓXIMOS PASSOS:',
          ...content.bulletsText,
          '',
          'Enquanto isso, acompanhe as novidades em startupweekendanapolis.com.br',
          '',
          'Até logo!',
          'Equipe Startup Weekend Anápolis',
        ].join('\n'),
        html: buildEmailHtml(result.name, content),
      });

      await recordStrapiEmail(strapi, strapiDelivery({
        kind: 'sw-form', to: result.email, subject: content.subject, result: sent,
      }));
      strapi.log.info(
        `SW Form confirmation email sent to ${result.email} (${isVolunteer ? 'volunteer' : 'apadrinhamento'})`
      );
    } catch (error) {
      await recordStrapiEmail(strapi, strapiDelivery({
        kind: 'sw-form', to: result.email, subject: content.subject, error,
      }));
      strapi.log.error(
        `Failed to send SW Form confirmation email to ${result.email}: ${error.message}`
      );
    }
  },
};

type EmailContent = {
  introHtml: string;
  bulletsHtml: string[];
};

function buildEmailHtml(name: string, content: EmailContent): string {
  const bulletRows = content.bulletsHtml
    .map(
      (bullet) => `
                                        <tr>
                                          <td style="padding:6px 0;font-size:15px;font-weight:700;color:#000000;vertical-align:top;width:24px;">&#9654;</td>
                                          <td style="padding:6px 0;font-size:15px;font-weight:700;color:#000000;">${bullet}</td>
                                        </tr>`
    )
    .join('');

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Inscrição Recebida - Startup Weekend</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f0;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f0;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- HEADER BAR -->
          <tr>
            <td style="background-color:#39C463;border:4px solid #000000;padding:20px 24px;text-align:center;">
              <span style="font-size:22px;font-weight:900;color:#000000;text-transform:uppercase;letter-spacing:-0.5px;">
                STARTUP WEEKEND ANÁPOLIS
              </span>
            </td>
          </tr>

          <!-- SPACER -->
          <tr><td style="height:8px;"></td></tr>

          <!-- MAIN CARD with simulated shadow -->
          <tr>
            <td>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <!-- Shadow layer -->
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:0 0 8px 8px;">
                          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:4px solid #000000;background-color:#ffffff;">

                            <!-- Title -->
                            <tr>
                              <td style="padding:32px 32px 16px 32px;text-align:center;">
                                <div style="font-size:36px;font-weight:900;color:#000000;text-transform:uppercase;letter-spacing:-1px;line-height:1.1;">
                                  INSCRIÇÃO RECEBIDA!
                                </div>
                              </td>
                            </tr>

                            <!-- Greeting -->
                            <tr>
                              <td style="padding:0 32px 24px 32px;text-align:center;">
                                <p style="font-size:18px;font-weight:700;color:#000000;margin:0;">
                                  Olá, ${name}!
                                </p>
                                <p style="font-size:16px;color:#333333;margin:12px 0 0 0;line-height:1.5;">
                                  ${content.introHtml}
                                </p>
                              </td>
                            </tr>

                            <!-- NEXT STEPS with yellow accent -->
                            <tr>
                              <td style="padding:0 32px 24px 32px;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:4px solid #000000;background-color:#FACC15;">
                                  <tr>
                                    <td style="padding:20px 24px;">
                                      <div style="font-size:18px;font-weight:900;color:#000000;text-transform:uppercase;letter-spacing:-0.5px;margin-bottom:12px;border-bottom:3px solid #000000;padding-bottom:8px;">
                                        PRÓXIMOS PASSOS
                                      </div>
                                      <table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;">${bulletRows}
                                      </table>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>

                            <!-- CTA BOX -->
                            <tr>
                              <td style="padding:0 32px 32px 32px;">
                                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:4px solid #000000;background-color:#39C463;">
                                  <tr>
                                    <td style="padding:20px 24px;text-align:center;">
                                      <div style="font-size:14px;font-weight:900;color:#000000;text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                                        Enquanto isso, acompanhe as novidades
                                      </div>
                                      <a href="https://startupweekendanapolis.com.br" style="font-size:16px;font-weight:900;color:#000000;text-decoration:underline;">
                                        startupweekendanapolis.com.br
                                      </a>
                                    </td>
                                  </tr>
                                </table>
                              </td>
                            </tr>

                          </table>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- SPACER -->
          <tr><td style="height:8px;"></td></tr>

          <!-- FOOTER -->
          <tr>
            <td style="background-color:#000000;border:4px solid #000000;padding:24px;text-align:center;">
              <div style="font-size:16px;font-weight:900;color:#ffffff;text-transform:uppercase;letter-spacing:-0.5px;">
                techstars_ Startup Weekend
              </div>
              <div style="font-size:13px;font-weight:700;color:#888888;margin-top:4px;">
                Anápolis - GO
              </div>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

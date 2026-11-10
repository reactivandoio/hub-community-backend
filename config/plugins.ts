export default ({ env }) => ({
  "users-permissions": {
    config: {
      register: {
        // marketing_opt_in: checkbox of the signup form (REA-29); the date is stamped by the user lifecycle
        allowedFields: ["name", "phone", "marketing_opt_in"],
      },
    },
  },
  upload: {
    config: {
      sizeLimit: 250 * 1024 * 1024, // 250MB for video uploads
    },
  },
  email: {
    config: {
      provider: "nodemailer",
      providerOptions: {
        host: env("SMTP_HOST", "smtp.mailgun.org"),
        port: env.int("SMTP_PORT", 587),
        auth: {
          user: env("SMTP_USER"),
          pass: env("SMTP_PASS"),
        },
        secure: env.bool("SMTP_SECURE", false),
      },
      settings: {
        defaultFrom: env("EMAIL_DEFAULT_FROM", "noreply@example.com"),
        defaultReplyTo: env("EMAIL_DEFAULT_REPLY_TO", "noreply@example.com"),
      },
    },
  },
});

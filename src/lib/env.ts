function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`Missing required environment variable ${name}`);
  return v;
}

export const env = {
  get appUrl() {
    return required("APP_URL").replace(/\/+$/, "");
  },
  get appName() {
    return process.env.NEXT_PUBLIC_APP_NAME || "AutoPoster";
  },
  get authSecret() {
    return required("AUTH_SECRET");
  },
  get encryptionKey() {
    return required("ENCRYPTION_KEY");
  },
  get redisUrl() {
    return process.env.REDIS_URL || "redis://localhost:6379";
  },
  get adminEmail() {
    return (process.env.ADMIN_EMAIL || "").toLowerCase();
  },
  get uploadDir() {
    return process.env.UPLOAD_DIR || "./uploads";
  },
  get maxUploadBytes() {
    return Number(process.env.MAX_UPLOAD_MB || 512) * 1024 * 1024;
  },
  get trialDays() {
    return Number(process.env.TRIAL_DAYS ?? 7);
  },
  get billingProvider() {
    return process.env.BILLING_PROVIDER || "manual";
  },
  get billingInstructions() {
    return process.env.BILLING_INSTRUCTIONS || "Contact support to arrange payment.";
  },
  get mockProvider() {
    return process.env.ENABLE_MOCK_PROVIDER === "true";
  },
  meta: {
    get appId() {
      return process.env.META_APP_ID || "";
    },
    get appSecret() {
      return process.env.META_APP_SECRET || "";
    },
    get version() {
      return process.env.META_GRAPH_VERSION || "v26.0";
    },
  },
  google: {
    get clientId() {
      return process.env.GOOGLE_CLIENT_ID || "";
    },
    get clientSecret() {
      return process.env.GOOGLE_CLIENT_SECRET || "";
    },
    get serviceAccountB64() {
      return process.env.GOOGLE_SERVICE_ACCOUNT_B64 || "";
    },
  },
  pinterest: {
    get appId() {
      return process.env.PINTEREST_APP_ID || "";
    },
    get appSecret() {
      return process.env.PINTEREST_APP_SECRET || "";
    },
    get apiBase() {
      return (process.env.PINTEREST_API_BASE || "https://api.pinterest.com").replace(/\/+$/, "");
    },
  },
  ai: {
    get apiKey() {
      return process.env.ANTHROPIC_API_KEY || "";
    },
    get model() {
      return process.env.AI_MODEL || "claude-haiku-5-5";
    },
  },
  get smtpUrl() {
    return process.env.SMTP_URL || "";
  },
  get mailFrom() {
    return process.env.MAIL_FROM || "no-reply@localhost";
  },
};

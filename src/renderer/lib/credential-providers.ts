export interface ProviderPreset {
  id: string
  name: string
  imap?: { host: string; port: number; secure: boolean }
  smtp?: { host: string; port: number; secure: boolean }
  authGuide?: {
    passwordLabel: string
    steps: string[]
    settingsUrl: string
    helpText: string
  }
}

export const CREDENTIAL_PROVIDERS: ProviderPreset[] = [
  {
    id: 'gmail',
    name: 'Gmail',
    imap: { host: 'imap.gmail.com', port: 993, secure: true },
    smtp: { host: 'smtp.gmail.com', port: 587, secure: false },
    authGuide: {
      passwordLabel: 'App Password',
      steps: [
        'Go to your Google Account (myaccount.google.com).',
        'Open Security → 2-Step Verification (enable it if it\'s not already on).',
        'Scroll to "App passwords" and click it.',
        'Select app: Mail, device: Other — type "Trayline" — click Generate.',
        'Copy the 16-character code and paste it in the field below.',
      ],
      settingsUrl: 'https://myaccount.google.com/apppasswords',
      helpText: 'Gmail requires an App Password — not your regular Google password.',
    },
  },
  {
    id: 'outlook',
    name: 'Outlook / Hotmail',
    imap: { host: 'outlook.office365.com', port: 993, secure: true },
    smtp: { host: 'smtp.office365.com', port: 587, secure: false },
    authGuide: {
      passwordLabel: 'App Password',
      steps: [
        'Go to account.microsoft.com → Security → Advanced security options.',
        'Under "App passwords", click Create a new app password.',
        'Copy the generated password and paste it in the field below.',
      ],
      settingsUrl: 'https://account.microsoft.com/security',
      helpText: 'Microsoft accounts with 2-step verification require an App Password.',
    },
  },
  {
    id: 'yahoo',
    name: 'Yahoo Mail',
    imap: { host: 'imap.mail.yahoo.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.yahoo.com', port: 465, secure: true },
    authGuide: {
      passwordLabel: 'App Password',
      steps: [
        'Go to Yahoo Account Security (login.yahoo.com/account/security).',
        'Under "Manage app passwords", click Generate password.',
        'Select "Other app", name it "Trayline", click Generate.',
        'Copy the password and paste it below.',
      ],
      settingsUrl: 'https://login.yahoo.com/account/security',
      helpText: 'Yahoo requires an App Password for third-party email clients.',
    },
  },
  {
    id: 'icloud',
    name: 'iCloud Mail',
    imap: { host: 'imap.mail.me.com', port: 993, secure: true },
    smtp: { host: 'smtp.mail.me.com', port: 587, secure: true },
    authGuide: {
      passwordLabel: 'App-Specific Password',
      steps: [
        'Go to appleid.apple.com and sign in.',
        'Under Sign-In and Security → App-Specific Passwords, click Generate.',
        'Name it "Trayline" and click Create.',
        'Copy the password and paste it below.',
      ],
      settingsUrl: 'https://appleid.apple.com',
      helpText: 'iCloud requires an App-Specific Password for third-party clients.',
    },
  },
  {
    id: 'custom',
    name: 'Custom / other',
  },
]

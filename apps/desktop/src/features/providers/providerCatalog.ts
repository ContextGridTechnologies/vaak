export type ProviderCategory = "speech-to-text" | "rewrite";

export type ProviderSetupStatus = "not-configured" | "configured" | "coming-soon";

export type ProviderCatalogItem = {
  id: "openai" | "deepgram" | "groq";
  name: string;
  description: string;
  categories: ProviderCategory[];
  credentialLabel: string;
  setupStatus: ProviderSetupStatus;
  modelHint?: string;
};

export const providerCatalog: ProviderCatalogItem[] = [
  {
    id: "openai",
    name: "OpenAI",
    description: "Use OpenAI for transcription and transcript cleanup.",
    categories: ["speech-to-text", "rewrite"],
    credentialLabel: "OpenAI API key",
    setupStatus: "not-configured",
    modelHint: "Speech-to-text and OpenAI-compatible rewrite models",
  },
  {
    id: "deepgram",
    name: "Deepgram",
    description: "Use Deepgram as a speech-focused transcription provider.",
    categories: ["speech-to-text"],
    credentialLabel: "Deepgram API key",
    setupStatus: "not-configured",
    modelHint: "Speech-to-text",
  },
  {
    id: "groq",
    name: "Groq",
    description: "Use Groq for fast transcription and compatible model paths.",
    categories: ["speech-to-text", "rewrite"],
    credentialLabel: "Groq API key",
    setupStatus: "not-configured",
    modelHint: "Fast speech and rewrite provider paths",
  },
];

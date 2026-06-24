export type ProviderCategory = "speech-to-text" | "rewrite";

export type ProviderSetupStatus = "not-configured" | "configured" | "coming-soon";

export type ProviderCatalogItem = {
  id:
    | "openai"
    | "azure-openai"
    | "azure-ai-speech"
    | "assemblyai"
    | "deepgram"
    | "groq"
    | "elevenlabs"
    | "smallest";
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
    id: "azure-openai",
    name: "Azure OpenAI",
    description: "Use Azure OpenAI deployments for local transcription.",
    categories: ["speech-to-text"],
    credentialLabel: "Azure OpenAI API key",
    setupStatus: "not-configured",
    modelHint: "Azure OpenAI endpoint and transcription deployment",
  },
  {
    id: "azure-ai-speech",
    name: "Azure AI Speech",
    description: "Use Azure AI Speech short-audio transcription with your own key.",
    categories: ["speech-to-text"],
    credentialLabel: "Azure AI Speech key",
    setupStatus: "not-configured",
    modelHint: "Azure Speech resource endpoint",
  },
  {
    id: "assemblyai",
    name: "AssemblyAI",
    description: "Use AssemblyAI batch speech-to-text with your own API key.",
    categories: ["speech-to-text"],
    credentialLabel: "AssemblyAI API key",
    setupStatus: "not-configured",
    modelHint: "Pre-recorded transcription models",
  },
  {
    id: "smallest",
    name: "Smallest AI",
    description: "Use Smallest AI Pulse pre-recorded transcription with your own API key.",
    categories: ["speech-to-text"],
    credentialLabel: "Smallest AI API key",
    setupStatus: "not-configured",
    modelHint: "Pulse",
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
    setupStatus: "coming-soon",
    modelHint: "Fast speech and rewrite provider paths",
  },
  {
    id: "elevenlabs",
    name: "ElevenLabs",
    description: "Use ElevenLabs Scribe for speech-to-text with your own API key.",
    categories: ["speech-to-text"],
    credentialLabel: "ElevenLabs API key",
    setupStatus: "not-configured",
    modelHint: "Scribe batch transcription",
  },
];

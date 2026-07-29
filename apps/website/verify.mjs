import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const siteRoot = new URL(".", import.meta.url);
const html = await readFile(new URL("index.html", siteRoot), "utf8");
const privacy = await readFile(new URL("privacy.html", siteRoot), "utf8");
const css = await readFile(new URL("styles.css", siteRoot), "utf8");
const positioning = await readFile(new URL("../../docs/POSITIONING.md", siteRoot), "utf8");
const roadmap = await readFile(new URL("../../docs/ROADMAP.md", siteRoot), "utf8");

const requiredHtml = [
  "Open-source voice input for every desktop app",
  "Vaak-Windows-Setup.exe",
  "github.com/ContextGridTechnologies/vaak",
  "aria-label=\"Main navigation\"",
  "alt=\"Vaak",
  "class=\"hero-layout\"",
  "Voice input for",
  "class=\"hero-line\"",
  "Press a hotkey, speak naturally",
  "class=\"hero-product voice-demo\"",
  "class=\"voice-wave\"",
  "Inserted in your active app",
  "No account. No subscription. Your provider.",
  "class=\"proof-bar\"",
  "Source available",
  "No Vaak account",
  "SHA-256 published",
  "Windows early preview",
  "<section class=\"faq\"",
  "What does local-first mean?",
  "Does audio leave my computer?",
  "What does free to Vaak mean?",
  "What happens if managed credits run out?",
  "Which operating systems are available?",
  "https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-Windows-Setup.exe",
  "https://github.com/ContextGridTechnologies/vaak/releases/latest/download/Vaak-Windows-Setup.exe.sha256",
  "id=\"pricing\"",
  "Pay as you go.",
  "Keep the app.",
  "Vaak does not put the desktop app behind a subscription",
  "If you stop topping up",
  "continue with your own provider",
  "No monthly plan. No automatic renewal.",
  "$1",
  "60 minutes",
  "Bring your own provider",
  "Coming soon",
];

for (const text of requiredHtml) {
  if (!html.includes(text)) throw new Error(`Missing website requirement: ${text}`);
}

if (!html.includes("href=\"privacy.html\"")) throw new Error("Homepage footer must link to the privacy policy");

for (const text of [
  "<title>Privacy Policy — Vaak</title>",
  "Effective July 28, 2026",
  "Website and hosting data",
  "Local desktop data",
  "Speech and rewrite providers",
  "Optional product telemetry",
  "Cloudflare",
  "PostHog",
  "We do not sell",
  "Your privacy rights",
  "Contact",
  "Both controls default to off",
  "Dictation records—including transcript text and local audio artifacts",
  "full destination window title",
  "Focused-field contents are not retained",
  "Managed transcription, accounts, billing, and sync are not part of the current local-first release",
  "do not place audio, transcripts, API keys, personal identifiers, or other sensitive information in a public GitHub issue",
]) {
  if (!privacy.includes(text)) throw new Error(`Missing privacy policy requirement: ${text}`);
}

if (!css.includes("@media (max-width: 700px)")) {
  throw new Error("Missing mobile layout");
}

for (const rule of [
  "--coral: #b64c2f",
  "overflow-x: hidden",
  ".voice-demo",
  "@keyframes voice-level",
  "@keyframes text-cleanup",
  "@keyframes listening-state",
  "@keyframes inserted-state",
  ".voice-demo * { animation: none !important; }",
  ".proof-bar",
  ".faq-list",
  "color: #d0d6d2",
  "grid-template-columns: minmax(0, .9fr) minmax(0, 1.1fr)",
]) {
  if (!css.includes(rule)) throw new Error(`Missing website style requirement: ${rule}`);
}

if (html.includes("analytics-live.png")) {
  throw new Error("Hero must demonstrate voice insertion instead of showing the analytics dashboard");
}

if (html.includes("class=\"principles\"")) {
  throw new Error("Repeated principles section should be replaced by answers to buyer questions");
}

const byoPricing = html.match(/<article class="pricing-option">([\s\S]*?)<\/article>/)?.[1] ?? "";
const managedPricing = html.match(/<article class="pricing-option pricing-option-managed">([\s\S]*?)<\/article>/)?.[1] ?? "";

for (const text of ["Bring your own provider", "Free", "to Vaak", "switch providers whenever you want"]) {
  if (!byoPricing.includes(text)) throw new Error(`Missing BYO pricing requirement: ${text}`);
}

for (const text of ["Coming soon", "Prepaid managed minutes", "$1", "60 minutes", "$5", "300 minutes", "$10", "600 minutes", "No monthly plan"]) {
  if (!managedPricing.includes(text)) throw new Error(`Missing managed pricing requirement: ${text}`);
}

const pricingSources = [html, positioning, roadmap].join("\n");
if (/credits never expire/i.test(pricingSources)) throw new Error("Pricing must not promise non-expiring credits");
if (/Pro plan with fair-use limits/i.test(roadmap)) throw new Error("Roadmap still describes managed usage as a subscription plan");

console.log("Website structure check passed.");

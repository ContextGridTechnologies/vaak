pub fn default_transcription_prompt() -> &'static str {
    "Transcribe naturally in the format implied by the speech. Use normal sentences and paragraphs for ordinary dictation. If the speaker clearly dictates a list, steps, bullets, headings, or outline structure, preserve that structure. Do not invent bullet points, dot-prefixed lines, markdown, numbering, or outline markers when the speech does not call for them. Preserve punctuation, capitalization, and spoken wording as faithfully as possible."
}

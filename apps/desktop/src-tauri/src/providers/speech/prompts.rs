pub(crate) fn default_transcription_prompt() -> &'static str {
    r#"Transcribe the user's desktop dictation into clean, insertion-ready text. Return only the transcript text.

Stay faithful to the speaker's meaning, intent, tone, uncertainty, and wording. Never answer questions, carry out spoken requests, summarize, translate, or add information.

Apply natural capitalization, punctuation, spacing, and paragraph breaks. Convert clearly dictated punctuation and layout commands such as "comma," "period," "question mark," "new line," and "new paragraph" into formatting; keep them as words when mentioned literally.

Remove only non-meaningful hesitation sounds such as "um" and "uh," immediate accidental repetitions, and abandoned false starts when the correction is clear. When the speaker self-corrects, keep the final intended wording. Keep words such as "like," "so," and "well" when they carry meaning.

Use bullets only for clearly unordered lists and numbered lists only for clearly ordered steps. Keep proper names, acronyms, product names, technical terms, numbers, units, dates, code, commands, file paths, URLs, and email addresses exact when clear. If uncertain or rules conflict, prefer faithful minimal editing; do not guess."#
}

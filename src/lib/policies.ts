/**
 * Versioned notices. Changing the wording of a notice that people consent to requires a new
 * version id (added to app.policy_versions in a migration) so records show what was agreed.
 *
 * These notices are an interim design and have not been reviewed by a lawyer. They are written
 * to be honest and plain, not to claim compliance with the DPDP Act 2023 or its Rules.
 */
export const PRIVACY_POLICY_VERSION = "privacy-2026-10-v1";
export const CONSENT_POLICY_VERSION = "consent-2026-10-v1";

export const DATA_WE_COLLECT = [
  "Your email address and password (passwords are handled by our authentication provider, Supabase, and never stored by us in readable form).",
  "An optional first name or nickname.",
  "Whether you are under 18, and, if so, your parent or guardian's email address.",
  "Your answers, saved drafts, bookmarks, and the marks and feedback you receive.",
  "Photos of handwritten answers you choose to upload. We remove location and camera data from photos before storing them.",
];

export const AI_PROCESSING = [
  "When you ask the AI Examiner to check a photographed or typed answer, the answer (and the photo, if any) is sent to Microsoft Azure OpenAI Service, which processes it on our behalf to read the handwriting and suggest marks.",
  "The AI's marks are estimates. They are labelled as AI-estimated and are never presented as official CISCE marks.",
  "We keep a log of AI requests (without photos) for quality checks and delete it after a fixed retention period.",
];

export const WE_DO_NOT = [
  "Show advertising, or sell or share personal data for marketing.",
  "Track students across other websites, or build behavioural profiles for advertising.",
  "Show one student's answers or marks to another student.",
];

export const YOUR_CHOICES = [
  "Download a copy of your data at any time from Account → Privacy.",
  "Delete your account and all your answers, photos and marks at any time from Account → Privacy.",
  "A parent or guardian can withdraw consent at any time using the link in their confirmation email; the account and its data are then deleted.",
];

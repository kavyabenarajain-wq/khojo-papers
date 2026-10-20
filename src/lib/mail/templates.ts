import { AI_PROCESSING, DATA_WE_COLLECT, WE_DO_NOT } from "../policies";

export function guardianConsentEmail({ studentName, link }: { studentName: string | null; link: string }) {
  const who = studentName ? `${studentName}` : "A student";
  const text = [
    `Hello,`,
    ``,
    `${who} has created a KHOJO PAPERS account and gave your email address as their parent or guardian.`,
    `KHOJO PAPERS is an ICSE Class 10 study tool. Because the student is under 18, we need your consent before we store their work.`,
    ``,
    `What we would store:`,
    ...DATA_WE_COLLECT.map((d) => `- ${d}`),
    ``,
    `AI marking:`,
    ...AI_PROCESSING.map((d) => `- ${d}`),
    ``,
    `We do not:`,
    ...WE_DO_NOT.map((d) => `- ${d}`),
    ``,
    `To read the full notice and give or refuse consent, open this link (valid for 7 days):`,
    link,
    ``,
    `If you don't recognise this request, you can ignore this email; the account will be deleted automatically if consent isn't given.`,
    ``,
    `KHOJO PAPERS is an independent study tool and is not affiliated with CISCE.`,
  ].join("\n");
  return { subject: "Please confirm consent for a KHOJO PAPERS student account", text };
}

export function consentConfirmedEmail({ studentName, withdrawLink }: { studentName: string | null; withdrawLink: string }) {
  const text = [
    `Thank you. You have given consent for ${studentName ?? "the student"}'s KHOJO PAPERS account.`,
    ``,
    `You can withdraw consent at any time with the link below. Withdrawing deletes the account and all of its answers, photos and marks.`,
    withdrawLink,
    ``,
    `Keep this email if you may want to withdraw consent later.`,
  ].join("\n");
  return { subject: "KHOJO PAPERS consent confirmed", text };
}

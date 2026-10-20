/* Creates the private Supabase Storage buckets the app uses. Safe to run more than once. */
import { config } from "dotenv";
import { createClient } from "@supabase/supabase-js";

config({ path: ".env.local" });
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) {
  console.error("Set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY in .env.local first.");
  process.exit(1);
}
const supabase = createClient(url, key, { auth: { persistSession: false } });
const buckets = [
  { id: "answer-images", fileSizeLimit: 8 * 1024 * 1024, allowedMimeTypes: ["image/jpeg"] },
  { id: "source-documents", fileSizeLimit: 40 * 1024 * 1024, allowedMimeTypes: ["application/pdf"] },
];
for (const b of buckets) {
  const { error } = await supabase.storage.createBucket(b.id, { public: false, fileSizeLimit: b.fileSizeLimit, allowedMimeTypes: b.allowedMimeTypes });
  if (error && !/already exists/i.test(error.message)) {
    console.error(`Could not create ${b.id}: ${error.message}`);
    process.exit(1);
  }
  const { data } = await supabase.storage.getBucket(b.id);
  if (data?.public) {
    console.error(`Bucket ${b.id} is PUBLIC. Make it private in the Supabase dashboard; student uploads must not be public.`);
    process.exit(1);
  }
  console.log(`${b.id}: private bucket ready`);
}

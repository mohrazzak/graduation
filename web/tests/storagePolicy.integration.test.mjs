import assert from "node:assert/strict";
import { test } from "node:test";

import { createClient } from "@supabase/supabase-js";

const requiredEnvironment = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_TEST_OWNER_EMAIL",
  "SUPABASE_TEST_OWNER_PASSWORD",
  "SUPABASE_TEST_OTHER_EMAIL",
  "SUPABASE_TEST_OTHER_PASSWORD",
];
const missingEnvironment = requiredEnvironment.filter((name) => !process.env[name]);

test(
  "storage lets an owner replace an artifact but rejects a non-owner replacement",
  {
    skip:
      missingEnvironment.length > 0
        ? `missing required Supabase integration credentials: ${missingEnvironment.join(", ")}`
        : false,
  },
  async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const ownerEmail = process.env.SUPABASE_TEST_OWNER_EMAIL;
    const ownerPassword = process.env.SUPABASE_TEST_OWNER_PASSWORD;
    const otherEmail = process.env.SUPABASE_TEST_OTHER_EMAIL;
    const otherPassword = process.env.SUPABASE_TEST_OTHER_PASSWORD;
    if (!url || !anonKey || !ownerEmail || !ownerPassword || !otherEmail || !otherPassword) {
      throw new Error("integration test executed without its required credentials");
    }

    const owner = createClient(url, anonKey, { auth: { persistSession: false } });
    const other = createClient(url, anonKey, { auth: { persistSession: false } });
    const { data: ownerAuth, error: ownerAuthError } = await owner.auth.signInWithPassword({
      email: ownerEmail,
      password: ownerPassword,
    });
    assert.ifError(ownerAuthError);
    assert.ok(ownerAuth.user, "owner login must return a user");

    const path = `${ownerAuth.user.id}/storage-policy-${crypto.randomUUID()}.png`;
    try {
      const { error: firstUploadError } = await owner.storage
        .from("analysis-images")
        .upload(path, new Blob(["first artifact"], { type: "image/png" }), {
          contentType: "image/png",
        });
      assert.ifError(firstUploadError);

      const { error: replacementError } = await owner.storage
        .from("analysis-images")
        .upload(path, new Blob(["second artifact"], { type: "image/png" }), {
          contentType: "image/png",
          upsert: true,
        });
      assert.ifError(replacementError);

      const { data: downloaded, error: downloadError } = await owner.storage
        .from("analysis-images")
        .download(path);
      assert.ifError(downloadError);
      assert.ok(downloaded, "owner replacement must leave an object to download");
      assert.equal(await downloaded.text(), "second artifact");

      const { error: otherAuthError } = await other.auth.signInWithPassword({
        email: otherEmail,
        password: otherPassword,
      });
      assert.ifError(otherAuthError);

      const { error: nonOwnerReplacementError } = await other.storage
        .from("analysis-images")
        .upload(path, new Blob(["non-owner replacement"], { type: "image/png" }), {
          contentType: "image/png",
          upsert: true,
        });
      assert.ok(nonOwnerReplacementError, "non-owner replacement must return a Storage error");
    } finally {
      const { error: cleanupError } = await owner.storage.from("analysis-images").remove([path]);
      assert.ifError(cleanupError);
    }
  },
);

import assert from "node:assert/strict";
import { test } from "node:test";

import { isSupabaseConfigured } from "../lib/supabase/config.mts";

const KEY = "test-anon-key";

const withEnv = (url, key, run) => {
  const previousUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const previousKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  else process.env.NEXT_PUBLIC_SUPABASE_URL = url;
  if (key === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = key;
  try {
    run();
  } finally {
    if (previousUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = previousUrl;
    if (previousKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = previousKey;
  }
};

test("a remote https project counts as configured", () => {
  withEnv("https://abc.supabase.co", KEY, () => {
    assert.equal(isSupabaseConfigured(), true);
  });
});

test("a loopback http stack counts as configured", () => {
  for (const url of [
    "http://127.0.0.1:54321",
    "http://localhost:54321",
    "http://[::1]:54321",
  ]) {
    withEnv(url, KEY, () => {
      assert.equal(isSupabaseConfigured(), true, `${url} must be accepted`);
    });
  }
});

test("plaintext http to a REMOTE host stays rejected", () => {
  for (const url of [
    "http://abc.supabase.co",
    "http://example.com",
    "http://192.168.1.10:54321",
    "http://localhost.evil.com",
  ]) {
    withEnv(url, KEY, () => {
      assert.equal(isSupabaseConfigured(), false, `${url} must be rejected`);
    });
  }
});

test("placeholder or missing values are not configured", () => {
  withEnv("https://placeholder.supabase.co", KEY, () => {
    assert.equal(isSupabaseConfigured(), false);
  });
  withEnv("https://abc.supabase.co", "placeholder-anon-key", () => {
    assert.equal(isSupabaseConfigured(), false);
  });
  withEnv(undefined, KEY, () => {
    assert.equal(isSupabaseConfigured(), false);
  });
  withEnv("https://abc.supabase.co", undefined, () => {
    assert.equal(isSupabaseConfigured(), false);
  });
  withEnv("not a url", KEY, () => {
    assert.equal(isSupabaseConfigured(), false);
  });
});

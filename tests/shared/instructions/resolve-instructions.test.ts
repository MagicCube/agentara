import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, test } from "bun:test";

import { resolveImports, resolveInstructionFile } from "@/shared";

const TEST_DIR = join(import.meta.dir, "__fixtures__");

beforeAll(() => {
  mkdirSync(join(TEST_DIR, "memory"), { recursive: true });

  writeFileSync(
    join(TEST_DIR, "memory", "USER.md"),
    "I am the user memory.",
    "utf-8",
  );
  writeFileSync(
    join(TEST_DIR, "memory", "SOUL.md"),
    "I am the soul memory.",
    "utf-8",
  );
  writeFileSync(
    join(TEST_DIR, "CLAUDE.md"),
    `First read SOUL.md:

@memory/SOUL.md

Then read USER.md:

@memory/USER.md

# Instructions

Do something useful.
`,
    "utf-8",
  );
});

afterAll(() => {
  if (existsSync(TEST_DIR)) {
    rmSync(TEST_DIR, { recursive: true, force: true });
  }
});

describe("resolveImports", () => {
  test("replaces @path/file with file content", () => {
    const input = "Hello\n\n@memory/USER.md\n\nGoodbye";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toBe("Hello\n\nI am the user memory.\n\nGoodbye");
  });

  test("replaces multiple imports", () => {
    const input = "@memory/SOUL.md\n\n@memory/USER.md";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toBe("I am the soul memory.\n\nI am the user memory.");
  });

  test("leaves non-import lines untouched", () => {
    const input = "No imports here.\nJust plain text.";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toBe("No imports here.\nJust plain text.");
  });

  test("replaces missing file with comment", () => {
    const input = "@memory/MISSING.md";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toBe("<!-- file not found: memory/MISSING.md -->");
  });

  test("does not treat @ in middle of line as import", () => {
    const input = "Email me at user@example.com";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toBe("Email me at user@example.com");
  });

  test("handles leading whitespace in import line", () => {
    const input = "  @memory/USER.md  ";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toBe("I am the user memory.");
  });

  test("rejects path traversal imports", () => {
    const input = "@../../../etc/passwd";
    const result = resolveImports(input, TEST_DIR);
    expect(result).toContain("<!-- import rejected (outside base dir)");
  });
});

describe("resolveInstructionFile", () => {
  test("reads and resolves a full CLAUDE.md", () => {
    const result = resolveInstructionFile(
      join(TEST_DIR, "CLAUDE.md"),
      TEST_DIR,
    );
    expect(result).toContain("I am the soul memory.");
    expect(result).toContain("I am the user memory.");
    expect(result).toContain("# Instructions");
    expect(result).toContain("Do something useful.");
    expect(result).not.toContain("@memory/");
  });

  test("returns empty string for non-existent file", () => {
    const result = resolveInstructionFile(
      join(TEST_DIR, "NONEXISTENT.md"),
      TEST_DIR,
    );
    expect(result).toBe("");
  });
});

import { describe, it, expect } from "vitest";
import { isEmailAllowed, getAllowedEmails } from "@/lib/auth/whitelist";

/**
 * Integration tests for the auth email whitelist.
 *
 * These test the REAL whitelist logic using ALLOWED_EMAILS from .env.test.
 * .env.test sets: ALLOWED_EMAILS=benezrikoren@gmail.com,test@example.com
 *
 * No mocks — isEmailAllowed reads from process.env directly.
 */

describe("Email Whitelist", () => {
  it("parses ALLOWED_EMAILS from env correctly", () => {
    const emails = getAllowedEmails();
    expect(emails).toContain("benezrikoren@gmail.com");
    expect(emails).toContain("test@example.com");
    expect(emails.length).toBe(2);
  });

  it("allows whitelisted email (exact match)", () => {
    expect(isEmailAllowed("benezrikoren@gmail.com")).toBe(true);
  });

  it("allows second whitelisted email", () => {
    expect(isEmailAllowed("test@example.com")).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isEmailAllowed("BenEzriKoren@gmail.com")).toBe(true);
    expect(isEmailAllowed("TEST@EXAMPLE.COM")).toBe(true);
  });

  it("rejects non-whitelisted email", () => {
    expect(isEmailAllowed("hacker@evil.com")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isEmailAllowed("")).toBe(false);
  });

  it("rejects partial match", () => {
    expect(isEmailAllowed("benezrikoren@gmail.co")).toBe(false);
    expect(isEmailAllowed("xbenezrikoren@gmail.com")).toBe(false);
  });
});

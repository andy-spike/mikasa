/**
 * The startup auth check (bug 15): the error names each missing
 * variable, names nothing that is present, and never prints a value.
 */
import { describe, expect, it } from "vitest";

const { assertAuthConfig } = await import("@/lib/auth");

const SECRET_LIKE = "super-secret-value-123";

describe("assertAuthConfig", () => {
  it("names every missing variable when the environment is empty", () => {
    try {
      assertAuthConfig({}, {});
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      for (const name of [
        "BETTER_AUTH_URL",
        "BETTER_AUTH_SECRET",
        "GOOGLE_CLIENT_ID",
        "GOOGLE_CLIENT_SECRET",
      ]) {
        expect(message).toContain(name);
      }
    }
  });

  it("names only what is missing, and never a value", () => {
    const env = {
      BETTER_AUTH_URL: "https://courses.example.com",
      BETTER_AUTH_SECRET: SECRET_LIKE,
      GOOGLE_CLIENT_SECRET: SECRET_LIKE,
    };
    try {
      assertAuthConfig({}, env);
      expect.unreachable("should have thrown");
    } catch (error) {
      const message = (error as Error).message;
      expect(message).toContain("GOOGLE_CLIENT_ID");
      expect(message).not.toContain("BETTER_AUTH_URL");
      expect(message).not.toContain("BETTER_AUTH_SECRET");
      expect(message).not.toContain("GOOGLE_CLIENT_SECRET");
      /* Neither the env values nor anything secret-like appears. */
      expect(message).not.toContain("courses.example.com");
      expect(message).not.toContain(SECRET_LIKE);
    }
  });

  it("treats an override as satisfied, and google:false as needing no provider", () => {
    expect(() =>
      assertAuthConfig({ baseURL: "https://x.example.com", secret: "s", google: false }, {}),
    ).not.toThrow();
    expect(() => assertAuthConfig({ google: { clientId: "id", clientSecret: "sec" } }, {})).toThrow(
      /BETTER_AUTH_URL/,
    );
  });

  it("passes when everything is present", () => {
    expect(() =>
      assertAuthConfig(
        {},
        {
          BETTER_AUTH_URL: "https://courses.example.com",
          BETTER_AUTH_SECRET: "s",
          GOOGLE_CLIENT_ID: "id",
          GOOGLE_CLIENT_SECRET: "sec",
        },
      ),
    ).not.toThrow();
  });
});

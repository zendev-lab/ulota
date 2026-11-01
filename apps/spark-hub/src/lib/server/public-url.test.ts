import { describe, expect, it } from "vitest";
import { applyHubPublicUrl, configureHubPublicUrl, normalizePublicUrl } from "./public-url.js";

describe("Hub public URL configuration", () => {
  it("uses a local origin by default", () => {
    const env: Record<string, string | undefined> = {};

    expect(configureHubPublicUrl(env, { host: "0.0.0.0", port: 5173 })).toEqual({
      mode: "local",
      publicUrl: "http://127.0.0.1:5173",
      trustedProxy: false,
    });
    expect(env.ORIGIN).toBe("http://127.0.0.1:5173");
  });

  it("normalizes an explicit public domain and preserves ORIGIN compatibility", () => {
    const env: Record<string, string | undefined> = {
      SPARK_HUB_PUBLIC_URL: "https://spark.example.test/",
      SPARK_HUB_TRUST_PROXY: "loopback",
      ORIGIN: "https://spark.example.test",
    };

    expect(configureHubPublicUrl(env, { host: "127.0.0.1", port: 5173 })).toEqual({
      mode: "fixed",
      publicUrl: "https://spark.example.test",
      trustedProxy: true,
    });
    expect(env.ORIGIN).toBe("https://spark.example.test");
    expect(env.ADDRESS_HEADER).toBe("x-forwarded-for");
  });

  it("configures a loopback proxy for automatic public URL discovery", () => {
    const env: Record<string, string | undefined> = {
      SPARK_HUB_PUBLIC_URL: "auto",
      SPARK_HUB_TRUST_PROXY: "loopback",
      SPARK_HUB_PROXY_HOPS: "2",
    };

    expect(configureHubPublicUrl(env, { host: "127.0.0.1", port: 5173 })).toEqual({
      mode: "proxy",
      publicUrl: null,
      trustedProxy: true,
    });
    expect(env.ORIGIN).toBeUndefined();
    expect(env.ADDRESS_HEADER).toBe("x-forwarded-for");
    expect(env.PROTOCOL_HEADER).toBe("x-forwarded-proto");
    expect(env.HOST_HEADER).toBe("x-forwarded-host");
    expect(env.XFF_DEPTH).toBe("2");
  });

  it.each([
    [{}, "http", "127.0.0.1:5173"],
    [
      {
        SPARK_HUB_PUBLIC_URL: "https://spark.example.test:8443",
        SPARK_HUB_TRUST_PROXY: "loopback",
      },
      "https",
      "spark.example.test:8443",
    ],
  ])("supplies the configured origin through adapter headers", (configured, protocol, host) => {
    const env: Record<string, string | undefined> = {
      ...configured,
      PORT_HEADER: "x-untrusted-port",
    };
    const config = configureHubPublicUrl(env, { host: "127.0.0.1", port: 5173 });
    const request = {
      headers: {
        host: "untrusted.example",
        "x-forwarded-proto": "ftp",
        "x-forwarded-host": "untrusted.example",
        "x-spark-hub-protocol": "ftp",
        "x-spark-hub-host": "untrusted.example",
      } as Record<string, string | undefined>,
    };

    applyHubPublicUrl(request, config);

    expect(request.headers[env.PROTOCOL_HEADER!]).toBe(protocol);
    expect(request.headers[env.HOST_HEADER!]).toBe(host);
    expect(env.PORT_HEADER).toBeUndefined();
  });

  it("requires an explicit trusted loopback proxy for remote domains", () => {
    expect(() =>
      configureHubPublicUrl(
        { SPARK_HUB_PUBLIC_URL: "https://spark.example.test" },
        { host: "127.0.0.1", port: 5173 },
      ),
    ).toThrow(/SPARK_HUB_TRUST_PROXY=loopback/);
    expect(() =>
      configureHubPublicUrl(
        {
          SPARK_HUB_PUBLIC_URL: "auto",
          SPARK_HUB_TRUST_PROXY: "loopback",
        },
        { host: "0.0.0.0", port: 5173 },
      ),
    ).toThrow(/requires HOST to be localhost/);
    expect(() =>
      configureHubPublicUrl(
        { SPARK_HUB_PUBLIC_URL: "https://spark.example.test" },
        { host: "0.0.0.0", port: 5173 },
      ),
    ).toThrow(/explicit proxy boundary/);
    expect(() =>
      configureHubPublicUrl(
        { SPARK_HUB_PUBLIC_URL: "http://spark.lan:5173" },
        { host: "0.0.0.0", port: 5173 },
      ),
    ).toThrow(/explicit proxy boundary/);
  });

  it("rejects invalid proxy hop counts", () => {
    for (const hops of ["0", "11", "1.5", "many"]) {
      expect(() =>
        configureHubPublicUrl(
          {
            SPARK_HUB_PUBLIC_URL: "auto",
            SPARK_HUB_TRUST_PROXY: "loopback",
            SPARK_HUB_PROXY_HOPS: hops,
          },
          { host: "127.0.0.1", port: 5173 },
        ),
      ).toThrow(/integer between 1 and 10/);
    }
  });

  it("rejects ambiguous or unsafe public URL values", () => {
    for (const value of [
      "ftp://spark.example.test",
      "https://user:secret@spark.example.test",
      "https://spark.example.test/hub",
      "https://spark.example.test/?token=secret",
      "https://spark.example.test/#fragment",
    ]) {
      expect(() => normalizePublicUrl(value)).toThrow();
    }

    expect(() =>
      configureHubPublicUrl(
        {
          SPARK_HUB_PUBLIC_URL: "https://spark.example.test",
          ORIGIN: "https://other.example.test",
        },
        { host: "0.0.0.0", port: 5173 },
      ),
    ).toThrow(/conflicts with ORIGIN/);
  });
});

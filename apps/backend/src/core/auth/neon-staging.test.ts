import { describe, expect, test } from "bun:test";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { verifyNeonStagingJwt } from "./neon-staging.ts";

const issuer = "https://ep-purple-scene-a1py5uzt.neonauth.ap-southeast-1.aws.neon.tech";
const baseUrl = issuer + "/neondb/auth";
const id = "c025ea58-824f-43b4-9fde-9b82aa8127ef";

describe("Neon staging JWT verification", () => {
  test("accepts only a valid 15-minute EdDSA staging issuer/audience token", async () => {
    const { privateKey, publicKey } = await generateKeyPair("EdDSA");
    const jwk = await exportJWK(publicKey);
    const getKey = createLocalJWKSet({ keys: [{ ...jwk, kid: "stage-key", alg: "EdDSA" }] });
    async function token(
      opts: { issuer?: string; audience?: string; email?: string; banned?: boolean; subject?: string; issuedAt?: number } = {},
    ) {
      return new SignJWT({ email: opts.email ?? "test-student@example.test", role: "admin", banned: opts.banned })
        .setProtectedHeader({ alg: "EdDSA", kid: "stage-key" })
        .setSubject(opts.subject ?? id)
        .setIssuer(opts.issuer ?? issuer)
        .setAudience(opts.audience ?? issuer)
        .setIssuedAt(opts.issuedAt ?? Math.floor(Date.now() / 1000))
        .setExpirationTime("15m")
        .sign(privateKey);
    }
    expect(await verifyNeonStagingJwt(await token(), baseUrl, getKey)).toEqual({
      authId: id, email: "test-student@example.test",
    });
    await expect(verifyNeonStagingJwt(await token({ issuer: "https://attacker.invalid" }), baseUrl, getKey)).rejects.toThrow();
    await expect(verifyNeonStagingJwt(await token({ audience: "https://attacker.invalid" }), baseUrl, getKey)).rejects.toThrow();
    await expect(verifyNeonStagingJwt(await token({ banned: true }), baseUrl, getKey)).rejects.toThrow();
    await expect(verifyNeonStagingJwt(await token({ subject: "evil" }), baseUrl, getKey)).rejects.toThrow();
    await expect(verifyNeonStagingJwt(await token({ issuedAt: Math.floor(Date.now() / 1000) - 3600 }), baseUrl, getKey)).rejects.toThrow();
    const { privateKey: attackerKey, publicKey: attackerPublicKey } = await generateKeyPair("EdDSA");
    const attackerJwk = await exportJWK(attackerPublicKey);
    const attackerToken = await new SignJWT({ email: "test-student@example.test" })
      .setProtectedHeader({ alg: "EdDSA", kid: "attacker" })
      .setSubject(id).setIssuer(issuer).setAudience(issuer)
      .setIssuedAt().setExpirationTime("15m").sign(attackerKey);
    await expect(verifyNeonStagingJwt(attackerToken, baseUrl, createLocalJWKSet({
      keys: [{ ...jwk, kid: "stage-key", alg: "EdDSA" }, { ...attackerJwk, kid: "unused", alg: "EdDSA" }],
    }))).rejects.toThrow();
  });
});

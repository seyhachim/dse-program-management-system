import { expect, test } from "bun:test";
import express from "express";
import type { PublicRubric } from "@dse-pms/shared-types";
import { createRubricRouter } from "./router.ts";
import { rubricService } from "./service.ts";

const published: PublicRubric = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Final Project Rubric",
  type: "Project",
  description: "Published project assessment rubric",
  levels: [
    { label: "Excellent", points: 4 },
    { label: "Good", points: 3 },
  ],
  criteria: [
    {
      id: "criterion-1",
      name: "Technical quality",
      descriptors: ["Strong implementation", "Mostly correct implementation"],
    },
  ],
  status: "Active",
};

test("public rubric endpoint is anonymous while management routes remain protected", async () => {
  const originalGetPublicById = rubricService.getPublicById;
  rubricService.getPublicById = async (id: string) => (id === published.id ? published : null);

  const app = express();
  app.use(express.json());
  app.use("/api/rubrics", createRubricRouter());

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));

  try {
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not resolve test server address");
    const base = `http://127.0.0.1:${address.port}`;

    const publicResponse = await fetch(`${base}/api/rubrics/public/${published.id}`);
    expect(publicResponse.status).toBe(200);
    expect(await publicResponse.json()).toEqual(published);

    const missingResponse = await fetch(`${base}/api/rubrics/public/22222222-2222-4222-8222-222222222222`);
    expect(missingResponse.status).toBe(404);

    const protectedResponse = await fetch(`${base}/api/rubrics/${published.id}`);
    expect(protectedResponse.status).toBe(401);
  } finally {
    rubricService.getPublicById = originalGetPublicById;
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  }
});

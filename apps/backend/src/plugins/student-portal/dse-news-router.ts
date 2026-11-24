import { Router, raw } from "express";
import { NewsMediaError } from "./dse-news-media-storage.ts";
import { dseNewsMediaService } from "./dse-news-media-service.ts";
import { CreateDseNewsSchema, EditDseNewsSchema, ChangeDseNewsStatusSchema, DseNewsPublicApprovalSchema } from "@dse-pms/shared-types";
import { requireAuth } from "../../core/auth/middleware.ts";
import { requirePermission } from "../../core/permissions/index.ts";
import { dseNewsService, NewsAccessError, NewsConflictError, NewsNotFoundError } from "./dse-news-service.ts";

function fail(error: unknown, res: import("express").Response) {
  if (error instanceof NewsMediaError) return void res.status(error.status).json({ error: error.message });
  if (error instanceof NewsNotFoundError) return void res.status(404).json({ error: error.message });
  if (error instanceof NewsAccessError) return void res.status(403).json({ error: error.message });
  if (error instanceof NewsConflictError) return void res.status(409).json({ error: error.message });
  console.error("DSE News request failed", error);
  res.status(500).json({ error: "Could not complete DSE News request" });
}
export function createDseNewsRouter() {
  const router = Router();
  router.use(requireAuth);
  router.get("/manage", requirePermission("offerings:read"), async (req, res) => {
    try { res.json(await dseNewsService.staffList(req.user!)); } catch (error) { fail(error, res); }
  });
  router.post("/manage", requirePermission("offerings:write"), async (req, res) => {
    const parsed = CreateDseNewsSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid article", details: parsed.error.flatten() });
    try { res.status(201).json(await dseNewsService.create(req.user!, parsed.data)); } catch (error) { fail(error, res); }
  });
  router.get("/manage/:id", requirePermission("offerings:read"), async (req, res) => {
    try { res.json(await dseNewsService.staffGet(req.user!, req.params.id!)); } catch (error) { fail(error, res); }
  });
  router.patch("/manage/:id", requirePermission("offerings:write"), async (req, res) => {
    const parsed = EditDseNewsSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid article update", details: parsed.error.flatten() });
    try { res.json(await dseNewsService.edit(req.user!, req.params.id!, parsed.data)); } catch (error) { fail(error, res); }
  });
  router.post("/manage/:id/status", requirePermission("offerings:write"), async (req, res) => {
    const parsed = ChangeDseNewsStatusSchema.safeParse(req.body);
    if (!parsed.success) return void res.status(400).json({ error: "Invalid publication action", details: parsed.error.flatten() });
    try { res.json(await dseNewsService.changeStatus(req.user!, req.params.id!, parsed.data)); } catch (error) { fail(error, res); }
  });
  router.post("/manage/:id/public", requirePermission("offerings:write"), async(req,res)=>{
    const parsed=DseNewsPublicApprovalSchema.safeParse(req.body);
    if(!parsed.success)return void res.status(400).json({error:"Invalid public approval"});
    try {res.json(await dseNewsService.approvePublic(req.user!,req.params.id!,parsed.data));}
    catch(error){fail(error,res);}
  });
  // Uploads are staff-only raw WebP packages, never base64 JSON or public Storage URLs.
  router.post("/manage/:id/media", requirePermission("offerings:write"),
    raw({type:"application/octet-stream",limit:"4mb"}), async (req,res) => {
      if (!(req.body instanceof Uint8Array)) {
        return void res.status(400).json({error:"A compressed WebP photo is required"});
      }
      try {
        res.status(201).json(await dseNewsMediaService.upload(
          req.user!,req.params.id!,req.body,req.query.kind,req.query.alt,
        ));
      }catch(error){fail(error,res);}
    });
  router.delete("/manage/:id/media/:mediaId",requirePermission("offerings:write"),async(req,res)=>{
    try{res.json(await dseNewsMediaService.remove(req.user!,req.params.id!,req.params.mediaId!));}
    catch(error){fail(error,res);}
  });

  // Student endpoints return published copy only, never draft or participant data.
  router.get("/", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await dseNewsService.studentList(req.user!.id)); } catch (error) { fail(error, res); }
  });
  router.get("/:id", requirePermission("student-portal:read"), async (req, res) => {
    try { res.json(await dseNewsService.studentGet(req.user!.id, req.params.id!)); } catch (error) { fail(error, res); }
  });
  return router;
}

import { Router } from "express";
import { publicDseNewsService } from "./public-dse-news-service.ts";
import { getPublicAbuseProtectionConfig, publicAbuseRateLimiter } from "../../core/security/public-abuse-protection.ts";

export function createPublicDseNewsRouter(){
  const router=Router();
  const config=getPublicAbuseProtectionConfig();
  router.use((_req,res,next)=>{
    // Limit anonymous requests before database or private media signing.
    const gate=publicAbuseRateLimiter.check("public-dse-news",config.publicSearchMax,config.publicSearchWindowMs);
    if(!gate.allowed){res.setHeader("Retry-After",String(gate.retryAfterSeconds));return void res.status(429).json({error:"Too many requests"});}
    res.setHeader("Cache-Control","public, max-age=0, must-revalidate");
    next();
  });
  router.get("/",async(_req,res)=>{
    try{res.json(await publicDseNewsService.list());}
    catch(err){console.error("Public DSE news list failed",err);res.status(500).json({error:"News unavailable"});}
  });
  router.get("/:id",async(req,res)=>{
    try{
      const id=req.params.id;
      if(!id||!/^[0-9a-f-]{36}$/i.test(id))return void res.status(404).json({error:"Article not found"});
      const result=await publicDseNewsService.get(id);
      if(!result)return void res.status(404).json({error:"Article not found"});
      res.json(result);
    }catch(err){console.error("Public DSE news article failed",err);res.status(500).json({error:"News unavailable"});}
  });
  return router;
}

import { Router, type NextFunction, type Request, type Response } from "express";
import { LinkAnnualEvidenceInput, ReviewAnnualTeachingInput, SubmitAnnualActivityInput } from "@dse-pms/shared-types";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { hasGlobalRole, hasRoleInProgramme } from "../../core/auth/token.ts";
import { lecturerAnnualService, AnnualNotFoundError, AnnualValidationError } from "./annual-service.ts";
import { annualReportCsv, annualReportExcelXml } from "./annual-export.ts";

function canCoordinate(req:Request):boolean {
  const user=req.user!;
  return hasGlobalRole(user,"admin") ||
    hasRoleInProgramme(user,"program_coordinator",DEFAULT_PROGRAMME_ID);
}
function requireCoordinator(req:Request,res:Response,next:NextFunction):void {
  if(canCoordinate(req)){next();return;}
  res.status(403).json({error:"DSE Programme Coordinator or Admin required"});
}
function requireAnnualSelf(req:Request,res:Response,next:NextFunction):void {
  if(hasRoleInProgramme(req.user!,"lecturer",DEFAULT_PROGRAMME_ID)){next();return;}
  res.status(403).json({error:"DSE Lecturer role required"});
}
function replyError(res:Response,error:unknown):void {
  const status=error instanceof AnnualNotFoundError?404:
    error instanceof AnnualValidationError?400:500;
  res.status(status).json({error:status===500?"Annual reporting request failed":
    error instanceof Error?error.message:"Annual reporting error"});
}

// Mounted at /api/lecturers/annual under the parent's requireAuth.
export function createLecturerAnnualRouter():Router {
  const router=Router();
  router.get("/years",(req,res,next)=>{
    if(canCoordinate(req)||hasRoleInProgramme(req.user!,"lecturer",DEFAULT_PROGRAMME_ID)){
      next();return;
    }
    res.status(403).json({error:"DSE academic staff access required"});
  },async(_req,res)=>{
    try{res.json(await lecturerAnnualService.years());}
    catch(error){replyError(res,error);}
  });

  router.get("/:yearId/me",requireAnnualSelf,async(req,res)=>{
    try {
      const summary=await lecturerAnnualService.summary(req.params.yearId!);
      res.json({academicYear:summary.academicYear,
        staff:summary.staff.find(s=>s.lecturerId===req.user!.id)??null});
    } catch(error){replyError(res,error);}
  });
  router.post("/:yearId/me/evidence",requireAnnualSelf,async(req,res)=>{
    const parsed=LinkAnnualEvidenceInput.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:"Invalid evidence",details:parsed.error.flatten()});return;}
    try{
      await lecturerAnnualService.linkOwnEvidence(req.params.yearId!,req.user!.id,parsed.data.itemId);
      res.status(204).end();
    }catch(error){replyError(res,error);}
  });
  router.post("/:yearId/me/submit",requireAnnualSelf,async(req,res)=>{
    const parsed=SubmitAnnualActivityInput.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:"Invalid submission",details:parsed.error.flatten()});return;}
    try{
      await lecturerAnnualService.submitOwn(req.params.yearId!,req.user!.id,parsed.data.note);
      res.status(204).end();
    }catch(error){replyError(res,error);}
  });
  router.get("/:yearId/summary",requireCoordinator,async(req,res)=>{
    try{res.json(await lecturerAnnualService.summary(req.params.yearId!));}
    catch(error){replyError(res,error);}
  });
  router.post("/:yearId/review-teaching",requireCoordinator,async(req,res)=>{
    const parsed=ReviewAnnualTeachingInput.safeParse(req.body);
    if(!parsed.success){res.status(400).json({error:"Invalid review",details:parsed.error.flatten()});return;}
    try{
      await lecturerAnnualService.reviewTeaching(req.params.yearId!,req.user!.id,parsed.data);
      res.status(204).end();
    }catch(error){replyError(res,error);}
  });
  router.post("/:yearId/release",requireCoordinator,async(req,res)=>{
    try{res.status(201).json(await lecturerAnnualService.release(req.params.yearId!,req.user!.id));}
    catch(error){replyError(res,error);}
  });
  router.get("/:yearId/export",requireCoordinator,async(req,res)=>{
    try{
      const release=await lecturerAnnualService.latestRelease(req.params.yearId!);
      res.json({academicYear:release.academicYear.label,version:release.releaseVersion,
        csv:annualReportCsv(release),excelXml:annualReportExcelXml(release)});
    }catch(error){replyError(res,error);}
  });
  return router;
}

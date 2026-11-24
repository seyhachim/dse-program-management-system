import { Prisma, type DseNewsArticle } from "@prisma/client";
import { signedNewsMediaUrl } from "./dse-news-media-storage.ts";
import { z } from "zod";
import {
  CreateDseNewsSchema, NewsMediaSchema, canPublishDseNews,
  type CreateDseNewsInput, type EditDseNewsInput, type ChangeDseNewsStatusInput,
  type DseNewsView, type DseNewsPublicApprovalInput,
} from "@dse-pms/shared-types";
import { prisma } from "../../core/db/prisma.ts";
import { DEFAULT_PROGRAMME_ID } from "../../core/programme.ts";
import { hasAnyRoleInProgramme, type AuthUser, type Role } from "../../core/auth/token.ts";

export class NewsNotFoundError extends Error {}
export class NewsAccessError extends Error {}
export class NewsConflictError extends Error {}

const PUBLISHERS: Role[] = ["admin", "program_coordinator", "program_secretary"];
export function mayPublishNews(user: AuthUser): boolean {
  return hasAnyRoleInProgramme(user, PUBLISHERS, DEFAULT_PROGRAMME_ID);
}
async function staffCanDraft(user: AuthUser, activityId: string | null): Promise<boolean> {
  if (mayPublishNews(user)) return true;
  if (!activityId || !hasAnyRoleInProgramme(user, ["lecturer"], DEFAULT_PROGRAMME_ID)) return false;
  const activity = await prisma.offeringActivity.findUnique({
    where: { id: activityId },
    select: {
      offering: {
        select: {
          lecturerId: true, course: { select: { programmeId: true } },
          coLecturers: { select: { lecturerId: true } },
        },
      },
    },
  });
  return Boolean(activity?.offering.course.programmeId === DEFAULT_PROGRAMME_ID &&
    (activity.offering.lecturerId === user.id || activity.offering.coLecturers.some(l => l.lecturerId === user.id)));
}
async function ensureActivityInProgramme(activityId: string | null) {
  if (!activityId) return;
  const activity = await prisma.offeringActivity.findUnique({
    where: { id: activityId }, select: { offering: { select: { course: { select: { programmeId: true } } } } },
  });
  if (activity?.offering.course.programmeId !== DEFAULT_PROGRAMME_ID) {
    throw new NewsAccessError("Linked activity must belong to the DSE programme");
  }
}
async function ensureStudentInProgramme(userId: string): Promise<void> {
  const student = await prisma.student.findUnique({
    where: { userId }, select: { id: true, status: true, email: true },
  });
  if (!student || student.status !== "Active" || !student.email) {
    throw new NewsAccessError("An active DSE student account is required");
  }
  const [cohort, enrollment] = await Promise.all([
    prisma.studentCohortMembership.findFirst({
      where: { studentId: student.id, exitedAt: null, cohort: { programmeId: DEFAULT_PROGRAMME_ID } },
      select: { id: true },
    }),
    prisma.enrollment.findFirst({
      where: { studentId: student.id, offering: { course: { programmeId: DEFAULT_PROGRAMME_ID } } },
      select: { id: true },
    }),
  ]);
  if (!cohort && !enrollment) throw new NewsAccessError("No DSE programme membership");
}
type WithAuthor = DseNewsArticle & { author: { name: string } };
async function view(row: WithAuthor): Promise<DseNewsView> {
  const rows=await prisma.dseNewsMedia.findMany({where:{articleId:row.id},orderBy:[{createdAt:"asc"},{id:"asc"}]});
  const uploadedMedia=await Promise.all(rows.map(async media=>({
    id:media.id,kind:media.kind as "cover"|"gallery",alt:media.alt,
    width:media.width,height:media.height,bytes:media.bytes,
    url:await signedNewsMediaUrl(media.storagePath),
    thumbnailUrl:await signedNewsMediaUrl(media.thumbnailPath),
  })));
  return {
    id: row.id, programmeId: row.programmeId, activityId: row.activityId,
    title: row.title, summary: row.summary, body: row.body,
    coverImageUrl: row.coverImageUrl, coverAlt: row.coverAlt,
    gallery: NewsMediaSchema.array().parse(row.gallery), uploadedMedia,
    tags: z.array(z.string()).parse(row.tags), mediaApproved: row.mediaApproved,
    status: row.status as DseNewsView["status"], version: row.version,
    authorName: row.author.name,
    publishedAt: row.publishedAt?.toISOString() ?? null,
    publicPublishedAt: row.publicPublishedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(), updatedAt: row.updatedAt.toISOString(),
  };
}
function snapshot(row: DseNewsArticle): Prisma.InputJsonValue {
  return {
    id: row.id, title: row.title, summary: row.summary, body: row.body,
    activityId: row.activityId, coverImageUrl: row.coverImageUrl,
    gallery: row.gallery, tags: row.tags, mediaApproved: row.mediaApproved,
    status: row.status, publicPublishedAt: row.publicPublishedAt, version: row.version,
  } as Prisma.InputJsonValue;
}
async function editable(user: AuthUser, id: string) {
  const article = await prisma.dseNewsArticle.findUnique({ where: { id } });
  if (!article || article.programmeId !== DEFAULT_PROGRAMME_ID) throw new NewsNotFoundError("DSE article not found");
  if (!mayPublishNews(user) && (article.authorId !== user.id || !await staffCanDraft(user, article.activityId))) {
    throw new NewsAccessError("Only the author or programme managers may edit this article");
  }
  if (article.status === "Archived") throw new NewsConflictError("Archived articles are read-only");
  if (article.status === "Published" && !mayPublishNews(user)) {
    throw new NewsAccessError("Published articles can only be changed by a programme manager");
  }
  return article;
}
export const dseNewsService = {
  async studentList(userId: string) {
    await ensureStudentInProgramme(userId);
    return Promise.all((await prisma.dseNewsArticle.findMany({
      where: { programmeId: DEFAULT_PROGRAMME_ID, status: "Published" },
      include: { author: { select: { name: true } } },
      orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 100,
    })).map(view));
  },
  async studentGet(userId: string, id: string) {
    await ensureStudentInProgramme(userId);
    const article = await prisma.dseNewsArticle.findFirst({
      where: { id, programmeId: DEFAULT_PROGRAMME_ID, status: "Published" },
      include: { author: { select: { name: true } } },
    });
    if (!article) throw new NewsNotFoundError("Published article not found");
    return view(article);
  },
  async assertMediaEditable(user: AuthUser, id: string) {
    const article=await editable(user,id);
    if (article.status!=="Draft") throw new NewsConflictError("Unpublish the article before changing photos");
    return article;
  },
  async staffList(user: AuthUser) {
    if (!mayPublishNews(user) && !hasAnyRoleInProgramme(user, ["lecturer"], DEFAULT_PROGRAMME_ID)) {
      throw new NewsAccessError("DSE teaching staff only");
    }
    return Promise.all((await prisma.dseNewsArticle.findMany({
      where: { programmeId: DEFAULT_PROGRAMME_ID, ...(mayPublishNews(user) ? {} : { authorId: user.id }) },
      include: { author: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 100,
    })).map(view));
  },
  async staffGet(user: AuthUser, id: string) {
    const article = await prisma.dseNewsArticle.findFirst({
      where: { id, programmeId: DEFAULT_PROGRAMME_ID,
        ...(mayPublishNews(user) ? {} : { authorId: user.id }) },
      include: { author: { select: { name: true } } },
    });
    if (!article || (!mayPublishNews(user) && !await staffCanDraft(user, article.activityId))) {
      throw new NewsNotFoundError("DSE article not found");
    }
    return view(article);
  },
  async create(user: AuthUser, input: CreateDseNewsInput) {
    await ensureActivityInProgramme(input.activityId);
    if (!await staffCanDraft(user, input.activityId)) throw new NewsAccessError("Not assigned to this activity or programme");
    const id = await prisma.$transaction(async tx => {
      const article = await tx.dseNewsArticle.create({
        data: {
          programmeId: DEFAULT_PROGRAMME_ID, activityId: input.activityId,
          authorId: user.id, updatedById: user.id,
          title: input.title, summary: input.summary, body: input.body,
          coverImageUrl: input.coverImageUrl, coverAlt: input.coverAlt,
          gallery: input.gallery as Prisma.InputJsonValue,
          tags: input.tags as Prisma.InputJsonValue,
          mediaApproved: input.mediaApproved, status: "Draft",
        },
      });
      await tx.dseNewsAuditEvent.create({
        data: { articleId: article.id, actorId: user.id, action: "created", after: snapshot(article) },
      });
      return article.id;
    });
    return this.staffGet(user, id);
  },
  async edit(user: AuthUser, id: string, input: EditDseNewsInput) {
    const before = await editable(user, id);
    if (before.version !== input.expectedVersion) throw new NewsConflictError("Article changed in another session; reload");
    const merged = CreateDseNewsSchema.safeParse({
      title: input.title ?? before.title, summary: input.summary ?? before.summary,
      body: input.body ?? before.body, activityId: input.activityId === undefined ? before.activityId : input.activityId,
      coverImageUrl: input.coverImageUrl === undefined ? before.coverImageUrl : input.coverImageUrl,
      coverAlt: input.coverAlt ?? before.coverAlt,
      gallery: input.gallery ?? before.gallery,
      tags: input.tags ?? before.tags,
      mediaApproved: input.mediaApproved ?? before.mediaApproved,
    });
    if (!merged.success) throw new NewsConflictError("Article fields invalid after edit");
    await ensureActivityInProgramme(merged.data.activityId);
    if (!await staffCanDraft(user, merged.data.activityId)) throw new NewsAccessError("Not assigned to linked activity");
    await prisma.$transaction(async tx => {
      const written = await tx.dseNewsArticle.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          title: merged.data.title, summary: merged.data.summary, body: merged.data.body,
          activityId: merged.data.activityId, coverImageUrl: merged.data.coverImageUrl,
          coverAlt: merged.data.coverAlt, gallery: merged.data.gallery as Prisma.InputJsonValue,
          tags: merged.data.tags as Prisma.InputJsonValue, mediaApproved: merged.data.mediaApproved,
          updatedById: user.id, publicPublishedAt: null, version: { increment: 1 },
        },
      });
      if (!written.count) throw new NewsConflictError("Article changed; reload");
      const after = await tx.dseNewsArticle.findUniqueOrThrow({ where: { id } });
      await tx.dseNewsAuditEvent.create({
        data: { articleId: id, actorId: user.id, action: "updated", before: snapshot(before), after: snapshot(after) },
      });
    });
    return this.staffGet(user, id);
  },
  async approvePublic(user: AuthUser, id: string, input: DseNewsPublicApprovalInput) {
    if (!mayPublishNews(user)) throw new NewsAccessError("Programme coordinator approval is required");
    const before=await editable(user,id);
    if (before.version!==input.expectedVersion) throw new NewsConflictError("Article changed; reload first");
    if (input.public && (before.status!=="Published" || !before.publishedAt)) {
      throw new NewsConflictError("Publish to DSE students before approving the public website");
    }
    const uploaded=await prisma.dseNewsMedia.count({where:{articleId:id}});
    const legacy=z.array(NewsMediaSchema).parse(before.gallery);
    const hasImages=uploaded>0 || Boolean(before.coverImageUrl) || legacy.length>0;
    if(input.public && (
      before.body.trim().length<80 ||
      (hasImages && (!before.mediaApproved || !input.confirmPhotoRights))
    )) throw new NewsConflictError("Public publication requires article and photo rights review");
    await prisma.$transaction(async tx=>{
      const result=await tx.dseNewsArticle.updateMany({
        where:{id,version:input.expectedVersion,status:before.status},
        data:{publicPublishedAt:input.public ? (before.publicPublishedAt??new Date()) : null,
          updatedById:user.id,version:{increment:1}},
      });
      if(result.count!==1) throw new NewsConflictError("Article changed; reload first");
      const after=await tx.dseNewsArticle.findUniqueOrThrow({where:{id}});
      await tx.dseNewsAuditEvent.create({data:{
        articleId:id,actorId:user.id,action:"updated",
        before:{publicPublishedAt:before.publicPublishedAt?.toISOString()??null},
        after:{publicPublishedAt:after.publicPublishedAt?.toISOString()??null},
      }});
    });
    return this.staffGet(user,id);
  },
  async changeStatus(user: AuthUser, id: string, input: ChangeDseNewsStatusInput) {
    if (!mayPublishNews(user)) throw new NewsAccessError("Programme coordinator approval is required");
    const before = await editable(user, id);
    if (before.version !== input.expectedVersion) throw new NewsConflictError("Article changed; reload");
    if (input.status === "Published" && !canPublishDseNews({
      body: before.body, coverImageUrl: before.coverImageUrl,
      gallery: z.array(NewsMediaSchema).parse(before.gallery),
      mediaApproved: before.mediaApproved,
    })) throw new NewsConflictError("Article body or photo consent review is incomplete");
    await prisma.$transaction(async tx => {
      const changed = await tx.dseNewsArticle.updateMany({
        where: { id, version: input.expectedVersion },
        data: {
          status: input.status, publicPublishedAt: null, updatedById: user.id, version: { increment: 1 },
          publishedAt: input.status === "Published" ? (before.publishedAt ?? new Date()) : null,
        },
      });
      if (!changed.count) throw new NewsConflictError("Article changed; reload");
      const after = await tx.dseNewsArticle.findUniqueOrThrow({ where: { id } });
      const action = input.status === "Published" ? "published" :
        input.status === "Archived" ? "archived" : "unpublished";
      await tx.dseNewsAuditEvent.create({
        data: { articleId: id, actorId: user.id, action, before: snapshot(before), after: snapshot(after) },
      });
    });
    return this.staffGet(user, id);
  },
};

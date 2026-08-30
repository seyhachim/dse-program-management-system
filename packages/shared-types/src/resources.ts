import { z } from "zod";

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export const ResourceTrackingMode = z.enum(["QUANTITY", "SERIALIZED"]);
export type ResourceTrackingMode = z.infer<typeof ResourceTrackingMode>;

export const ResourceResponsibilityType = z.enum([
  "RESOURCE_COORDINATOR",
  "LAB_CUSTODIAN",
]);
export type ResourceResponsibilityType = z.infer<
  typeof ResourceResponsibilityType
>;

export const ResourceResponsibilityAuditAction = z.enum([
  "Assigned",
  "Renewed",
  "Ended",
  "HandoverOut",
  "HandoverIn",
]);
export type ResourceResponsibilityAuditAction = z.infer<
  typeof ResourceResponsibilityAuditAction
>;

export const InventoryCapability = z.enum([
  "inventory:read",
  "inventory:write",
  "inventory:receive",
  "inventory:approve",
  "inventory:maintain",
]);
export type InventoryCapability = z.infer<typeof InventoryCapability>;

const optionalTrimmed = z.string().trim().default("");
const positiveName = z.string().trim().min(1);
const isoDate = z.string().regex(ISO_DATE, "Expected YYYY-MM-DD");

export const CreateResourceTypeInput = z.object({
  name: positiveName.max(160),
  category: positiveName.max(120),
  description: optionalTrimmed,
  unit: positiveName.max(60),
  trackingMode: ResourceTrackingMode,
});
export type CreateResourceTypeInput = z.infer<typeof CreateResourceTypeInput>;

export const UpdateResourceTypeInput = z
  .object({
    name: positiveName.max(160).optional(),
    category: positiveName.max(120).optional(),
    description: z.string().trim().optional(),
    unit: positiveName.max(60).optional(),
    trackingMode: ResourceTrackingMode.optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateResourceTypeInput = z.infer<typeof UpdateResourceTypeInput>;

export const CreateResourceLocationInput = z.object({
  code: positiveName.max(60),
  name: positiveName.max(160),
  description: optionalTrimmed,
});
export type CreateResourceLocationInput = z.infer<
  typeof CreateResourceLocationInput
>;

export const UpdateResourceLocationInput = z
  .object({
    code: positiveName.max(60).optional(),
    name: positiveName.max(160).optional(),
    description: z.string().trim().optional(),
    active: z.boolean().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one field must be provided",
  });
export type UpdateResourceLocationInput = z.infer<
  typeof UpdateResourceLocationInput
>;

export const AssignResourceResponsibilityInput = z
  .object({
    userId: z.string().uuid(),
    responsibility: ResourceResponsibilityType,
    locationId: z.string().uuid().nullable().optional(),
    effectiveFrom: isoDate,
    effectiveTo: isoDate.nullable().optional(),
    reason: optionalTrimmed,
  })
  .superRefine((value, ctx) => {
    if (
      value.responsibility === "RESOURCE_COORDINATOR" &&
      value.locationId != null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationId"],
        message: "Resource Coordinator is programme-scoped, not location-scoped",
      });
    }
    if (
      value.responsibility === "LAB_CUSTODIAN" &&
      value.locationId == null
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["locationId"],
        message: "Lab Custodian requires a resource location",
      });
    }
    if (
      value.effectiveTo != null &&
      value.effectiveTo < value.effectiveFrom
    ) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["effectiveTo"],
        message: "Effective end date cannot be before the start date",
      });
    }
  });
export type AssignResourceResponsibilityInput = z.infer<
  typeof AssignResourceResponsibilityInput
>;

export const EndResourceResponsibilityInput = z.object({
  effectiveTo: isoDate,
  reason: positiveName.max(500),
});
export type EndResourceResponsibilityInput = z.infer<
  typeof EndResourceResponsibilityInput
>;

export const RenewResourceResponsibilityInput = z.object({
  effectiveTo: isoDate.nullable(),
  reason: positiveName.max(500),
});
export type RenewResourceResponsibilityInput = z.infer<
  typeof RenewResourceResponsibilityInput
>;

export const HandoverResourceResponsibilityInput = z.object({
  incomingUserId: z.string().uuid(),
  effectiveDate: isoDate,
  reason: positiveName.max(500),
});
export type HandoverResourceResponsibilityInput = z.infer<
  typeof HandoverResourceResponsibilityInput
>;

export interface ResourceTypeView {
  id: string;
  programmeId: string;
  name: string;
  category: string;
  description: string;
  unit: string;
  trackingMode: ResourceTrackingMode;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceLocationView {
  id: string;
  programmeId: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceResponsibilityView {
  id: string;
  programmeId: string;
  responsibility: ResourceResponsibilityType;
  user: { id: string; name: string; email: string };
  location: { id: string; code: string; name: string } | null;
  effectiveFrom: string;
  effectiveTo: string | null;
  assignedBy: { id: string; name: string };
  reason: string;
  activeNow: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ResourceResponsibilityAuditEventView {
  id: string;
  assignmentId: string | null;
  programmeId: string;
  actor: { id: string; name: string };
  action: ResourceResponsibilityAuditAction;
  reason: string;
  details: unknown | null;
  createdAt: string;
}

export interface InventoryCapabilitiesView {
  programmeId: string;
  capabilities: InventoryCapability[];
  responsibilities: ResourceResponsibilityType[];
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  COURSE_TYPES,
  CreateCourseInput,
  courseTypeLabel,
  type CourseType,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dse-pms/ui";
import type { CourseView } from "@/lib/courses";

export type CourseFormValues = {
  code: string;
  title: string;
  description?: string;
  // Syllabus Course Information — §4 credits, §5 prerequisites, §11 type.
  credits?: number | null;
  prerequisites?: string;
  courseType?: CourseType | null;
  totalSltHours?: number | null;
};

interface CourseFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: CourseView | null;
  onSubmit: (values: CourseFormValues) => Promise<void>;
  submitting?: boolean;
}

// The Select item value can't be "" (that's reserved for "nothing selected"),
// so optional/clearable fields use this sentinel and map back to "" at the edges.
const NOT_SET = "__not_set__";

// base-ui's <Select.Value> renders the raw value unless the Root gets an `items`
// map (value -> label); without it the trigger would show the enum/lecturer id.
const COURSE_TYPE_ITEMS: Record<string, string> = {
  [NOT_SET]: "— Not set —",
  ...Object.fromEntries(COURSE_TYPES.map((t) => [t, courseTypeLabel(t)])),
};

export function CourseForm({
  open,
  onOpenChange,
  editing,
  onSubmit,
  submitting,
}: CourseFormProps) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseFormValues>({
    resolver: zodResolver(CreateCourseInput),
    defaultValues: { code: "", title: "", description: "", prerequisites: "" },
  });

  // Credits (§4) and course type (§11) live in local state so an empty choice
  // submits as null rather than tripping the shared input resolver.
  const [credits, setCredits] = useState<string>("");
  const [courseType, setCourseType] = useState<string>("");
  const [totalSltHours, setTotalSltHours] = useState<string>("");

  useEffect(() => {
    if (open) {
      reset(
        editing
          ? {
              code: editing.code,
              title: editing.title,
              description: editing.description ?? "",
              prerequisites: editing.prerequisites ?? "",
            }
          : { code: "", title: "", description: "", prerequisites: "" },
      );
      setCredits(editing?.credits != null ? String(editing.credits) : "");
      setCourseType(editing?.courseType ?? "");
      setTotalSltHours(editing?.totalSltHours != null ? String(editing.totalSltHours) : "");
    }
  }, [open, editing, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit course" : "Add course"}</DialogTitle>
          <DialogDescription>
            {editing ? "Update course details." : "Create a new course."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            // Normalise "" (not set) to null for the API.
            await onSubmit({
              ...values,
              prerequisites: values.prerequisites?.trim() || undefined,
              credits: credits ? Number(credits) : null,
              courseType: (courseType || null) as CourseType | null,
              totalSltHours: totalSltHours ? Number(totalSltHours) : null,
            });
          })}
          className="space-y-4"
        >
          <Field label="Code" error={errors.code?.message}>
            <Input placeholder="CS101" {...register("code")} />
          </Field>
          <Field label="Title" error={errors.title?.message}>
            <Input placeholder="Introduction to Programming" {...register("title")} />
          </Field>
          <Field label="Description" error={errors.description?.message}>
            <Input placeholder="Optional" {...register("description")} />
          </Field>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Credits (§4)">
              <Input
                type="number"
                min={1}
                max={30}
                placeholder="3"
                value={credits}
                onChange={(e) => setCredits(e.target.value)}
              />
            </Field>
            <Field label="Total SLT (hours)">
              <Input
                type="number"
                min={0}
                placeholder="120"
                value={totalSltHours}
                onChange={(e) => setTotalSltHours(e.target.value)}
              />
            </Field>
            <Field label="Course type (§11)">
              <Select
                items={COURSE_TYPE_ITEMS}
                value={courseType === "" ? NOT_SET : courseType}
                onValueChange={(v) => setCourseType(v && v !== NOT_SET ? v : "")}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NOT_SET}>— Not set —</SelectItem>
                  {COURSE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {courseTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
          </div>
          <Field label="Pre-requisites (§5)" error={errors.prerequisites?.message}>
            <Input
              placeholder="e.g. Math I–III; Statistics I–II (optional)"
              {...register("prerequisites")}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Add course"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <span className="text-sm font-medium text-foreground">{label}</span>
      {children}
      {error ? <span className="block text-xs text-status-live">{error}</span> : null}
    </label>
  );
}

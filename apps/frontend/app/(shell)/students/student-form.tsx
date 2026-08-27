"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  CreateStudentInput,
  STUDENT_STATUSES,
  type Student,
} from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  FormFieldLabel,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@dse-pms/ui";

export interface StudentFormValues extends CreateStudentInput {}

interface StudentFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** When set, the form edits this student; otherwise it creates a new one. */
  editing?: Student | null;
  onSubmit: (values: StudentFormValues) => Promise<void>;
  submitting?: boolean;
}

const emptyProfile = {
  khmerFamilyName: "",
  khmerGivenName: "",
  latinFamilyName: "",
  latinGivenName: "",
  gender: "",
};

/** Add/Edit dialog backed by react-hook-form + the shared Zod schema. */
export function StudentForm({
  open,
  onOpenChange,
  editing,
  onSubmit,
  submitting,
}: StudentFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<StudentFormValues>({
    resolver: zodResolver(CreateStudentInput),
    defaultValues: {
      name: "",
      email: "",
      studentId: "",
      status: "Active",
      profile: emptyProfile,
    },
  });

  useEffect(() => {
    if (!open) return;
    reset(
      editing
        ? {
            name: editing.name,
            email: editing.email ?? "",
            studentId: editing.studentId,
            status: editing.status,
            profile: {
              khmerFamilyName: editing.profile?.khmerFamilyName ?? "",
              khmerGivenName: editing.profile?.khmerGivenName ?? "",
              latinFamilyName: editing.profile?.latinFamilyName ?? "",
              latinGivenName: editing.profile?.latinGivenName ?? "",
              gender: editing.profile?.gender ?? "",
            },
          }
        : {
            name: "",
            email: "",
            studentId: "",
            status: "Active",
            profile: emptyProfile,
          },
    );
  }, [open, editing, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit student" : "Add student"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the student's roster identity and optional profile details."
              : "Create a student roster record. Email can be added later when portal access is provisioned."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            await onSubmit(values);
          })}
          className="space-y-5"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Display name" error={errors.name?.message} required>
              <Input placeholder="Seng Kimhour" {...register("name")} required />
            </Field>
            <Field label="Student ID" error={errors.studentId?.message} required>
              <Input placeholder="Official student ID" {...register("studentId")} required />
            </Field>
            <Field label="Email (optional)" error={errors.email?.message}>
              <Input type="email" placeholder="Add when officially available" {...register("email")} />
            </Field>
            <Field label="Status" error={errors.status?.message} required>
              <Controller
                control={control}
                name="status"
                render={({ field }) => (
                  <Select value={field.value} onValueChange={field.onChange}>
                    <SelectTrigger aria-required="true">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STUDENT_STATUSES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
            </Field>
          </div>

          <div className="space-y-3 border-t border-border pt-4">
            <div>
              <h3 className="text-sm font-semibold text-foreground">Bilingual roster profile</h3>
              <p className="text-xs text-muted-foreground">
                Keep source-supported Khmer/Latin name parts separate. Leave unknown values blank rather than guessing.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Khmer family name" error={errors.profile?.khmerFamilyName?.message}>
                <Input {...register("profile.khmerFamilyName")} />
              </Field>
              <Field label="Khmer given name" error={errors.profile?.khmerGivenName?.message}>
                <Input {...register("profile.khmerGivenName")} />
              </Field>
              <Field label="Latin family name" error={errors.profile?.latinFamilyName?.message}>
                <Input {...register("profile.latinFamilyName")} />
              </Field>
              <Field label="Latin given name" error={errors.profile?.latinGivenName?.message}>
                <Input {...register("profile.latinGivenName")} />
              </Field>
              <Field label="Gender" error={errors.profile?.gender?.message}>
                <Input placeholder="Use the official roster value" {...register("profile.gender")} />
              </Field>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Saving…" : editing ? "Save changes" : "Add student"}
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
  required = false,
  children,
}: {
  label: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1.5">
      <FormFieldLabel required={required}>{label}</FormFieldLabel>
      {children}
      {error ? <span className="block text-xs text-status-live">{error}</span> : null}
    </label>
  );
}

"use client";

import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateLecturerInput, type Lecturer } from "@dse-pms/shared-types";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Input,
  Switch,
} from "@dse-pms/ui";

export type LecturerFormValues = {
  name: string;
  email: string;
  title?: string;
  qualification?: string;
  phone?: string;
};

interface LecturerFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing?: Lecturer | null;
  onSubmit: (values: LecturerFormValues, giveDseAccess: boolean) => Promise<void>;
  submitting?: boolean;
  canGrantAccess?: boolean;
}

const empty: LecturerFormValues = { name: "", email: "", title: "", qualification: "", phone: "" };

export function LecturerForm({
  open,
  onOpenChange,
  editing,
  onSubmit,
  submitting,
  canGrantAccess = false,
}: LecturerFormProps) {
  const [giveDseAccess, setGiveDseAccess] = useState(true);
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<LecturerFormValues>({
    resolver: zodResolver(CreateLecturerInput),
    defaultValues: empty,
  });

  useEffect(() => {
    if (open) {
      setGiveDseAccess(true);
      reset(
        editing
          ? {
              name: editing.name,
              email: editing.email,
              title: editing.title ?? "",
              qualification: editing.qualification ?? "",
              phone: editing.phone ?? "",
            }
          : empty,
      );
    }
  }, [open, editing, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? "Edit lecturer" : "Add lecturer"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the lecturer's details. Qualification and phone appear on course syllabi."
              : "Add the lecturer's academic profile and, if needed, invite them to access DSE."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={handleSubmit(async (values) => {
            // Send undefined for blank optionals so they store as null, not "".
            await onSubmit(
              {
                ...values,
                title: values.title || undefined,
                qualification: values.qualification || undefined,
                phone: values.phone || undefined,
              },
              !editing && canGrantAccess && giveDseAccess,
            );
          })}
          className="space-y-4"
        >
          <Field label="Name" error={errors.name?.message}>
            <Input placeholder="Chim Seyha" {...register("name")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input placeholder="chim.seyha@rupp.edu.kh" {...register("email")} />
          </Field>
          <Field label="Title" error={errors.title?.message}>
            <Input placeholder="Mr. / Ms. / Dr. / Assoc. Prof. (optional)" {...register("title")} />
          </Field>
          <Field label="Qualification" error={errors.qualification?.message}>
            <Input placeholder="Master's degree in computer science (optional)" {...register("qualification")} />
          </Field>
          <Field label="Telephone" error={errors.phone?.message}>
            <Input placeholder="096 5321 532 (optional)" {...register("phone")} />
          </Field>

          {!editing && canGrantAccess ? (
            <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/30 p-4">
              <div className="space-y-1 pr-4">
                <div className="text-sm font-medium text-foreground">Give this lecturer access to DSE</div>
                <div className="text-xs leading-5 text-muted-foreground">
                  Send an invitation email so they can set their password and sign in. Turn this off for a profile-only lecturer.
                </div>
              </div>
              <Switch
                checked={giveDseAccess}
                onCheckedChange={setGiveDseAccess}
                aria-label="Give this lecturer access to DSE"
              />
            </div>
          ) : null}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting
                ? "Saving…"
                : editing
                  ? "Save changes"
                  : canGrantAccess && giveDseAccess
                    ? "Add lecturer & send invite"
                    : "Add lecturer"}
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

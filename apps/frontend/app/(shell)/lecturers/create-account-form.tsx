"use client";

import { useEffect } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { CreateAccountInput, INVITABLE_ROLES } from "@dse-pms/shared-types";
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

export type CreateAccountValues = CreateAccountInput;

interface CreateAccountFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (values: CreateAccountValues) => Promise<void>;
  submitting?: boolean;
}

const ROLE_LABELS: Record<(typeof INVITABLE_ROLES)[number], string> = {
  lecturer: "Lecturer",
  program_coordinator: "Program Coordinator",
  program_secretary: "Program Secretary",
  qa_reviewer: "QA Reviewer",
};

const empty: CreateAccountValues = { name: "", email: "", role: "lecturer" };

/**
 * Admin-only: provision a login account for one of the invitable roles
 * (issue #101 follow-up — admin/student are deliberately not offered here,
 * see INVITABLE_ROLES). For `lecturer`, this is distinct from "Add Lecturer"
 * (which creates a profile only) — this sends a Supabase invite so the
 * invitee sets their own password and can sign in.
 */
export function CreateAccountForm({ open, onOpenChange, onSubmit, submitting }: CreateAccountFormProps) {
  const {
    register,
    control,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CreateAccountValues>({
    resolver: zodResolver(CreateAccountInput),
    defaultValues: empty,
  });

  useEffect(() => {
    if (open) reset(empty);
  }, [open, reset]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Create login account</DialogTitle>
          <DialogDescription>
            Sends an invite email so the invitee can set a password and sign in. For a lecturer,
            this also creates or links their lecturer profile automatically.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          <Field label="Name" error={errors.name?.message}>
            <Input placeholder="Chim Seyha" {...register("name")} />
          </Field>
          <Field label="Email" error={errors.email?.message}>
            <Input placeholder="chim.seyha@rupp.edu.kh" {...register("email")} />
          </Field>
          <Field label="Role" error={errors.role?.message}>
            <Controller
              control={control}
              name="role"
              render={({ field }) => (
                <Select value={field.value} onValueChange={field.onChange}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITABLE_ROLES.map((role) => (
                      <SelectItem key={role} value={role}>
                        {ROLE_LABELS[role]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            />
          </Field>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting ? "Inviting…" : "Send invite"}
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

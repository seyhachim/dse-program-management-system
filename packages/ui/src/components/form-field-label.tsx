"use client";

import * as React from "react";

import { cn } from "../lib/cn.ts";

export interface FormFieldLabelProps extends React.ComponentProps<"span"> {
  required?: boolean;
  optional?: boolean;
}

/**
 * Consistent label text for form controls.
 *
 * `required` is presentation/accessibility guidance only; validation remains
 * owned by the form/schema. Pair it with the control's native `required` or
 * `aria-required` state where applicable.
 */
function FormFieldLabel({
  required = false,
  optional = false,
  className,
  children,
  ...props
}: FormFieldLabelProps) {
  return (
    <span className={cn("text-sm font-medium text-foreground", className)} {...props}>
      {children}
      {required ? (
        <span className="ml-1 text-error" aria-hidden="true">
          *
        </span>
      ) : null}
      {optional ? (
        <span className="ml-1 font-normal text-muted-foreground">(Optional)</span>
      ) : null}
    </span>
  );
}

export { FormFieldLabel };

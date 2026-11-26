'use client';

import { useFormStatus } from 'react-dom';

import { Button, type ButtonProps } from '@/components/ui/button';

/** A submit button that asks first. Put it inside the form whose action it should run. */
export function ConfirmButton({ confirm: question, children, ...props }: ButtonProps & { confirm: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      disabled={pending || props.disabled}
      onClick={(e) => {
        if (!window.confirm(question)) e.preventDefault();
      }}
      {...props}
    >
      {pending ? 'Working…' : children}
    </Button>
  );
}

export function SubmitButton({ children, ...props }: ButtonProps) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending || props.disabled} {...props}>
      {pending ? 'Working…' : children}
    </Button>
  );
}

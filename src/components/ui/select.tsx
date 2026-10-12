// SPDX-License-Identifier: AGPL-3.0-only
import type { ComponentProps } from 'react';
import { cn } from '@/lib/utils';
import { controlClass } from './input';

export function Select({ className, ...props }: ComponentProps<'select'>) {
  return <select className={cn(controlClass, 'h-8 pr-8', className)} {...props} />;
}

import type { HTMLAttributes, ReactNode } from 'react';

interface PanelProps extends HTMLAttributes<HTMLElement> {
  readonly children: ReactNode;
  readonly as?: 'section' | 'aside';
}

export function Panel({ children, className = '', as: Element = 'section', ...props }: PanelProps) {
  return (
    <Element className={`panel ${className}`.trim()} {...props}>
      {children}
    </Element>
  );
}

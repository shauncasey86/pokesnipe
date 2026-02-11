import type { ReactNode, CSSProperties } from 'react';

export default function GradBorder({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="grad-border" style={style}>
      {children}
    </div>
  );
}

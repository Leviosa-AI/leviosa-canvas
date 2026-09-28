// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import type { AnchorHTMLAttributes, ReactNode } from "react";

/** `next/link` 자리. 그냥 `<a>` 다. */
export default function Link({
  href,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; children?: ReactNode }) {
  return (
    <a href={href} {...rest}>
      {children}
    </a>
  );
}

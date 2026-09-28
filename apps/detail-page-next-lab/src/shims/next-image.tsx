// Copyright © 2026 주식회사레비오사에이아이. All rights reserved. See LICENSE.
import type { ImgHTMLAttributes } from "react";

/** `next/image` 자리. Next 밖에서는 그냥 `<img>` 다 — `fill`·`unoptimized` 는 버린다. */
export default function Image({
  fill,
  unoptimized,
  ...rest
}: ImgHTMLAttributes<HTMLImageElement> & { fill?: boolean; unoptimized?: boolean }) {
  void fill;
  void unoptimized;
  return <img {...rest} />;
}

import type { MenuPhotoProps } from "./MenuPhoto";

/**
 * A dish photo on web: a bare `<img>` with `loading="lazy"`, so a long menu on an old phone
 * fetches only the photos that scroll into view instead of every upload at once. Photos can be
 * up to 2 MB each, which is the reason this is not the shared image component.
 */
export function MenuPhoto({ uri, size }: MenuPhotoProps) {
  return (
    <img
      src={uri}
      alt=""
      loading="lazy"
      decoding="async"
      width={size}
      height={size}
      style={{
        width: size,
        height: size,
        borderRadius: 10,
        objectFit: "cover",
        backgroundColor: "rgba(128,128,128,0.15)",
        flexShrink: 0,
      }}
    />
  );
}

export default MenuPhoto;

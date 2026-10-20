import { Image } from "expo-image";
import { resolveServerUrl } from "@/utils/serverUrl";
import { styles } from "./MenuPhoto.styles";

export interface MenuPhotoProps {
  uri: string;
  size: number;
}

/**
 * A dish photo off web. Decorative: the dish's name is printed beside it, so the picture adds
 * nothing a screen reader would need read out. The web build is `MenuPhoto.web.tsx`, a plain
 * `<img>` that the browser can load lazily.
 */
export function MenuPhoto({ uri, size }: MenuPhotoProps) {
  return (
    <Image
      source={{ uri: resolveServerUrl(uri) }}
      style={[styles.photo, { width: size, height: size }]}
      contentFit="cover"
      accessible={false}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    />
  );
}

export default MenuPhoto;

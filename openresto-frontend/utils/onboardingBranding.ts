/** `#rrggbb`, which is all the server takes; an empty field means the platform's own colour. */
export const isHexColor = (text: string): boolean => /^#[0-9a-fA-F]{6}$/.test(text);

export const isValidBrandColor = (text: string): boolean => text === "" || isHexColor(text);

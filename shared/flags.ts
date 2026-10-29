/** Colour flags a word can carry (0 = none), like Anki's flags. Users can rename them in settings. */
export const FLAGS = [1, 2, 3, 4, 5] as const;

export type Flag = 0 | (typeof FLAGS)[number];

export const FLAG_NAME_MAX = 30;

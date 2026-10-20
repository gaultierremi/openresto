import { DEFAULT_TABLE_SEATS } from "@/constants/onboarding";
import type { OnboardingLayout } from "@/api/onboarding";

export interface DraftTable {
  key: string;
  id: number | null;
  name: string;
  seats: number;
}

export interface DraftRoom {
  key: string;
  id: number | null;
  name: string;
  tables: DraftTable[];
}

let counter = 0;
/** A handle for a row that has no server id yet; never sent. */
export const newKey = (): string => `draft-${(counter += 1)}`;

const blankTable = (): DraftTable => ({
  key: newKey(),
  id: null,
  name: "",
  seats: DEFAULT_TABLE_SEATS,
});

const blankRoom = (name: string): DraftRoom => ({
  key: newKey(),
  id: null,
  name,
  tables: [blankTable()],
});

/** The saved layout as a draft; a restaurant with none starts with one room and one table. */
export function draftFromLayout(layout: OnboardingLayout, defaultRoomName: string): DraftRoom[] {
  if (layout.sections.length === 0) return [blankRoom(defaultRoomName)];
  return layout.sections.map((section) => ({
    key: newKey(),
    id: section.id ?? null,
    name: section.name,
    tables: section.tables.map((table) => ({
      key: newKey(),
      id: table.id ?? null,
      name: table.name ?? "",
      seats: table.seats,
    })),
  }));
}

/**
 * The whole layout as the server wants it. Rows that exist carry their id, new ones carry none,
 * and what is missing is what the server removes.
 */
export function layoutFromDraft(rooms: DraftRoom[]): OnboardingLayout {
  return {
    sections: rooms.map((room) => ({
      ...(room.id === null ? {} : { id: room.id }),
      name: room.name.trim(),
      tables: room.tables.map((table) => ({
        ...(table.id === null ? {} : { id: table.id }),
        name: table.name.trim() === "" ? null : table.name.trim(),
        seats: table.seats,
      })),
    })),
  };
}

export const tableCount = (rooms: DraftRoom[]): number =>
  rooms.reduce((sum, room) => sum + room.tables.length, 0);

/** The key of the first room with no name, which the server would refuse. */
export const unnamedRoom = (rooms: DraftRoom[]): string | null =>
  rooms.find((room) => room.name.trim() === "")?.key ?? null;

export const addRoom = (rooms: DraftRoom[], name: string): DraftRoom[] => [
  ...rooms,
  blankRoom(name),
];

export const removeRoom = (rooms: DraftRoom[], roomKey: string): DraftRoom[] =>
  rooms.filter((room) => room.key !== roomKey);

export const renameRoom = (rooms: DraftRoom[], roomKey: string, name: string): DraftRoom[] =>
  rooms.map((room) => (room.key === roomKey ? { ...room, name } : room));

export const addTable = (rooms: DraftRoom[], roomKey: string): DraftRoom[] =>
  rooms.map((room) =>
    room.key === roomKey ? { ...room, tables: [...room.tables, blankTable()] } : room
  );

export const removeTable = (rooms: DraftRoom[], roomKey: string, tableKey: string): DraftRoom[] =>
  rooms.map((room) =>
    room.key === roomKey
      ? { ...room, tables: room.tables.filter((table) => table.key !== tableKey) }
      : room
  );

export const patchTable = (
  rooms: DraftRoom[],
  roomKey: string,
  tableKey: string,
  patch: Partial<Pick<DraftTable, "name" | "seats">>
): DraftRoom[] =>
  rooms.map((room) =>
    room.key === roomKey
      ? {
          ...room,
          tables: room.tables.map((table) =>
            table.key === tableKey ? { ...table, ...patch } : table
          ),
        }
      : room
  );

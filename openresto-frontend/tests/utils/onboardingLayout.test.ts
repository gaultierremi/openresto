import {
  addRoom,
  addTable,
  draftFromLayout,
  layoutFromDraft,
  patchTable,
  removeRoom,
  removeTable,
  renameRoom,
  tableCount,
  unnamedRoom,
} from "@/utils/onboardingLayout";

const SAVED = {
  sections: [
    {
      id: 10,
      name: "Salle",
      tables: [
        { id: 100, name: "T1", seats: 4 },
        { id: 101, name: null, seats: 2 },
      ],
    },
    { id: 11, name: "Terrasse", tables: [{ id: 102, name: "", seats: 6 }] },
  ],
};

describe("draftFromLayout", () => {
  it("turns a saved layout into rows that remember their ids", () => {
    const rooms = draftFromLayout(SAVED, "Salle");
    expect(rooms.map((r) => r.id)).toEqual([10, 11]);
    expect(rooms[0].tables.map((t) => t.id)).toEqual([100, 101]);
    expect(rooms[0].tables[1].name).toBe("");
  });

  it("starts a restaurant with no layout on one room holding one table", () => {
    const rooms = draftFromLayout({ sections: [] }, "Dining room");
    expect(rooms).toHaveLength(1);
    expect(rooms[0]).toMatchObject({ id: null, name: "Dining room" });
    expect(rooms[0].tables).toHaveLength(1);
    expect(rooms[0].tables[0]).toMatchObject({ id: null, name: "", seats: 2 });
  });

  it("reads a row the server sent without an id, or with a null one, as new", () => {
    const rooms = draftFromLayout(
      {
        sections: [
          { name: "Salle", tables: [{ name: null, seats: 4 }] },
          { id: null, name: "Terrasse", tables: [{ id: null, name: "T9", seats: 2 }] },
        ],
      },
      "Salle"
    );
    expect(rooms.map((r) => r.id)).toEqual([null, null]);
    expect(rooms.flatMap((r) => r.tables.map((t) => t.id))).toEqual([null, null]);
  });

  it("gives every row its own handle", () => {
    const keys = draftFromLayout(SAVED, "Salle").flatMap((r) => [
      r.key,
      ...r.tables.map((t) => t.key),
    ]);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("layoutFromDraft", () => {
  it("sends the id of what exists and none for what is new", () => {
    let rooms = draftFromLayout(SAVED, "Salle");
    rooms = addTable(rooms, rooms[0].key);
    rooms = addRoom(rooms, "Patio");

    const sent = layoutFromDraft(rooms);

    expect(sent.sections[0]).toHaveProperty("id", 10);
    expect(sent.sections[0].tables[0]).toHaveProperty("id", 100);
    expect(sent.sections[0].tables[2]).not.toHaveProperty("id");
    expect(sent.sections[2]).not.toHaveProperty("id");
    expect(sent.sections[2].tables[0]).not.toHaveProperty("id");
  });

  it("trims names and sends a blank table name as none", () => {
    let rooms = draftFromLayout({ sections: [] }, "  Salle  ");
    rooms = patchTable(rooms, rooms[0].key, rooms[0].tables[0].key, { name: "  " });
    expect(layoutFromDraft(rooms).sections[0]).toMatchObject({
      name: "Salle",
      tables: [{ name: null, seats: 2 }],
    });
  });

  it("leaves a room out of the request once it is removed, which is what removes it", () => {
    let rooms = draftFromLayout(SAVED, "Salle");
    rooms = removeRoom(rooms, rooms[1].key);
    expect(layoutFromDraft(rooms).sections.map((s) => s.id)).toEqual([10]);
  });
});

describe("editing", () => {
  it("counts the tables of every room", () => {
    expect(tableCount(draftFromLayout(SAVED, "Salle"))).toBe(3);
  });

  it("removes one table and leaves the others", () => {
    let rooms = draftFromLayout(SAVED, "Salle");
    rooms = removeTable(rooms, rooms[0].key, rooms[0].tables[0].key);
    expect(rooms[0].tables.map((t) => t.id)).toEqual([101]);
    expect(rooms[1].tables).toHaveLength(1);
  });

  it("renames only the room asked", () => {
    let rooms = draftFromLayout(SAVED, "Salle");
    rooms = renameRoom(rooms, rooms[1].key, "Patio");
    expect(rooms.map((r) => r.name)).toEqual(["Salle", "Patio"]);
  });

  it("patches only the table asked", () => {
    let rooms = draftFromLayout(SAVED, "Salle");
    rooms = patchTable(rooms, rooms[0].key, rooms[0].tables[1].key, { seats: 8 });
    expect(rooms[0].tables.map((t) => t.seats)).toEqual([4, 8]);
    expect(rooms[1].tables[0].seats).toBe(6);
  });
});

describe("unnamedRoom", () => {
  it("names the first room with no name, and nothing when all have one", () => {
    let rooms = draftFromLayout(SAVED, "Salle");
    expect(unnamedRoom(rooms)).toBeNull();
    rooms = renameRoom(rooms, rooms[1].key, "   ");
    expect(unnamedRoom(rooms)).toBe(rooms[1].key);
  });
});

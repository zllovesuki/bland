import { customType } from "drizzle-orm/sqlite-core";

export const sqliteBytes = customType<{
  data: Uint8Array;
  driverData: ArrayBuffer | Uint8Array;
}>({
  dataType() {
    return "blob";
  },
  toDriver(value) {
    return value;
  },
  fromDriver(value) {
    return value instanceof Uint8Array ? value : new Uint8Array(value);
  },
});

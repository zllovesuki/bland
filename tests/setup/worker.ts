import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { readAppD1Migrations } from "@tests/worker/helpers/migrations";

await applyD1Migrations(env.DB, readAppD1Migrations());

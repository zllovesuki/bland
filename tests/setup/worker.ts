import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { installNoopTasksQueue } from "@tests/worker/helpers/queues";

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
installNoopTasksQueue(env);

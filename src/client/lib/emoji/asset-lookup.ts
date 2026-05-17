// Re-export of the shared, worker-safe emoji asset lookup. The client lazy
// loader in `./index.ts` dynamically imports this module so the generated
// ~54KB asset map stays out of the initial client bundle.
export { getEmojiAsset, getEmojiAssetUrl } from "@/shared/emoji/asset-lookup";

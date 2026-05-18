import type { ComponentType } from "react";
import type { IslandName, IslandPropsByName } from "@/sites/shared/island-schemas";
import { CopyCodeButton } from "./copy-code-button";
import { SiteOutlineController } from "./site-outline-controller";
import { SitesImage } from "./sites-image";

type IslandRegistry = {
  [K in IslandName]: ComponentType<IslandPropsByName[K]>;
};

export const ISLAND_REGISTRY: IslandRegistry = {
  "sites-image": SitesImage,
  "copy-code": CopyCodeButton,
  "site-outline-controller": SiteOutlineController,
};

export type { IslandName } from "@/sites/shared/island-schemas";

import type { ComponentType } from "react";

import type { IslandName, IslandPropsByName } from "@/sites/shared/island-schemas";

type IslandComponent<K extends IslandName> = ComponentType<IslandPropsByName[K]>;
type IslandLoader<K extends IslandName> = () => Promise<IslandComponent<K>>;
type HydrateRoot = typeof import("react-dom/client").hydrateRoot;
type ReadIslandProps = typeof import("@/sites/shared/island-schemas").readIslandProps;

const islandLoaders: { [K in IslandName]: IslandLoader<K> } = {
  "sites-image": () => import("@/sites/islands/sites-image").then((mod) => mod.SitesImage),
  "copy-code": () => import("@/sites/islands/copy-code-button").then((mod) => mod.CopyCodeButton),
  "site-outline-controller": () =>
    import("@/sites/islands/site-outline-controller").then((mod) => mod.SiteOutlineController),
};

export async function bootstrapIslands(): Promise<void> {
  const hosts = Array.from(document.querySelectorAll<HTMLElement>("[data-island]")).filter(isHydratableHost);
  if (hosts.length === 0) return;

  const [{ hydrateRoot }, { readIslandProps }] = await Promise.all([
    import("react-dom/client"),
    import("@/sites/shared/island-schemas"),
  ]);

  await Promise.all(
    hosts.map(async (host) => {
      const name = host.dataset.island;
      if (!isIslandName(name)) return;

      const root = host.querySelector<HTMLElement>("[data-island-root]");
      const template = host.querySelector<HTMLTemplateElement>("template[data-island-props]");
      if (!root || !template) return;

      await hydrateHost({ host, name, root, propsText: template.innerHTML, hydrateRoot, readIslandProps });
    }),
  );
}

async function hydrateHost({
  host,
  name,
  root,
  propsText,
  hydrateRoot,
  readIslandProps,
}: {
  host: HTMLElement;
  name: IslandName;
  root: HTMLElement;
  propsText: string;
  hydrateRoot: HydrateRoot;
  readIslandProps: ReadIslandProps;
}): Promise<void> {
  switch (name) {
    case "sites-image": {
      const props = readIslandProps(name, propsText);
      if (!props) return;
      const Component = await islandLoaders[name]();
      hydrateRoot(root, <Component {...props} />);
      break;
    }
    case "copy-code": {
      const props = readIslandProps(name, propsText);
      if (!props) return;
      const Component = await islandLoaders[name]();
      hydrateRoot(root, <Component {...props} />);
      break;
    }
    case "site-outline-controller": {
      const props = readIslandProps(name, propsText);
      if (!props) return;
      const Component = await islandLoaders[name]();
      hydrateRoot(root, <Component {...props} />);
      break;
    }
  }

  host.dataset.islandHydrated = "true";
}

function isHydratableHost(host: HTMLElement): boolean {
  return host.dataset.islandHydrated !== "true" && isIslandName(host.dataset.island);
}

function isIslandName(name: string | undefined): name is IslandName {
  return name === "sites-image" || name === "copy-code" || name === "site-outline-controller";
}

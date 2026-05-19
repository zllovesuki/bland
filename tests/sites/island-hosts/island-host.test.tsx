import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";

import { SiteIslandHost, serializeProps } from "@/sites/island-hosts/island-host";

describe("SiteIslandHost", () => {
  it("emits an island host with template props and root", () => {
    const html = renderToStaticMarkup(
      <SiteIslandHost name="sites-image" props={{ src: "/_assets/1/x", align: "left" }}>
        <span>body</span>
      </SiteIslandHost>,
    );
    expect(html).toContain('data-island="sites-image"');
    expect(html).toContain("<template");
    expect(html).toContain("data-island-props");
    expect(html).toContain("data-island-root");
    expect(html).toContain("<span>body</span>");
  });
});

describe("serializeProps", () => {
  it("escapes <, >, &, and line/paragraph separators", () => {
    const text = serializeProps({ s: '</template><script>alert("x")</script>&\u2028\u2029' });
    expect(text).not.toContain("</template>");
    expect(text).not.toContain("<script");
    expect(text).toContain("\\u003c");
    expect(text).toContain("\\u003e");
    expect(text).toContain("\\u0026");
    expect(text).toContain("\\u2028");
    expect(text).toContain("\\u2029");
  });

  it("leaves other characters unchanged", () => {
    expect(serializeProps({ s: "ok" })).toBe('{"s":"ok"}');
  });
});

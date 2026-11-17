import { beforeAll, describe, expect, it } from "vitest";

beforeAll(() => {
  process.env.ENCRYPTION_KEY = "test-key";
  process.env.APP_URL = "https://app.test";
});

describe("crypto", () => {
  it("round-trips and uses a fresh IV each time", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const a = encrypt("secret-token");
    const b = encrypt("secret-token");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe("secret-token");
  });
  it("rejects tampered ciphertext", async () => {
    const { encrypt, decrypt } = await import("@/lib/crypto");
    const raw = Buffer.from(encrypt("secret-token"), "base64");
    raw[raw.length - 1] ^= 1;
    expect(() => decrypt(raw.toString("base64"))).toThrow();
  });
});

describe("slots", () => {
  it("finds the next free weekly slots in the user's timezone", async () => {
    const { nextSlots } = await import("@/lib/slots");
    // Monday 2027-01-04 08:00 in Dhaka (UTC+6) = 02:00 UTC
    const from = new Date("2027-01-04T02:00:00Z");
    const slots = [{ dayOfWeek: 1, time: "09:00" }, { dayOfWeek: 3, time: "18:30" }];
    const out = nextSlots(slots, "Asia/Dhaka", new Set(), from, 3);
    expect(out.map((d) => d.toISOString())).toEqual([
      "2027-01-04T03:00:00.000Z",
      "2027-01-06T12:30:00.000Z",
      "2027-01-11T03:00:00.000Z",
    ]);
  });
  it("skips taken slots and times already past", async () => {
    const { nextSlots } = await import("@/lib/slots");
    const from = new Date("2027-01-04T04:00:00Z"); // 10:00 Dhaka, after the 09:00 slot
    const taken = new Set([new Date("2027-01-11T03:00:00Z").getTime()]);
    const [next] = nextSlots([{ dayOfWeek: 1, time: "09:00" }], "Asia/Dhaka", taken, from);
    expect(next.toISOString()).toBe("2027-01-18T03:00:00.000Z");
  });
  it("returns nothing without slots", async () => {
    const { nextSlots } = await import("@/lib/slots");
    expect(nextSlots([], "UTC", new Set(), new Date())).toEqual([]);
  });
});

describe("sheets helpers", () => {
  it("parses sheet URLs", async () => {
    const { parseSheetUrl } = await import("@/lib/sheets");
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit#gid=42")).toEqual({
      spreadsheetId: "1AbCdEfGhIjKlMnOpQrStUvWxYz012345",
      gid: "42",
    });
    expect(parseSheetUrl("https://docs.google.com/spreadsheets/d/1AbCdEfGhIjKlMnOpQrStUvWxYz012345/edit")?.gid).toBe("0");
    expect(parseSheetUrl("https://example.com/x")).toBeNull();
  });
  it("parses CSV with quotes, commas and newlines", async () => {
    const { parseCsv } = await import("@/lib/sheets");
    expect(parseCsv('a,b\r\n"x, ""y""","line1\nline2"\n')).toEqual([["a", "b"], ['x, "y"', "line1\nline2"]]);
  });
  it("reads dates and times in the given zone", async () => {
    const { parseWhen } = await import("@/lib/sheets");
    expect(parseWhen("2027-01-15", "09:30", "Asia/Dhaka")?.toISOString()).toBe("2027-01-15T03:30:00.000Z");
    expect(parseWhen("15/01/2027", "6:00 pm", "Asia/Dhaka")?.toISOString()).toBe("2027-01-15T12:00:00.000Z");
    expect(parseWhen("2027-01-15", "", "UTC")?.toISOString()).toBe("2027-01-15T09:00:00.000Z");
    expect(parseWhen("soon", "09:30", "UTC")).toBeNull();
  });
  it("matches accounts by platform, name and platform:name", async () => {
    const { matchAccount } = await import("@/lib/sheets");
    const accounts = [
      { id: "1", name: "My Shop", username: null, platform: "FACEBOOK" as const },
      { id: "2", name: "My Shop", username: "myshop", platform: "INSTAGRAM" as const },
      { id: "3", name: "Second", username: "second", platform: "INSTAGRAM" as const },
    ];
    expect(matchAccount("Facebook", accounts)).toMatchObject({ id: "1" });
    expect(matchAccount("instagram: @second", accounts)).toMatchObject({ id: "3" });
    expect(matchAccount("@myshop", accounts)).toMatchObject({ id: "2" });
    expect(typeof matchAccount("instagram", accounts)).toBe("string");
    expect(typeof matchAccount("My Shop", accounts)).toBe("string");
    expect(typeof matchAccount("nobody", accounts)).toBe("string");
  });
  it("converts Drive share links and builds column letters", async () => {
    const { directMediaUrl, columnLetter } = await import("@/lib/sheets");
    expect(directMediaUrl("https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view?usp=sharing")).toBe(
      "https://drive.google.com/uc?export=download&id=1AbCdEfGhIjKlMnOpQrStUvWxYz",
    );
    expect(directMediaUrl("https://cdn.example.com/a.jpg")).toBe("https://cdn.example.com/a.jpg");
    expect([columnLetter(0), columnLetter(9), columnLetter(26)]).toEqual(["A", "J", "AA"]);
  });
});

describe("ssrf guard", () => {
  it("flags private and loopback addresses", async () => {
    const { isPrivateIp } = await import("@/lib/ssrf");
    for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "::1", "fd00::1", "::ffff:10.0.0.1"]) {
      expect(isPrivateIp(ip), ip).toBe(true);
    }
    for (const ip of ["8.8.8.8", "172.32.0.1", "2606:4700:4700::1111"]) expect(isPrivateIp(ip), ip).toBe(false);
  });
  it("rejects non-http schemes and internal hosts", async () => {
    const { assertPublicUrl } = await import("@/lib/ssrf");
    await expect(assertPublicUrl("file:///etc/passwd")).rejects.toThrow();
    await expect(assertPublicUrl("http://127.0.0.1:6379/")).rejects.toThrow();
    await expect(assertPublicUrl("http://[::1]/")).rejects.toThrow();
  });
});

describe("provider validation", () => {
  it("enforces each network's content rules", async () => {
    const { getProvider } = await import("@/lib/providers");
    const img = [{ kind: "IMAGE" as const }];
    const vid = [{ kind: "VIDEO" as const }];
    const base = { caption: "hi", title: "", link: "", options: {} };
    expect(getProvider("FACEBOOK").validate({ ...base, media: [] })).toEqual([]);
    expect(getProvider("FACEBOOK").validate({ ...base, media: [...vid, ...img] })).not.toEqual([]);
    expect(getProvider("INSTAGRAM").validate({ ...base, media: [] })).not.toEqual([]);
    expect(getProvider("INSTAGRAM").validate({ ...base, media: img })).toEqual([]);
    expect(getProvider("YOUTUBE").validate({ ...base, media: vid })).not.toEqual([]); // no title
    expect(getProvider("YOUTUBE").validate({ ...base, title: "T", media: vid })).toEqual([]);
    expect(getProvider("PINTEREST").validate({ ...base, media: img })).not.toEqual([]); // no board
    expect(getProvider("PINTEREST").validate({ ...base, media: img, options: { boardId: "1" } })).toEqual([]);
  });
});

describe("advanced features", () => {
  it("parses RSS and Atom feeds", async () => {
    const { parseFeed } = await import("@/lib/feeds");
    const rss = `<?xml version="1.0"?><rss><channel><title>My &amp; Blog</title>
      <item><title><![CDATA[Hello <b>World</b>]]></title><link>https://a.test/1</link><guid>g1</guid>
        <description>&lt;p&gt;&lt;img src="https://a.test/i.jpg?x=1&amp;amp;y=2"&gt;&lt;/p&gt;</description></item>
      <item><title>Second</title><link>https://a.test/2</link><enclosure url="https://a.test/e.png" type="image/png"/></item>
    </channel></rss>`;
    const r = parseFeed(rss);
    expect(r.title).toBe("My & Blog");
    expect(r.entries).toEqual([
      { guid: "g1", title: "Hello World", link: "https://a.test/1", image: "https://a.test/i.jpg?x=1&y=2" },
      { guid: "https://a.test/2", title: "Second", link: "https://a.test/2", image: "https://a.test/e.png" },
    ]);
    const atom = `<feed xmlns="http://www.w3.org/2005/Atom"><title>Atom</title>
      <entry><title>One</title><id>tag:1</id><link rel="self" href="https://a.test/self"/><link rel="alternate" href="https://a.test/one"/></entry></feed>`;
    expect(parseFeed(atom).entries).toEqual([{ guid: "tag:1", title: "One", link: "https://a.test/one", image: "" }]);
  });
  it("adds UTM parameters without overwriting existing ones", async () => {
    const { withUtm } = await import("@/lib/links");
    expect(withUtm("https://shop.test/p?a=1", "INSTAGRAM", "spring")).toBe("https://shop.test/p?a=1&utm_source=instagram&utm_medium=social&utm_campaign=spring");
    expect(withUtm("https://shop.test/?utm_source=x", "FACEBOOK", "")).toBe("https://shop.test/?utm_source=x&utm_medium=social");
    expect(withUtm("not a url", "FACEBOOK", "c")).toBe("not a url");
  });
  it("reads engagement numbers defensively", async () => {
    const { readMetrics, engagement } = await import("@/lib/metrics-format");
    expect(engagement(readMetrics({ likes: 5, comments: 2, views: 100, saves: "x" }))).toBe(7);
    expect(readMetrics(null).views).toBe(0);
  });
});

import { describe, it, expect } from "vitest";
import { uniqueZipName } from "../../lib/download/zip-names";

describe("uniqueZipName", () => {
  it("returns a name unchanged when it isn't taken", () => {
    const taken = new Set<string>();
    expect(uniqueZipName(taken, "report.pdf")).toBe("report.pdf");
  });

  it("disambiguates a real collision -- e.g. two splitPdf outputs both named '..._p1.pdf'", () => {
    const taken = new Set<string>();
    expect(uniqueZipName(taken, "text_p1.pdf")).toBe("text_p1.pdf");
    expect(uniqueZipName(taken, "text_p1.pdf")).toBe("text_p1 (2).pdf");
  });

  it("disambiguates three-way collisions with increasing counters", () => {
    const taken = new Set<string>();
    expect(uniqueZipName(taken, "a.pdf")).toBe("a.pdf");
    expect(uniqueZipName(taken, "a.pdf")).toBe("a (2).pdf");
    expect(uniqueZipName(taken, "a.pdf")).toBe("a (3).pdf");
  });

  it("handles a name with no extension", () => {
    const taken = new Set<string>();
    expect(uniqueZipName(taken, "README")).toBe("README");
    expect(uniqueZipName(taken, "README")).toBe("README (2)");
  });

  it("never collides with an already-disambiguated name", () => {
    const taken = new Set<string>();
    uniqueZipName(taken, "a.pdf");
    uniqueZipName(taken, "a (2).pdf"); // pre-existing name that looks disambiguated
    const third = uniqueZipName(taken, "a.pdf");
    expect(third).toBe("a (3).pdf");
  });
});

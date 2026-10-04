import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { markdownToPptx } from "../../lib/conversion/engines/to-pptx";

const SAMPLE_MD = `# Title Slide

Intro paragraph.

## Highlights

- First point
- Second point
  - nested point

## Data

| Name | Score |
| --- | --- |
| Ada | 99 |
`;

describe("markdownToPptx", () => {
  it("produces a valid pptx with one slide per heading", async () => {
    const result = await markdownToPptx(Buffer.from(SAMPLE_MD, "utf-8"), "deck.md", {});
    expect(result.filename).toBe("deck.pptx");
    expect(result.buffer.length).toBeGreaterThan(0);

    const zip = await JSZip.loadAsync(result.buffer);
    const slideFiles = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p));
    expect(slideFiles.length).toBe(3);

    const slide1 = await zip.file("ppt/slides/slide1.xml")!.async("text");
    expect(slide1).toContain("Title Slide");

    const slide2 = await zip.file("ppt/slides/slide2.xml")!.async("text");
    expect(slide2).toContain("First point");

    const slide3 = await zip.file("ppt/slides/slide3.xml")!.async("text");
    expect(slide3).toContain("Ada");
  });

  it("rejects markdown with no convertible content", async () => {
    await expect(markdownToPptx(Buffer.from("", "utf-8"), "empty.md", {})).rejects.toMatchObject({
      code: "CORRUPTED_FILE",
    });
  });
});

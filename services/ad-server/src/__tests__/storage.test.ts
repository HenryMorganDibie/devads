import { describe, expect, it } from "vitest";
import { validateCreativeUpload } from "../lib/storage.js";

describe("validateCreativeUpload", () => {
  it("accepts an allowed image mime type under the size limit", () => {
    expect(validateCreativeUpload("image/png", 1024 * 1024, "IMAGE")).toBeNull();
  });

  it("rejects a disallowed mime type (executables, scripts, etc.)", () => {
    expect(validateCreativeUpload("application/x-msdownload", 1024, "IMAGE")).not.toBeNull();
    expect(validateCreativeUpload("text/html", 1024, "IMAGE")).not.toBeNull();
  });

  it("rejects an image over the 5MB limit", () => {
    expect(validateCreativeUpload("image/png", 6 * 1024 * 1024, "IMAGE")).not.toBeNull();
  });

  it("accepts an allowed video mime type under the size limit", () => {
    expect(validateCreativeUpload("video/mp4", 10 * 1024 * 1024, "VIDEO")).toBeNull();
  });

  it("rejects a video over the 25MB limit", () => {
    expect(validateCreativeUpload("video/mp4", 30 * 1024 * 1024, "VIDEO")).not.toBeNull();
  });

  it("rejects an image mime type submitted as a video upload and vice versa", () => {
    expect(validateCreativeUpload("image/png", 1024, "VIDEO")).not.toBeNull();
    expect(validateCreativeUpload("video/mp4", 1024, "IMAGE")).not.toBeNull();
  });
});

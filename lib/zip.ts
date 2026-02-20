import JSZip from "jszip";
import type { SkillFile } from "./types";

export async function generateZip(
  skillName: string,
  files: SkillFile[]
): Promise<Blob> {
  const zip = new JSZip();
  const folder = zip.folder(skillName)!;
  for (const file of files) {
    folder.file(file.path, file.content);
  }
  return zip.generateAsync({ type: "blob" });
}

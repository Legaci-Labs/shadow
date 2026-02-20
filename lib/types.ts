export interface SkillFile {
  path: string;
  content: string;
}

export interface SkillMetadata {
  skillName: string;
  totalLines: number;
  fileCount: number;
  estimatedTriggerPhrases: string[];
  relatedRepos?: Array<{
    name: string;
    url: string;
    relationship: string;
  }>;
}

export interface SkillData {
  files: SkillFile[];
  metadata: SkillMetadata;
}

import type { ExtensionAdapter, ExtensionDefinition } from "../types";
import { HyperFramesAdapter, RemotionAdapter } from "./npm";
import { GitSkillAdapter } from "./git";
import { PythonPackageAdapter } from "./python";
import { PlannedAdapter } from "./planned";

const adapters: Record<string, ExtensionAdapter> = {
  hyperframes: new HyperFramesAdapter(),
  remotion: new RemotionAdapter(),
  motionmaxxing: new GitSkillAdapter(),
  earshot: new PythonPackageAdapter(),
  shortcraft: new PlannedAdapter(),
  "3dviz": new PlannedAdapter(),
};

export function getAdapter(definition: ExtensionDefinition): ExtensionAdapter {
  return adapters[definition.id] ?? new PlannedAdapter();
}

export type { ExtensionAdapter };

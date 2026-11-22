import type {
  ExtensionContext,
  ExtensionDetection,
  ExtensionHealthResult,
  ExtensionOperationResult,
} from "../types";
import { BaseAdapter } from "./base";

export class PlannedAdapter extends BaseAdapter {
  async detect(): Promise<ExtensionDetection> {
    return {
      installed: false,
      version: null,
      path: null,
      detail: "Planned extension — no verified project is registered",
    };
  }

  async install(context: ExtensionContext): Promise<ExtensionOperationResult> {
    return {
      ok: false,
      message: `${context.definition.name} cannot be installed yet: FREMIQ has not verified its project, platform, installation procedure or license.`,
    };
  }

  async healthCheck(): Promise<ExtensionHealthResult> {
    return { health: "missing", detail: "Not available until the extension is verified" };
  }

  getCapabilities(): string[] {
    return ["planned"];
  }
}

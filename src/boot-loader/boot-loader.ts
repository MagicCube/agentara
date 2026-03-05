import { existsSync, mkdirSync } from "node:fs";

import { config, createLogger } from "@/shared";

const logger = createLogger("boot-loader");

/**
 * The BootLoader is the main entry point for the agentara application
 */
class BootLoader {
  /**
   * Bootstraps the application by verifying the integrity and then igniting the kernel.
   */
  public async bootstrap(): Promise<void> {
    await this._verifyIntegrity();
    await this._igniteKernel();
  }

  private async _verifyIntegrity(): Promise<void> {
    // TODO:
    // Checking if the `$AGENTARA_HOME` directory exists
    // - If not, create it, and copy everything from `./user-home` to `$AGENTARA_HOME`
    // - Initialize `config.yaml` with the default values
    if (!existsSync(config.paths.home)) {
      // Create the home directory
    }
    if (!existsSync(config.paths.data)) {
      mkdirSync(config.paths.data, { recursive: true });
    }
    process.env.DATA_PATH = config.paths.resolveDataFilePath("bunqueue.db");
  }

  private async _igniteKernel(): Promise<void> {
    const { kernel } = await import("@/kernel");
    const logo = `\n▗▄▖  ▗▄▄▖▗▄▄▄▖▗▖  ▗▖▗▄▄▄▖▗▄▖ ▗▄▄▖  ▗▄▖
▐▌ ▐▌▐▌   ▐▌   ▐▛▚▖▐▌  █ ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌
▐▛▀▜▌▐▌▝▜▌▐▛▀▀▘▐▌ ▝▜▌  █ ▐▛▀▜▌▐▛▀▚▖▐▛▀▜▌
▐▌ ▐▌▝▚▄▞▘▐▙▄▄▖▐▌  ▐▌  █ ▐▌ ▐▌▐▌ ▐▌▐▌ ▐▌`;
    console.info(
      "\x1b[31m" +
        logo +
        "\x1b[0m" +
        "\n\nCopyright (c) 2026 Agentara. All rights reserved.\nVisit https://github.com/agentara/agentara for more information.\n\n",
    );
    await kernel.start();
    logger.info("🚀 Agentara is now running...");
  }
}

export const bootLoader = new BootLoader();

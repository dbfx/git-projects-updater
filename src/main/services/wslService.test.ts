import { beforeEach, describe, expect, it, vi } from "vitest";
import { listWslDistros } from "./wslService";

const spawnSyncMock = vi.fn();

vi.mock("node:child_process", () => ({
  spawnSync: (...args: unknown[]) => spawnSyncMock(...args)
}));

describe("wslService", () => {
  beforeEach(() => {
    spawnSyncMock.mockReset();
  });

  it("parses UTF-16 distro names and default marker", () => {
    spawnSyncMock
      .mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from("Ubuntu\r\ndocker-desktop\r\n", "utf16le"),
        stderr: Buffer.alloc(0)
      })
      .mockReturnValueOnce({
        status: 0,
        stdout: Buffer.from(
          "  NAME              STATE           VERSION\r\n* Ubuntu            Running         2\r\n  docker-desktop    Stopped         2\r\n",
          "utf16le"
        ),
        stderr: Buffer.alloc(0)
      });

    const distros = listWslDistros();
    expect(distros).toEqual([
      { name: "Ubuntu", isDefault: true },
      { name: "docker-desktop", isDefault: false }
    ]);
  });
});

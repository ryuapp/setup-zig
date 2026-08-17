export const MINIMUM_SUPPORTED_VERSION = "0.16.0";

function compareVersions(left: string, right: string): number {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index++) {
    if ((a.at(index) || 0) !== (b.at(index) || 0)) {
      return (a.at(index) || 0) - (b.at(index) || 0);
    }
  }
  return 0;
}

function assertSupportedVersion(version: string): string {
  if (
    /^\d+\.\d+\.\d+$/.test(version) &&
    compareVersions(version, MINIMUM_SUPPORTED_VERSION) < 0
  ) {
    throw new Error(
      `Zig ${version} is unsupported; setup-zig requires Zig ${MINIMUM_SUPPORTED_VERSION} or newer`,
    );
  }
  return version;
}

export function resolveVersion(
  input: string,
  index: Record<string, unknown>,
): string {
  if (input && input !== "latest" && input !== "master") {
    return assertSupportedVersion(input.replace(/^v/, ""));
  }
  if (input === "master") return "master";
  const versions = Object.keys(index).filter((version) =>
    /^\d+\.\d+\.\d+$/.test(version) &&
    compareVersions(version, MINIMUM_SUPPORTED_VERSION) >= 0
  );
  if (!versions.length) {
    throw new Error("Zig download index contains no stable releases");
  }
  return versions.sort((a, b) =>
    b.localeCompare(a, undefined, { numeric: true })
  ).at(0)!;
}
